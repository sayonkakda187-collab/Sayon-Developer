import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAiAssist, isAiConfigured, AiAssistError } from "@/lib/aiAssist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// AI calls can take a while; give the route room (Vercel caps by plan).
export const maxDuration = 60;

// Admin-only AI writing assistant. Gated by requireAdmin so the PAID AI API
// can't be triggered by anonymous traffic. Runs only on an explicit POST from
// the "AI Assist" button — never automatically. Receives a headline + topic
// only (no scraped source body); the key stays server-side.
export async function GET() {
  await requireAdmin();
  // Lets the client decide whether to show the "Set up AI" state without leaking the key.
  return NextResponse.json({ configured: isAiConfigured() });
}

export async function POST(req: Request) {
  await requireAdmin();

  if (!isAiConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "AI is not set up yet." },
      { status: 503 },
    );
  }

  let body: { headline?: unknown; topic?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const headline = String(body.headline ?? "").trim();
  const topic = String(body.topic ?? "").trim();
  if (headline.length < 4) {
    return NextResponse.json({ ok: false, error: "A headline is required." }, { status: 400 });
  }

  try {
    const result = await generateAiAssist({ headline, topic });
    return NextResponse.json({ ok: true, result });
  } catch (err) {
    const code = err instanceof AiAssistError ? err.code : "unknown";
    const status = code === "auth" ? 502 : code === "quota" ? 429 : code === "network" ? 504 : 500;
    const message =
      code === "auth"
        ? "The AI service rejected the request. Check your ANTHROPIC_API_KEY."
        : code === "quota"
          ? "AI rate limit or credit reached. Please try again shortly."
          : code === "network"
            ? "Couldn’t reach the AI service. Please try again."
            : "The AI assistant couldn’t generate a draft. Please try again.";
    console.error("AI assist failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
