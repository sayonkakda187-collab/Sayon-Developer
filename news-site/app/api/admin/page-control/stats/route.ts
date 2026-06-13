import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredRowStats } from "@/lib/pageControlInsights";
import { getMonitoredTotalPosts } from "@/lib/pageControlTotals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 12;

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
 * POST `{ ids: string[], refresh?: boolean }` — for a BATCH of monitored pages, the
 * landing-list row data: last-28d quick stats (reach / engagement / net follows +
 * the previous 28d for % change + sparkline) AND the all-time `totalPosts` count.
 * The client sends small batches (per-row shimmer). The stats use a ~6h cache; the
 * post count its own ~24h cache (summary=total_count when available, else a capped
 * count) — so a row is at most one cached call each per page, never a bulk hammer.
 * One page failing never blocks the rest.
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
  const { ids, refresh } = (body ?? {}) as { ids?: unknown; refresh?: unknown };
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, MAX_BATCH) : [];
  if (list.length === 0) return NextResponse.json({ ok: true, rows: [] });

  const pages = await prisma.monitoredPage.findMany({
    where: { id: { in: list } },
    select: { id: true, pageId: true, accessToken: true, totalPosts: true, totalPostsCapped: true, totalPostsAt: true },
  });

  const rows = await mapLimit(pages, 6, async (p) => {
    // Daily quick stats (cached ~6h) + all-time post count (cached ~24h) in parallel.
    const [stats, totals] = await Promise.all([
      getMonitoredRowStats(p, refresh === true),
      getMonitoredTotalPosts(p, refresh === true),
    ]);
    return { id: p.id, ...stats, totalPosts: totals.count, totalPostsCapped: totals.capped };
  });

  return NextResponse.json({ ok: true, rows });
}
