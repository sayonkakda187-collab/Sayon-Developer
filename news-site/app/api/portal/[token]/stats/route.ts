import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMonitoredRowStats } from "@/lib/pageControlInsights";
import { getMonitoredRangePosts } from "@/lib/pageControlRangePosts";
import { ppToday, addDays } from "@/lib/fbInsightsRange";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 12;
const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(from: unknown, to: unknown): { from: string; to: string } {
  const today = ppToday();
  if (typeof from !== "string" || typeof to !== "string" || !DATE_RE.test(from) || !DATE_RE.test(to)) return { from: addDays(today, -27), to: today };
  let f = from <= to ? from : to;
  const t = from <= to ? to : from;
  const span = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

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

/** Portal mirror of the row-stats batch (READ-ONLY; authorized by the path token). */
export async function POST(req: Request, { params }: { params: { token: string } }) {
  // Read-only stats for any requested monitored page (the portal shows ALL pages'
  // results); the token only needs to resolve to an enabled manager.
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const { ids, from, to, refresh } = (body ?? {}) as { ids?: unknown; from?: unknown; to?: unknown; refresh?: unknown };
  const list = Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string").slice(0, MAX_BATCH) : [];
  if (list.length === 0) return NextResponse.json({ ok: true, rows: [] }, { headers: NO_STORE });
  const range = parseRange(from, to);

  const pages = await prisma.monitoredPage.findMany({ where: { id: { in: list } }, select: { id: true, pageId: true, accessToken: true } });
  const earnAgg = await prisma.pageEarning.groupBy({ by: ["monitoredPageId"], where: { monitoredPageId: { in: list }, date: { gte: range.from, lte: range.to } }, _sum: { amount: true } });
  const earnByPage = new Map(earnAgg.map((e) => [e.monitoredPageId, Number(e._sum.amount ?? 0)]));

  const rows = await mapLimit(pages, 6, async (p) => {
    const [stats, posts] = await Promise.all([getMonitoredRowStats(p, range, refresh === true), getMonitoredRangePosts(p, range, refresh === true)]);
    return { id: p.id, ...stats, rangePosts: { total: posts.total, video: posts.video, image: posts.image, capped: posts.capped }, earnings: earnByPage.get(p.id) ?? null };
  });
  return NextResponse.json({ ok: true, rows }, { headers: NO_STORE });
}
