import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredRowStats } from "@/lib/pageControlInsights";
import { getMonitoredRangePosts } from "@/lib/pageControlRangePosts";
import { ppToday, addDays } from "@/lib/fbInsightsRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 12;
const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validate + normalize a from/to range (Phnom-Penh dates), default last 28 days. */
function parseRange(from: unknown, to: unknown): { from: string; to: string } {
  const today = ppToday();
  if (typeof from !== "string" || typeof to !== "string" || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return { from: addDays(today, -27), to: today };
  }
  let f = from <= to ? from : to;
  const t = from <= to ? to : from;
  const span = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

/** Bounded-concurrency map so a batch never bulk-hammers Graph. */
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

/**
 * POST `{ ids: string[], from?, to?, refresh?: boolean }` — for a BATCH of monitored
 * pages, the landing-list row data over the SELECTED range (default last 28d): quick
 * stats (reach / engagement / net follows + the equal-length previous period for %
 * change + the range's sparkline series) AND the range-aware `rangePosts` count
 * (posts published within the range, split video vs image). The client sends small
 * batches (per-row shimmer). Both are cached per (page, range) so a row is at most one
 * cached call each per page, never a bulk hammer. One page failing never blocks the rest.
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
  const { ids, from, to, refresh } = (body ?? {}) as { ids?: unknown; from?: unknown; to?: unknown; refresh?: unknown };
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, MAX_BATCH) : [];
  if (list.length === 0) return NextResponse.json({ ok: true, rows: [] });
  const range = parseRange(from, to);

  const pages = await prisma.monitoredPage.findMany({
    where: { id: { in: list } },
    select: { id: true, pageId: true, accessToken: true },
  });

  // Earnings entered (by managers, via the bot) for these pages within the range —
  // LOCAL data, one cheap grouped query for the whole batch. null → "—" on the row.
  const earnAgg = await prisma.pageEarning.groupBy({
    by: ["monitoredPageId"],
    where: { monitoredPageId: { in: list }, date: { gte: range.from, lte: range.to } },
    _sum: { amount: true },
  });
  const earnByPage = new Map(earnAgg.map((e) => [e.monitoredPageId, Number(e._sum.amount ?? 0)]));

  const rows = await mapLimit(pages, 6, async (p) => {
    // Quick stats over the range + the range's post count (video/image split), both
    // cached per (page, range), in parallel.
    const [stats, posts] = await Promise.all([
      getMonitoredRowStats(p, range, refresh === true),
      getMonitoredRangePosts(p, range, refresh === true),
    ]);
    return { id: p.id, ...stats, rangePosts: { total: posts.total, video: posts.video, image: posts.image, capped: posts.capped }, earnings: earnByPage.get(p.id) ?? null };
  });

  return NextResponse.json({ ok: true, rows });
}
