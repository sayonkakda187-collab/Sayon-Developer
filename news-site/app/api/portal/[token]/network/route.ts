import { NextResponse } from "next/server";
import { getNetworkRollup } from "@/lib/pageControlNetwork";
import { ppToday, addDays } from "@/lib/fbInsightsRange";
import { managerForPortalToken } from "@/lib/managerPortal";

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

/** Portal mirror of the network rollup (READ-ONLY; authorized by the path token). */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const mgr = await managerForPortalToken(params.token);
  if (!mgr) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const managerParam = searchParams.get("manager");
  const managerId = managerParam && managerParam.trim() ? managerParam.trim() : null;
  try {
    const rollup = await getNetworkRollup(range, managerId, false);
    return NextResponse.json({ ok: true, from: range.from, to: range.to, rollup });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn’t build the network dashboard." });
  }
}
