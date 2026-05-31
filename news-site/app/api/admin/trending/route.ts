import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { fetchTrending } from "@/lib/gnews";

// Admin-only. Calls GNews server-side (the key never reaches the browser) and
// returns clean JSON. Always dynamic — results depend on query params and the
// upstream feed, and the in-memory cache in lib/gnews handles quota control.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? undefined;
  const query = searchParams.get("q") ?? undefined;

  const result = await fetchTrending({ category, query });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true, items: result.items, cached: result.cached });
}
