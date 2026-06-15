import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getMonitoredVideoAdBreaks } from "@/lib/pageControlVideoAdBreaks";
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

/** GET `?detail={monitoredPageId}&from=&to=&refresh=1` — one MONITORED page's DAILY
 *  video ad-break ad IMPRESSIONS (not earnings) for the range, with a graceful
 *  status (ok / needs_monetization / unavailable / reconnect). Cached server-side. */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400 });

  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const wantFresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404 });

  const { status, days } = await getMonitoredVideoAdBreaks(page, range.from, range.to, wantFresh);
  return NextResponse.json({ ok: true, status, days, from: range.from, to: range.to });
}
