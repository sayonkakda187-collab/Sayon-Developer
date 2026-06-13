import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getNetworkRollup } from "@/lib/pageControlNetwork";
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
 * GET `?from=&to=&refresh=1` — the Page Control NETWORK rollup (totals, trend,
 * leaderboard, top posts, risers/fallers, health) aggregated from EXISTING per-page
 * caches (no Graph calls). Cached ~1h per range. `refresh=1` recomputes from the
 * current caches. Read-only; coverage is reported in the payload.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const range = parseRange(searchParams.get("from"), searchParams.get("to"));
  const refresh = searchParams.get("refresh") === "1";

  try {
    const rollup = await getNetworkRollup(range, refresh);
    return NextResponse.json({ ok: true, from: range.from, to: range.to, rollup });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn’t build the network dashboard." });
  }
}
