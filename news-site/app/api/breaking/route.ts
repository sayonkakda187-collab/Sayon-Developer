import { NextResponse } from "next/server";
import { getBreaking } from "@/lib/breaking";

export const runtime = "nodejs";
// Reads the DB, so don't prerender at build; the CDN still caches each response
// for ~60s via the Cache-Control header below (whole pages stay cached, too).
export const dynamic = "force-dynamic";

// Public, lightweight endpoint the breaking-news banner polls (~every 60s). The
// CDN caches it for ~60s (s-maxage) so a toggle propagates within a minute
// WITHOUT making whole pages uncached. While OFF, no text is exposed.
export async function GET() {
  const b = await getBreaking();
  const payload =
    b.enabled && b.text.trim()
      ? { enabled: true, text: b.text, link: b.link || null }
      : { enabled: false };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
