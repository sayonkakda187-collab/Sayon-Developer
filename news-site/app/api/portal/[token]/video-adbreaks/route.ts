import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getMonitoredVideoAdBreaks } from "@/lib/pageControlVideoAdBreaks";
import { ppToday, addDays } from "@/lib/fbInsightsRange";
import { requirePortalManager, NO_STORE } from "@/lib/portalAuth";

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

/** Portal mirror of the page's DAILY video ad-break ad IMPRESSIONS (Analytics tab).
 *  READ-ONLY; authorized + rate-limited by the path token. Same shape + graceful
 *  status as the admin route. */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const auth = await requirePortalManager(req, params.token);
  if (auth instanceof NextResponse) return auth;

  const { searchParams } = new URL(req.url);
  const pageDbId = searchParams.get("detail");
  if (!pageDbId) return NextResponse.json({ ok: false, error: "Missing page id" }, { status: 400, headers: NO_STORE });

  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const wantFresh = searchParams.get("refresh") === "1";

  const page = await prisma.monitoredPage.findUnique({
    where: { id: pageDbId },
    select: { id: true, pageId: true, accessToken: true },
  });
  if (!page) return NextResponse.json({ ok: false, error: "Page not found" }, { status: 404, headers: NO_STORE });

  const { status, days } = await getMonitoredVideoAdBreaks(page, range.from, range.to, wantFresh);
  return NextResponse.json({ ok: true, status, days, from: range.from, to: range.to }, { headers: NO_STORE });
}
