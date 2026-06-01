import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { GNEWS_MAX_PAGE_SIZE } from "@/lib/gnews";
import { aggregateTrending } from "@/lib/news/aggregate";
import { NEWS_SOURCE_IDS, isNewsSourceId, type NewsSourceId } from "@/lib/news/sources";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Aggregating several APIs can take a moment; give the route room.
export const maxDuration = 30;

// Admin-only trending discovery, now aggregated across GNews + additional free
// news APIs (NewsData, TheNewsAPI, Currents). Gated by requireAdmin so the daily
// quotas can't be burned by anonymous traffic. Per-source caching + graceful
// degradation live in lib/news; one failing source never breaks the feed.
export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category") ?? "general";
  const query = searchParams.get("query") ?? "";
  const lang = searchParams.get("lang") ?? "en";
  const country = searchParams.get("country") ?? "us";
  const page = Number(searchParams.get("page") ?? "1") || 1;

  // `sources` is a comma-separated allow-list of source ids the user has enabled.
  // Absent → all sources. Invalid ids are ignored.
  const sourcesParam = searchParams.get("sources");
  const enabled: NewsSourceId[] = sourcesParam
    ? sourcesParam.split(",").map((s) => s.trim()).filter(isNewsSourceId)
    : [...NEWS_SOURCE_IDS];

  try {
    const result = await aggregateTrending({
      enabled,
      query: { category, query, lang, country, page },
    });

    // hasMore: only GNews supports our page>1 fetch; a full GNews page hints there
    // may be more. The other sources are single-page, so "Load more" is GNews-driven.
    const gnews = result.sources.find((s) => s.id === "gnews");
    const hasMore = (gnews?.count ?? 0) >= GNEWS_MAX_PAGE_SIZE;

    const anyOk = result.sources.some((s) => s.ok && s.count > 0);
    const anyConfigured = result.sources.some((s) => s.configured);
    // If nothing is configured at all, surface a clear (non-error) signal.
    if (!anyConfigured) {
      return NextResponse.json({
        ok: true,
        items: [],
        sources: result.sources,
        cached: false,
        page,
        hasMore: false,
        notice: "No news sources are set up yet.",
      });
    }

    return NextResponse.json({
      ok: true,
      items: result.items,
      sources: result.sources,
      cached: result.cached,
      page,
      hasMore,
      notice:
        !anyOk && result.items.length === 0
          ? "No sources returned results — they may be rate-limited. Try again shortly."
          : null,
    });
  } catch (err) {
    console.error("Trending aggregate failed:", err);
    return NextResponse.json(
      { ok: false, items: [], error: "Could not load trending news. Please try again." },
      { status: 502 },
    );
  }
}
