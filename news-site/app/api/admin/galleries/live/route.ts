import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getGallerySeries, getLivePresence } from "@/lib/galleryPresence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only, polled by the Galleries tab + the live-audience dashboard:
 *  - `live`   — current reader counts per gallery (+ country/device breakdown)
 *  - `series` — the last hour of minute-bucketed reader counts per gallery (for the graph)
 *  - `now`    — server clock, so the client aligns its time axis to the sample times
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [live, series] = await Promise.all([getLivePresence(), getGallerySeries()]);
  return NextResponse.json({ live, series, now: Date.now() });
}
