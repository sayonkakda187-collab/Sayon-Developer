import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  searchStockPhotos,
  suggestQueryFromArticle,
  isStockConfigured,
  StockError,
} from "@/lib/stockPhotos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only free stock-photo search (Pexels). Gated by requireAdmin so the key
// can't be used by anonymous traffic; the key stays server-side. Results are
// cached in lib/stockPhotos to protect the free-tier rate limit.
export async function GET(req: Request) {
  await requireAdmin();

  if (!isStockConfigured()) {
    // Lets the UI show a tidy "set up photos" state without leaking the key.
    return NextResponse.json({ ok: false, configured: false, error: "Photos aren’t set up yet." }, { status: 503 });
  }

  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get("page") ?? "1") || 1;
  // `suggest` mode derives the query from the article title/excerpt.
  let query = (searchParams.get("query") ?? "").trim();
  if (!query && searchParams.get("suggest")) {
    query = suggestQueryFromArticle(searchParams.get("title") ?? "", searchParams.get("excerpt") ?? "");
  }
  if (query.length < 2) {
    return NextResponse.json({ ok: false, error: "Type something to search." }, { status: 400 });
  }

  try {
    const result = await searchStockPhotos({ query, page });
    return NextResponse.json({ ok: true, query, ...result });
  } catch (err) {
    const code = err instanceof StockError ? err.code : "unknown";
    const status = code === "auth" ? 502 : code === "quota" ? 429 : code === "network" ? 504 : 500;
    const message =
      code === "auth"
        ? "The photo service rejected the request. Check your PEXELS_API_KEY."
        : code === "quota"
          ? "Photo search limit reached for now. Please try again shortly."
          : code === "network"
            ? "Couldn’t reach the photo service. Please try again."
            : "Couldn’t search photos. Please try again.";
    console.error("Stock photo search failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
