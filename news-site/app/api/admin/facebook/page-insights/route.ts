import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPostStats, permalinkForPost } from "@/lib/facebook";
import { getPageOverview, getPageDaily, type PageOverview, type DayPoint } from "@/lib/facebookInsights";
import { refreshPageAvatar, avatarIsStale } from "@/lib/facebookAvatars";
import { rangeToUnix, rangeKey, ppToday, ppDate, addDays, previousPeriod } from "@/lib/fbInsightsRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Serve a cached overview for ~12h before re-hitting the Graph API (the client's
// Refresh button forces a fresh fetch).
const FRESH_MS = 12 * 60 * 60 * 1000;
// Daily series TTL: short when the range includes today (today's numbers are
// partial + keep changing), long for fully-historical ranges (stable).
const DAILY_TTL_TODAY_MS = 3 * 60 * 60 * 1000;
const DAILY_TTL_PAST_MS = 24 * 60 * 60 * 1000;
const MAX_BATCH = 30;
const MAX_RANGE_DAYS = 92;
const TOP_POSTS_CANDIDATES = 40; // recent posts in range we pull live stats for

/** Bounded-concurrency async map (keeps Graph calls under control per request). */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize a from/to range (clamped to MAX_RANGE_DAYS). */
function parseRange(from: unknown, to: unknown): { from: string; to: string } | null {
  if (typeof from !== "string" || typeof to !== "string" || !DATE_RE.test(from) || !DATE_RE.test(to)) return null;
  let f = from <= to ? from : to;
  const t = from <= to ? to : from;
  const span = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseDays(data: string): DayPoint[] | null {
  try {
    const a = JSON.parse(data);
    if (Array.isArray(a)) {
      return a
        .filter((x) => x && typeof x.date === "string")
        .map((x) => ({ date: x.date as string, reach: numOrNull(x.reach), engagement: numOrNull(x.engagement), follows: numOrNull(x.follows) }));
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * One Page's day-by-day series for a range, served from the per-(page,range)
 * cache when fresh, else computed from the Graph API and cached. Token/permission
 * failures come back as `status: "reconnect"` with an empty series (never throws).
 */
async function dailyData(
  page: { id: string; pageId: string; accessToken: string },
  from: string,
  to: string,
  wantFresh: boolean,
): Promise<{ days: DayPoint[]; status: "ok" | "reconnect" }> {
  const key = rangeKey(from, to);
  const ttl = to >= ppToday() ? DAILY_TTL_TODAY_MS : DAILY_TTL_PAST_MS;

  if (!wantFresh) {
    const cached = await prisma.pageDailyCache
      .findUnique({ where: { facebookPageId_rangeKey: { facebookPageId: page.id, rangeKey: key } } })
      .catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
      const days = parseDays(cached.data);
      if (days) return { days, status: "ok" };
    }
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { days: [], status: "reconnect" };
  }

  const { since, until } = rangeToUnix(from, to);
  try {
    const res = await getPageDaily(page.pageId, token, since, until);
    await prisma.pageDailyCache
      .upsert({
        where: { facebookPageId_rangeKey: { facebookPageId: page.id, rangeKey: key } },
        create: { facebookPageId: page.id, rangeKey: key, data: JSON.stringify(res.days), fetchedAt: new Date() },
        update: { data: JSON.stringify(res.days), fetchedAt: new Date() },
      })
      .catch(() => {});
    return { days: res.days, status: "ok" };
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) return { days: [], status: "reconnect" };
    return { days: [], status: "ok" }; // other errors → empty (graceful), not reconnect
  }
}

type DailyAcc = Map<string, { reach: number | null; engagement: number | null; follows: number | null }>;

/** Null-preserving add of one Page's day into a running per-day sum. */
function addInto(acc: DailyAcc, dp: DayPoint): void {
  const cur = acc.get(dp.date) ?? { reach: null, engagement: null, follows: null };
  if (dp.reach != null) cur.reach = (cur.reach ?? 0) + dp.reach;
  if (dp.engagement != null) cur.engagement = (cur.engagement ?? 0) + dp.engagement;
  if (dp.follows != null) cur.follows = (cur.follows ?? 0) + dp.follows;
  acc.set(dp.date, cur);
}

function accToDays(acc: DailyAcc): DayPoint[] {
  return [...acc.entries()]
    .map(([date, v]) => ({ date, reach: v.reach, engagement: v.engagement, follows: v.follows }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Count of posts WE shared (status posted) per Phnom-Penh day, optionally for one Page. */
async function sharesByDay(from: string, to: string, pageDbId?: string): Promise<Record<string, number>> {
  const { since, until } = rangeToUnix(from, to);
  const rows = await prisma.scheduledPost.findMany({
    where: {
      status: "posted",
      postedAt: { gte: new Date(since * 1000), lt: new Date(until * 1000) },
      ...(pageDbId ? { facebookPageId: pageDbId } : {}),
    },
    select: { postedAt: true },
  });
  const map: Record<string, number> = {};
  for (const r of rows) {
    if (!r.postedAt) continue;
    const d = ppDate(r.postedAt);
    map[d] = (map[d] ?? 0) + 1;
  }
  return map;
}

function sumValues(map: Record<string, number>): number {
  return Object.values(map).reduce((s, n) => s + n, 0);
}

type OverviewRow = PageOverview & { pageDbId: string; avatarUrl: string | null; cachedAt: string };

function parseCache(data: string): PageOverview | null {
  try {
    const o = JSON.parse(data) as Partial<PageOverview>;
    if (o && (o.status === "ok" || o.status === "partial" || o.status === "reconnect")) {
      return {
        followers: typeof o.followers === "number" ? o.followers : null,
        reach28: typeof o.reach28 === "number" ? o.reach28 : null,
        engagement28: typeof o.engagement28 === "number" ? o.engagement28 : null,
        status: o.status,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * POST — batched Page overviews + (optional) day-by-day series for a range AND the
 * previous equal-length period (for the dashboard's % change + compare overlay).
 * Body: `{ pageDbIds, refresh?, from?, to? }`. One combined Graph fetch per Page
 * (prev-start..to) is split into current/previous, so the comparison costs no
 * extra Graph calls. Returns the BATCH SUMS as `daily` + `dailyPrev`; the client
 * adds batches up into the network totals — never one giant request.
 */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const { pageDbIds, refresh, from, to } = (body ?? {}) as {
    pageDbIds?: unknown;
    refresh?: unknown;
    from?: unknown;
    to?: unknown;
  };
  const ids = Array.isArray(pageDbIds) ? pageDbIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [], daily: [], dailyPrev: [] });
  const range = from != null && to != null ? parseRange(from, to) : null;
  const prev = range ? previousPeriod(range.from, range.to) : null;

  const batch = ids.slice(0, MAX_BATCH);
  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: batch } },
    select: { id: true, pageId: true, accessToken: true, avatarUrl: true, avatarFetchedAt: true, insightCache: true },
  });

  const now = Date.now();
  const wantFresh = refresh === true;
  const accCur: DailyAcc = new Map();
  const accPrev: DailyAcc = new Map();

  const rows = await mapLimit(pages, 6, async (p): Promise<OverviewRow> => {
    // Refresh the cached avatar as part of the insights flow when missing/stale.
    let avatarUrl = p.avatarUrl;
    if (avatarIsStale(p.avatarFetchedAt)) {
      avatarUrl = await refreshPageAvatar(p);
    }

    // One combined daily fetch (prev-start..to), split into current vs previous.
    if (range && prev) {
      const combined = await dailyData(p, prev.from, range.to, wantFresh);
      for (const dp of combined.days) {
        if (dp.date >= range.from && dp.date <= range.to) addInto(accCur, dp); // sync after await → safe
        else if (dp.date >= prev.from && dp.date <= prev.to) addInto(accPrev, dp);
      }
    }

    const cache = p.insightCache;
    if (!wantFresh && cache && now - cache.fetchedAt.getTime() < FRESH_MS) {
      const parsed = parseCache(cache.data);
      if (parsed) return { pageDbId: p.id, ...parsed, avatarUrl, cachedAt: cache.fetchedAt.toISOString() };
    }

    let overview: PageOverview;
    try {
      const token = decryptSecret(p.accessToken);
      overview = await getPageOverview(p.pageId, token);
    } catch {
      overview = { followers: null, reach28: null, engagement28: null, status: "reconnect" };
    }

    const fetchedAt = new Date();
    await prisma.pageInsightCache
      .upsert({
        where: { facebookPageId: p.id },
        create: { facebookPageId: p.id, data: JSON.stringify(overview), fetchedAt },
        update: { data: JSON.stringify(overview), fetchedAt },
      })
      .catch(() => {});

    return { pageDbId: p.id, ...overview, avatarUrl, cachedAt: fetchedAt.toISOString() };
  });

  return NextResponse.json({ ok: true, rows, daily: range ? accToDays(accCur) : [], dailyPrev: range ? accToDays(accPrev) : [] });
}

type RecentPost = {
  id: string;
  title: string;
  postedAt: string | null;
  permalink: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
};

/** This Page's most recent POSTED shares (from our own records) + live per-post
 *  stats — reuses the Results-tab `getPostStats`. One post failing → nulls, not a
 *  crash. Capped + concurrency-limited so the detail view stays fast. */
async function recentPostsForPage(pageDbId: string, token: string): Promise<RecentPost[]> {
  const rows = await prisma.scheduledPost.findMany({
    where: { facebookPageId: pageDbId, status: "posted", graphPostId: { not: null } },
    orderBy: { postedAt: "desc" },
    take: 8,
    include: { article: { select: { title: true } } },
  });
  return mapLimit(rows, 4, async (r): Promise<RecentPost> => {
    const postId = r.graphPostId as string;
    const base: RecentPost = {
      id: r.id,
      title: r.article?.title ?? "(untitled)",
      postedAt: r.postedAt ? r.postedAt.toISOString() : null,
      permalink: permalinkForPost(postId),
      reactions: null,
      comments: null,
      shares: null,
      reach: null,
    };
    try {
      const s = await getPostStats(postId, token);
      return { ...base, permalink: s.permalink || base.permalink, reactions: s.reactions, comments: s.comments, shares: s.shares, reach: s.reach };
    } catch {
      return base;
    }
  });
}

type TopPost = {
  id: string;
  pageDbId: string;
  pageName: string;
  avatarUrl: string | null;
  title: string;
  postedAt: string | null;
  permalink: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
  engagement: number;
};

/** Best posts WE published in a range, ranked by engagement then reach. Pulls live
 *  stats for the most-recent candidates in the window (capped) — reuses getPostStats. */
async function topPostsForRange(from: string, to: string): Promise<TopPost[]> {
  const { since, until } = rangeToUnix(from, to);
  const rows = await prisma.scheduledPost.findMany({
    where: { status: "posted", graphPostId: { not: null }, postedAt: { gte: new Date(since * 1000), lt: new Date(until * 1000) } },
    orderBy: { postedAt: "desc" },
    take: TOP_POSTS_CANDIDATES,
    include: { article: { select: { title: true } }, facebookPage: { select: { id: true, pageName: true, avatarUrl: true, accessToken: true } } },
  });
  const out = await mapLimit(rows, 6, async (r): Promise<TopPost> => {
    const postId = r.graphPostId as string;
    const base: TopPost = {
      id: r.id,
      pageDbId: r.facebookPage.id,
      pageName: r.facebookPage.pageName,
      avatarUrl: r.facebookPage.avatarUrl,
      title: r.article?.title ?? "(untitled)",
      postedAt: r.postedAt ? r.postedAt.toISOString() : null,
      permalink: permalinkForPost(postId),
      reactions: null,
      comments: null,
      shares: null,
      reach: null,
      engagement: 0,
    };
    try {
      const s = await getPostStats(postId, decryptSecret(r.facebookPage.accessToken));
      const engagement = (s.reactions ?? 0) + (s.comments ?? 0) + (s.shares ?? 0);
      return { ...base, permalink: s.permalink || base.permalink, reactions: s.reactions, comments: s.comments, shares: s.shares, reach: s.reach, engagement };
    } catch {
      return base;
    }
  });
  out.sort((a, b) => b.engagement - a.engagement || (b.reach ?? 0) - (a.reach ?? 0));
  return out.slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const today = ppToday();
  return { from: addDays(today, -27), to: today };
}

/**
 * GET — three modes:
 *  • `?detail={pageDbId}&from=&to=` → one Page's day-by-day series (current +
 *    previous period) + per-day share counts + recent posts.
 *  • `?networkShares=1&from=&to=` → posts-we-shared per day (current) + the
 *    previous period's total (for the "Our posts" % change).
 *  • `?topPosts=1&from=&to=` → best posts we published in the range (network).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = parseRange(searchParams.get("from"), searchParams.get("to")) ?? defaultRange();
  const prev = previousPeriod(range.from, range.to);

  if (searchParams.get("topPosts")) {
    const posts = await topPostsForRange(range.from, range.to);
    return NextResponse.json({ ok: true, from: range.from, to: range.to, posts });
  }

  if (searchParams.get("networkShares")) {
    const shares = await sharesByDay(range.from, range.to);
    const prevShares = await sharesByDay(prev.from, prev.to);
    return NextResponse.json({ ok: true, from: range.from, to: range.to, shares, prevPostsTotal: sumValues(prevShares) });
  }

  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });

  const page = await prisma.facebookPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, pageName: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const combined = await dailyData(page, prev.from, range.to, searchParams.get("refresh") === "1");
  const days: DayPoint[] = [];
  const daysPrev: DayPoint[] = [];
  for (const dp of combined.days) {
    if (dp.date >= range.from && dp.date <= range.to) days.push(dp);
    else if (dp.date >= prev.from && dp.date <= prev.to) daysPrev.push(dp);
  }
  const shares = await sharesByDay(range.from, range.to, page.id);
  const prevShares = await sharesByDay(prev.from, prev.to, page.id);

  // Recent posts come from our own records, so they work even when trends don't.
  let posts: RecentPost[] = [];
  try {
    posts = await recentPostsForPage(page.id, decryptSecret(page.accessToken));
  } catch {
    posts = [];
  }

  return NextResponse.json({
    ok: true,
    detail: {
      pageDbId: page.id,
      pageName: page.pageName,
      from: range.from,
      to: range.to,
      status: combined.status,
      days,
      daysPrev,
      shares,
      prevPostsTotal: sumValues(prevShares),
      posts,
    },
  });
}
