import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateAiAssist, editArticle, isAiConfigured, AiAssistError } from "@/lib/aiAssist";

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

  let body: {
    mode?: unknown;
    headline?: unknown;
    topic?: unknown;
    model?: unknown;
    title?: unknown;
    articleBody?: unknown;
    instruction?: unknown;
    target?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // The validated model id (or undefined → server default) is passed straight
  // through; lib/aiAssist re-validates against the allow-list.
  const model = typeof body.model === "string" ? body.model : undefined;
  const mode = body.mode === "edit" ? "edit" : "assist";

  try {
    if (mode === "edit") {
      // Revise the admin's own article (title + body) per an instruction.
      const title = String(body.title ?? "");
      const articleBody = String(body.articleBody ?? "");
      const instruction = String(body.instruction ?? "").trim();
      const target = body.target === "title" || body.target === "body" ? body.target : undefined;
      if (instruction.length < 2) {
        return NextResponse.json({ ok: false, error: "Tell the AI what to change." }, { status: 400 });
      }
      const result = await editArticle({ title, body: articleBody, instruction, target, model });
      return NextResponse.json({ ok: true, result });
    }

    // Default: trending headline → 5-section starter.
    const headline = String(body.headline ?? "").trim();
    const topic = String(body.topic ?? "").trim();
    if (headline.length < 4) {
      return NextResponse.json({ ok: false, error: "A headline is required." }, { status: 400 });
    }
    const result = await generateAiAssist({ headline, topic, model });
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
            : err instanceof AiAssistError
              ? err.message
              : "The AI assistant couldn’t complete that. Please try again.";
    console.error("AI assist failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
