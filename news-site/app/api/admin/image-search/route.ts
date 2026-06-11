import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { searchImages, resolveFeaturedImage, type ImageHit } from "@/lib/imageSearch";
import { suggestQueryFromArticle } from "@/lib/stockPhotos";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Admin-only unified image search (Pexels + Unsplash + Pixabay + Wikimedia).
// Keys stay server-side; results are cached ~1h in lib/imageSearch to respect the
// small free rate limits.
export async function GET(req: Request) {
  await requireAdmin();
  const { searchParams } = new URL(req.url);
  let query = (searchParams.get("query") ?? "").trim();
  if (!query && searchParams.get("suggest")) {
    query = suggestQueryFromArticle(searchParams.get("title") ?? "", searchParams.get("excerpt") ?? "");
  }
  if (query.length < 2) {
    return NextResponse.json({ ok: false, error: "Type something to search." }, { status: 400 });
  }
  try {
    const { hits, sources } = await searchImages({ query });
    return NextResponse.json({ ok: true, query, hits, sources });
  } catch (e) {
    console.error("Image search failed:", e);
    return NextResponse.json({ ok: false, error: "Couldn’t search images. Please try again." }, { status: 500 });
  }
}

// Finalize a chosen result into a stored featured image (triggers the Unsplash
// download endpoint / re-hosts Pixabay per their terms). The client sends the hit
// it picked from GET.
export async function POST(req: Request) {
  await requireAdmin();
  let body: { hit?: Partial<ImageHit> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const hit = body.hit;
  if (!hit || typeof hit.full !== "string" || typeof hit.source !== "string") {
    return NextResponse.json({ ok: false, error: "Missing image." }, { status: 400 });
  }
  try {
    const cover = await resolveFeaturedImage(hit as ImageHit);
    return NextResponse.json({ ok: true, cover });
  } catch (e) {
    console.error("Image resolve failed:", e);
    return NextResponse.json({ ok: false, error: "Couldn’t set that image. Please try another." }, { status: 500 });
  }
}
