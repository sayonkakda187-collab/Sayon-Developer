import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPostStats, permalinkForPost } from "@/lib/facebook";
import { getPageOverview, getPageDaily, type PageOverview, type DayPoint } from "@/lib/facebookInsights";
import { refreshPageAvatar, avatarIsStale } from "@/lib/facebookAvatars";
import { rangeToUnix, rangeKey, ppToday, ppDate, addDays } from "@/lib/fbInsightsRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Serve a cached overview for ~12h before re-hitting the Graph API (the client's
// Refresh button forces a fresh fetch). With ~264 Pages this keeps the tab fast
// and well under Facebook's rate limits.
const FRESH_MS = 12 * 60 * 60 * 1000;
// Daily series TTL: short when the range includes today (today's numbers are
// partial + keep changing), long for fully-historical ranges (stable).
const DAILY_TTL_TODAY_MS = 3 * 60 * 60 * 1000;
const DAILY_TTL_PAST_MS = 24 * 60 * 60 * 1000;
// Cap one POST batch so a cold fetch always finishes inside the 60s function limit.
const MAX_BATCH = 30;
const MAX_RANGE_DAYS = 92;

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
 * POST — batched Page overviews + (optional) day-by-day series for a range.
 * Body: `{ pageDbIds: string[], refresh?: boolean, from?: string, to?: string }`.
 * Per Page: serve the ~12h overview cache (unless `refresh`), else recompute; and
 * when from/to is given, fetch each Page's daily series (per-(page,range) cache)
 * and return the BATCH SUM as `daily` — the client adds up batches into the
 * network total, so the network daily chart is built from cached per-page data,
 * never one giant request. One Page failing never blocks the batch.
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
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [], daily: [] });
  const range = from != null && to != null ? parseRange(from, to) : null;

  const batch = ids.slice(0, MAX_BATCH);
  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: batch } },
    select: { id: true, pageId: true, accessToken: true, avatarUrl: true, avatarFetchedAt: true, insightCache: true },
  });

  const now = Date.now();
  const wantFresh = refresh === true;
  const acc: DailyAcc = new Map();

  const rows = await mapLimit(pages, 6, async (p): Promise<OverviewRow> => {
    // Refresh the cached avatar as part of the insights flow when missing/stale.
    let avatarUrl = p.avatarUrl;
    if (avatarIsStale(p.avatarFetchedAt)) {
      avatarUrl = await refreshPageAvatar(p);
    }

    // Day-by-day series for this Page (cached per range), summed into the batch.
    if (range) {
      const d = await dailyData(p, range.from, range.to, wantFresh);
      for (const dp of d.days) addInto(acc, dp); // sync after await → safe under mapLimit
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

  return NextResponse.json({ ok: true, rows, daily: range ? accToDays(acc) : [] });
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

function defaultRange(): { from: string; to: string } {
  const today = ppToday();
  return { from: addDays(today, -27), to: today };
}

/**
 * GET — two modes:
 *  • `?detail={pageDbId}&from=&to=` → one Page's day-by-day series + per-day share
 *    counts (posts WE published) + recent posts. Reconnect/empty degrade gracefully.
 *  • `?networkShares=1&from=&to=` → posts-we-shared per day across ALL Pages (for
 *    the overview per-day table; the Graph daily totals come from the POST batches).
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = parseRange(searchParams.get("from"), searchParams.get("to")) ?? defaultRange();

  // Network shares-by-day (overview per-day table).
  if (searchParams.get("networkShares")) {
    const shares = await sharesByDay(range.from, range.to);
    return NextResponse.json({ ok: true, from: range.from, to: range.to, shares });
  }

  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });

  const page = await prisma.facebookPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, pageName: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const daily = await dailyData(page, range.from, range.to, searchParams.get("refresh") === "1");
  const shares = await sharesByDay(range.from, range.to, page.id);

  // Recent posts come from our own records, so they work even when trends don't.
  let posts: RecentPost[] = [];
  try {
    const token = decryptSecret(page.accessToken);
    posts = await recentPostsForPage(page.id, token);
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
      status: daily.status,
      days: daily.days,
      shares,
      posts,
    },
  });
}
