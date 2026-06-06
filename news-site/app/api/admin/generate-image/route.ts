import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateImage, isImageGenConfigured, ImageGenError } from "@/lib/imageGen";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Image generation can take a while; give the route room (Vercel caps by plan).
export const maxDuration = 60;

// Admin-only AI image generator. Gated by requireAdmin so the image API can't be
// triggered by anonymous traffic. Runs only on an explicit POST from the "AI
// Images" tab or the editor's "Generate with AI" button — never automatically.
// The key stays server-side; the browser only ever receives the resulting image.
export async function GET() {
  await requireAdmin();
  // Lets the client show a "Set up image generation" state without leaking the key.
  return NextResponse.json({ configured: isImageGenConfigured() });
}

export async function POST(req: Request) {
  await requireAdmin();

  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "Image generation isn’t set up yet." },
      { status: 503 },
    );
  }

  let body: { prompt?: unknown; aspectRatio?: unknown; count?: unknown; style?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const prompt = String(body.prompt ?? "").trim();
  if (prompt.length < 3) {
    return NextResponse.json({ ok: false, error: "Enter a prompt describing the image." }, { status: 400 });
  }
  const aspectRatio = typeof body.aspectRatio === "string" ? body.aspectRatio : undefined;
  const style = typeof body.style === "string" ? body.style : undefined;
  const count = Number.isFinite(body.count as number) ? Number(body.count) : 1;

  try {
    const images = await generateImage(prompt, { aspectRatio, style, count });
    return NextResponse.json({
      ok: true,
      images: images.map((img) => ({
        url: `data:${img.mimeType};base64,${img.b64}`,
        mimeType: img.mimeType,
      })),
    });
  } catch (err) {
    const code = err instanceof ImageGenError ? err.code : "unknown";
    const status =
      code === "config"
        ? 503
        : code === "auth"
          ? 502
          : code === "quota"
            ? 429
            : code === "network"
              ? 504
              : code === "safety"
                ? 422
                : code === "parse"
                  ? 400
                  : 500;
    const message =
      err instanceof ImageGenError
        ? err.message
        : "The image generator couldn’t complete that. Please try again.";
    console.error("Image generation failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
