import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredRowStats } from "@/lib/pageControlInsights";

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
 * POST `{ ids: string[], refresh?: boolean }` — last-28d quick stats (reach /
 * engagement / net follows + the previous 28d for % change) for a BATCH of
 * monitored pages, for the landing-list row pills. The client sends small batches
 * (with a per-row shimmer); each page is at most one cached Graph call per ~6h.
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
    select: { id: true, pageId: true, accessToken: true },
  });

  const rows = await mapLimit(pages, 6, async (p) => {
    const stats = await getMonitoredRowStats(p, refresh === true);
    return { id: p.id, ...stats };
  });

  return NextResponse.json({ ok: true, rows });
}
