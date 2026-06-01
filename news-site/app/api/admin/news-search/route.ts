import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getActiveProvider } from "@/lib/newsSearch/settings";
import { newsSearch, SearchError } from "@/lib/newsSearch/search";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 20;

// Admin-only News Search via the active paid provider (SerpApi / NewsAPI). Gated
// by requireAdmin so the key can't be used by anonymous traffic. The key is read
// + used entirely server-side (lib/newsSearch); results are cached to protect
// paid quota and rate-limit errors degrade to friendly messages.
export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const provider = await getActiveProvider();

  const params = {
    query: (searchParams.get("query") ?? "").trim().slice(0, 120),
    category: (searchParams.get("category") ?? "general").trim(),
    country: (searchParams.get("country") ?? "us").trim(),
    lang: (searchParams.get("lang") ?? "en").trim(),
    page: Math.max(1, Math.min(10, Number(searchParams.get("page") ?? "1") || 1)),
  };

  try {
    const result = await newsSearch(params, provider);
    return NextResponse.json({ ok: true, provider, ...result });
  } catch (err) {
    const code = err instanceof SearchError ? err.code : "unknown";
    if (code === "unconfigured") {
      return NextResponse.json(
        { ok: false, configured: false, provider, error: "Add your API key in API Settings to enable search." },
        { status: 503 },
      );
    }
    const status = code === "auth" ? 502 : code === "quota" ? 429 : code === "network" ? 504 : 500;
    const message = err instanceof SearchError ? err.message : "Couldn’t run the search. Please try again.";
    console.error("News search failed:", err);
    return NextResponse.json({ ok: false, provider, error: message, quota: code === "quota" }, { status });
  }
}
