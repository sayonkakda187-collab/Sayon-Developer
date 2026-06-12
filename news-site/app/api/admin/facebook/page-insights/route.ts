import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPostStats, permalinkForPost } from "@/lib/facebook";
import {
  getPageOverview,
  getPageTimeseries,
  type PageOverview,
  type PageTimeseries,
} from "@/lib/facebookInsights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Serve a cached overview for ~12h before re-hitting the Graph API (the client's
// Refresh button forces a fresh fetch). With ~264 Pages this keeps the tab fast
// and well under Facebook's rate limits.
const FRESH_MS = 12 * 60 * 60 * 1000;
// Cap one POST batch so a cold fetch always finishes inside the 60s function limit.
const MAX_BATCH = 30;

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

type OverviewRow = PageOverview & { pageDbId: string; cachedAt: string };

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
 * POST — batched Page overviews. Body: `{ pageDbIds: string[], refresh?: boolean }`.
 * For each Page: serve the ~12h cache when fresh (unless `refresh`), else compute
 * from the Graph API (decrypt token → followers + 28-day reach/engagement) and
 * upsert the cache. One Page failing never blocks the batch — it comes back with
 * `status: "reconnect"`. The client iterates Pages in small batches with a
 * progress indicator.
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
  const { pageDbIds, refresh } = (body ?? {}) as { pageDbIds?: unknown; refresh?: unknown };
  const ids = Array.isArray(pageDbIds) ? pageDbIds.filter((x): x is string => typeof x === "string") : [];
  if (ids.length === 0) return NextResponse.json({ ok: true, rows: [] });

  const batch = ids.slice(0, MAX_BATCH);
  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: batch } },
    select: { id: true, pageId: true, accessToken: true, insightCache: true },
  });

  const now = Date.now();
  const wantFresh = refresh === true;

  const rows = await mapLimit(pages, 6, async (p): Promise<OverviewRow> => {
    const cache = p.insightCache;
    if (!wantFresh && cache && now - cache.fetchedAt.getTime() < FRESH_MS) {
      const parsed = parseCache(cache.data);
      if (parsed) return { pageDbId: p.id, ...parsed, cachedAt: cache.fetchedAt.toISOString() };
    }

    let overview: PageOverview;
    try {
      const token = decryptSecret(p.accessToken);
      overview = await getPageOverview(p.pageId, token);
    } catch {
      // Undecryptable token / unexpected error → reconnect, keep the table alive.
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

    return { pageDbId: p.id, ...overview, cachedAt: fetchedAt.toISOString() };
  });

  return NextResponse.json({ ok: true, rows });
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

const EMPTY_SERIES: PageTimeseries = {
  reach: [],
  engagement: [],
  follows: [],
  reachMetric: null,
  engagementMetric: null,
  followsMetric: null,
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

/**
 * GET — Page detail. Query: `?detail={pageDbId}&days={7|28|90}`. Returns the daily
 * reach / engagement / follows trend (self-healing metrics) plus this Page's recent
 * posts with per-post stats. A token/permission failure returns `status:
 * "reconnect"` with empty series instead of erroring.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });
  const daysRaw = Number(searchParams.get("days") || "28");
  const days = [7, 28, 90].includes(daysRaw) ? daysRaw : 28;

  const page = await prisma.facebookPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, pageName: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return NextResponse.json({
      ok: true,
      detail: { pageDbId: page.id, pageName: page.pageName, days, status: "reconnect", series: EMPTY_SERIES, posts: [] },
    });
  }

  let series: PageTimeseries = EMPTY_SERIES;
  let status: "ok" | "reconnect" = "ok";
  try {
    series = await getPageTimeseries(page.pageId, token, days);
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) status = "reconnect";
    series = EMPTY_SERIES;
  }

  // Recent posts come from our own records, so they work even when trends don't.
  const posts = await recentPostsForPage(page.id, token);

  return NextResponse.json({
    ok: true,
    detail: { pageDbId: page.id, pageName: page.pageName, days, status, series, posts },
  });
}
