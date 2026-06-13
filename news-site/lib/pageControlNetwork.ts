import "server-only";

import { prisma } from "@/lib/db";
import { previousPeriod, rangeKey, eachDate } from "@/lib/fbInsightsRange";
import type { DayPoint } from "@/lib/facebookInsights";
import type { PagePost } from "@/lib/facebook";

/**
 * Page Control NETWORK rollup — aggregates the whole monitored-page set from data
 * ALREADY CACHED per page (the row-stats daily series in `MonitoredPageDailyCache`,
 * `MonitoredPage.followers` / `.totalPosts`, and cached posts in
 * `MonitoredPagePostsCache`). It makes **NO new Graph calls** and never bulk-fetches
 * pages live — so it's cheap at ~100+ pages on Vercel Hobby. The rollup itself is
 * cached ~1h per range in `AppSetting` (`pc_network_rollup_<rangeKey>`). Pages with
 * no cached daily series for the range are simply excluded; `coverage` reports
 * "N of M pages" so the UI can be honest about partial data.
 */

const ROLLUP_TTL_MS = 60 * 60 * 1000; // 1h
const ROLLUP_PREFIX = "pc_network_rollup_v2_"; // v2: + earnings totals/series

export type NetTotals = {
  reach: number | null;
  reachPrev: number | null;
  engagement: number | null;
  engagementPrev: number | null;
  followers: number | null;
  totalPosts: number | null;
  earnings: number | null;
  earningsPrev: number | null;
};
export type LeaderRow = { id: string; pageId: string; name: string; avatarUrl: string | null; reach: number; engagement: number; sparkReach: number[] };
export type NetPost = PagePost & { pageDbId: string; pageName: string; avatarUrl: string | null };
export type MoverRow = { id: string; name: string; avatarUrl: string | null; pct: number; cur: number; prev: number };
export type NetworkRollup = {
  coverage: { withData: number; total: number };
  totals: NetTotals;
  trendDays: DayPoint[];
  trendDaysPrev: DayPoint[];
  leaderboard: LeaderRow[];
  topPosts: NetPost[];
  risers: MoverRow[];
  fallers: MoverRow[];
  health: { growing: number; flat: number; shrinking: number };
  earningsDays: number[]; // per-day earnings sums across the (filtered) pages, for the KPI sparkline
};

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function parseDays(data: string): DayPoint[] {
  try {
    const a = JSON.parse(data);
    if (Array.isArray(a)) {
      return a
        .filter((x) => x && typeof x.date === "string")
        .map((x) => ({ date: x.date as string, reach: numOrNull(x.reach), engagement: numOrNull(x.engagement), follows: numOrNull(x.follows) }));
    }
  } catch {
    /* fall through */
  }
  return [];
}
function parsePosts(data: string): PagePost[] {
  try {
    const o = JSON.parse(data) as { posts?: unknown };
    if (Array.isArray(o.posts)) return o.posts as PagePost[];
  } catch {
    /* fall through */
  }
  return [];
}
function engagementOf(p: PagePost): number {
  return (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
}

type DaySum = Map<string, { reach: number; engagement: number; follows: number }>;
function addDaySum(acc: DaySum, d: DayPoint) {
  const s = acc.get(d.date) ?? { reach: 0, engagement: 0, follows: 0 };
  s.reach += d.reach ?? 0;
  s.engagement += d.engagement ?? 0;
  s.follows += d.follows ?? 0;
  acc.set(d.date, s);
}
function sumToDays(acc: DaySum): DayPoint[] {
  return [...acc.entries()]
    .map(([date, v]) => ({ date, reach: v.reach, engagement: v.engagement, follows: v.follows }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function parseRollup(data: string): NetworkRollup | null {
  try {
    const o = JSON.parse(data) as NetworkRollup;
    if (o && o.coverage && o.totals) return o;
  } catch {
    /* fall through */
  }
  return null;
}

/**
 * Aggregate the network rollup for a range from existing caches (no Graph calls).
 * `managerId` (optional) restricts the rollup to ONE manager's pages — cached
 * separately (`…_m_<managerId>`) so the all-pages and per-manager views don't collide.
 */
export async function getNetworkRollup(range: { from: string; to: string }, managerId: string | null = null, wantFresh = false): Promise<NetworkRollup> {
  const prev = previousPeriod(range.from, range.to);
  const dailyKey = rangeKey(prev.from, range.to); // the window key the row-stats fetch uses
  const cacheKey = ROLLUP_PREFIX + rangeKey(range.from, range.to) + (managerId ? `_m_${managerId}` : "");

  if (!wantFresh) {
    const cached = await prisma.appSetting.findUnique({ where: { key: cacheKey } }).catch(() => null);
    if (cached && Date.now() - cached.updatedAt.getTime() < ROLLUP_TTL_MS) {
      const parsed = parseRollup(cached.value);
      if (parsed) return parsed;
    }
  }

  const [pages, daily, postsCaches] = await Promise.all([
    prisma.monitoredPage.findMany({ where: managerId ? { managerId } : undefined, select: { id: true, pageId: true, pageName: true, avatarUrl: true, followers: true, totalPosts: true } }),
    prisma.monitoredPageDailyCache.findMany({ where: { rangeKey: dailyKey }, select: { monitoredPageId: true, data: true } }),
    prisma.monitoredPagePostsCache.findMany({ select: { monitoredPageId: true, data: true } }),
  ]);

  const dailyByPage = new Map(daily.map((d) => [d.monitoredPageId, parseDays(d.data)]));
  const curSum: DaySum = new Map();
  const prevSum: DaySum = new Map();
  let netReach: number | null = null;
  let netReachPrev: number | null = null;
  let netEng: number | null = null;
  let netEngPrev: number | null = null;
  const leaderboard: LeaderRow[] = [];
  const movers: MoverRow[] = [];
  let growing = 0;
  let flat = 0;
  let shrinking = 0;
  let withData = 0;

  for (const p of pages) {
    const days = dailyByPage.get(p.id);
    if (!days || days.length === 0) continue;
    withData++;
    let cReach: number | null = null;
    let cEng: number | null = null;
    let cFollows: number | null = null;
    let pReach: number | null = null;
    let pEng: number | null = null;
    const sparkReach: number[] = [];
    for (const d of days) {
      if (d.date >= range.from && d.date <= range.to) {
        if (d.reach != null) cReach = (cReach ?? 0) + d.reach;
        if (d.engagement != null) cEng = (cEng ?? 0) + d.engagement;
        if (d.follows != null) cFollows = (cFollows ?? 0) + d.follows;
        sparkReach.push(d.reach ?? 0);
        addDaySum(curSum, d);
      } else if (d.date >= prev.from && d.date <= prev.to) {
        if (d.reach != null) pReach = (pReach ?? 0) + d.reach;
        if (d.engagement != null) pEng = (pEng ?? 0) + d.engagement;
        addDaySum(prevSum, d);
      }
    }
    if (cReach != null) netReach = (netReach ?? 0) + cReach;
    if (pReach != null) netReachPrev = (netReachPrev ?? 0) + pReach;
    if (cEng != null) netEng = (netEng ?? 0) + cEng;
    if (pEng != null) netEngPrev = (netEngPrev ?? 0) + pEng;
    leaderboard.push({ id: p.id, pageId: p.pageId, name: p.pageName, avatarUrl: p.avatarUrl, reach: cReach ?? 0, engagement: cEng ?? 0, sparkReach });
    if (cReach != null && pReach != null && pReach > 0) {
      movers.push({ id: p.id, name: p.pageName, avatarUrl: p.avatarUrl, pct: ((cReach - pReach) / pReach) * 100, cur: cReach, prev: pReach });
    }
    if (cFollows != null) {
      if (cFollows > 0) growing++;
      else if (cFollows < 0) shrinking++;
      else flat++;
    }
  }

  let followers: number | null = null;
  let totalPosts: number | null = null;
  for (const p of pages) {
    if (p.followers != null) followers = (followers ?? 0) + p.followers;
    if (p.totalPosts != null) totalPosts = (totalPosts ?? 0) + p.totalPosts;
  }

  leaderboard.sort((a, b) => b.reach - a.reach);
  movers.sort((a, b) => b.pct - a.pct);
  const risers = movers.filter((m) => m.pct > 0).slice(0, 5);
  const fallers = movers.filter((m) => m.pct < 0).sort((a, b) => a.pct - b.pct).slice(0, 5);

  const pageMeta = new Map(pages.map((p) => [p.id, p]));
  const allPosts: NetPost[] = [];
  for (const pc of postsCaches) {
    const meta = pageMeta.get(pc.monitoredPageId);
    if (!meta) continue;
    for (const post of parsePosts(pc.data)) {
      allPosts.push({ ...post, pageDbId: meta.id, pageName: meta.pageName, avatarUrl: meta.avatarUrl });
    }
  }
  allPosts.sort((a, b) => engagementOf(b) - engagementOf(a) || (b.reach ?? 0) - (a.reach ?? 0));

  // Earnings (manager-entered, LOCAL) for the filtered pages — current + previous period
  // in one query, plus a per-day series for the KPI sparkline. No Graph.
  const pageIds = pages.map((p) => p.id);
  const earnRows = pageIds.length
    ? await prisma.pageEarning.findMany({ where: { monitoredPageId: { in: pageIds }, date: { gte: prev.from, lte: range.to } }, select: { date: true, amount: true } })
    : [];
  let earnings: number | null = null;
  let earningsPrev: number | null = null;
  const earnByDate = new Map<string, number>();
  for (const e of earnRows) {
    const amt = Number(e.amount);
    if (e.date >= range.from && e.date <= range.to) {
      earnings = (earnings ?? 0) + amt;
      earnByDate.set(e.date, (earnByDate.get(e.date) ?? 0) + amt);
    } else if (e.date >= prev.from && e.date <= prev.to) {
      earningsPrev = (earningsPrev ?? 0) + amt;
    }
  }
  const earningsDays = eachDate(range.from, range.to).map((d) => earnByDate.get(d) ?? 0);

  const rollup: NetworkRollup = {
    coverage: { withData, total: pages.length },
    totals: { reach: netReach, reachPrev: netReachPrev, engagement: netEng, engagementPrev: netEngPrev, followers, totalPosts, earnings, earningsPrev },
    trendDays: sumToDays(curSum),
    trendDaysPrev: sumToDays(prevSum),
    leaderboard: leaderboard.slice(0, 15),
    topPosts: allPosts.slice(0, 12),
    risers,
    fallers,
    health: { growing, flat, shrinking },
    earningsDays,
  };

  await prisma.appSetting
    .upsert({ where: { key: cacheKey }, create: { key: cacheKey, value: JSON.stringify(rollup), encrypted: false }, update: { value: JSON.stringify(rollup) } })
    .catch(() => {});

  return rollup;
}
