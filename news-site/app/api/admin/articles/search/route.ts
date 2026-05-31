import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { searchArticlesAdmin } from "@/lib/queries";

export const dynamic = "force-dynamic";

// Live admin article search. Gated by requireAdmin; returns relevance-ranked
// hits with highlighted snippets. Used by the global sidebar search and the
// Articles list filter.
export async function GET(req: Request) {
  await requireAdmin();

  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const limitParam = Number(searchParams.get("limit"));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(100, limitParam) : 50;

  if (q.length < 2) {
    return NextResponse.json({ results: [], query: q });
  }

  try {
    const results = await searchArticlesAdmin(q, { limit });
    return NextResponse.json({ results, query: q });
  } catch (err) {
    console.error("Article search failed:", err);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
