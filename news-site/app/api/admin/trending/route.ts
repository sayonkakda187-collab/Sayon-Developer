import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getTrending, toTrendingItem, GNewsError, GNEWS_MAX_PAGE_SIZE } from "@/lib/gnews";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only trending discovery via GNews. Gated by requireAdmin so the daily
// quota can't be burned by anonymous traffic. Returns cache-aware metadata and
// friendly messages instead of raw errors.
export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? "general";
  const query = searchParams.get("query") ?? "";
  const lang = searchParams.get("lang") ?? "en";
  const country = searchParams.get("country") ?? "us";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  try {
    const result = await getTrending({ category, query, lang, country, page });
    // Map to the inspiration-only client shape (drops the raw article body).
    const items = result.articles
      .map(toTrendingItem)
      .filter((x): x is NonNullable<typeof x> => x !== null);
    // A full page hints there *may* be more; pagination still degrades to "end"
    // on the free tier (handled client-side via dedupe).
    const hasMore = items.length >= GNEWS_MAX_PAGE_SIZE;
    return NextResponse.json({
      ok: true,
      items,
      totalArticles: result.totalArticles,
      cached: result.cached,
      stale: result.stale,
      page,
      hasMore,
      notice: result.stale ? "Showing recent cached results — live data is briefly unavailable." : null,
    });
  } catch (err) {
    const isQuota = err instanceof GNewsError && err.code === "quota";
    const isAuth = err instanceof GNewsError && err.code === "auth";
    console.error("Trending fetch failed:", err);
    return NextResponse.json(
      {
        ok: false,
        items: [],
        error: isQuota
          ? "Trending search limit reached for today. Please try again later."
          : isAuth
            ? "Trending news is temporarily unavailable (service limit). Try again later."
            : "Could not load trending news. Please try again.",
        quota: isQuota,
      },
      { status: isQuota ? 429 : 502 },
    );
  }
}
