import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredRowCharts } from "@/lib/pageControlRowCharts";
import { ppToday, addDays } from "@/lib/fbInsightsRange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RANGE_DAYS = 92;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(from: string | null, to: string | null): { from: string; to: string } {
  const today = ppToday();
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) return { from: addDays(today, -27), to: today };
  let f = from <= to ? from : to;
  const t = from <= to ? to : from;
  const span = Math.round((Date.parse(`${t}T00:00:00Z`) - Date.parse(`${f}T00:00:00Z`)) / 86400000) + 1;
  if (span > MAX_RANGE_DAYS) f = addDays(t, -(MAX_RANGE_DAYS - 1));
  return { from: f, to: t };
}

/**
 * GET `?id={monitoredPageId}&from=&to=&refresh=1` — lazy chart data for ONE expanded
 * monitored-page row over the selected range: daily reach series, per-day post counts
 * (video/image split), and the range's video-vs-image type mix. All from existing
 * per-page caches (no bulk Graph). Fetched only when a row is expanded.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });

  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const wantFresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const charts = await getMonitoredRowCharts(page, range, wantFresh);
  return NextResponse.json({ ok: true, ...charts });
}
