import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { generateKeyPoints, isAiConfigured, AiAssistError } from "@/lib/aiAssist";
import { getDefaultAiModel } from "@/lib/aiSettings";
import { isValidModel } from "@/lib/aiModels";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Admin-only "Generate key points" for an article. Gated by requireAdmin so the
// PAID AI API can't be triggered by anonymous traffic. Returns 3 short original
// bullets summarizing the supplied title + body; the editor fills its field with
// them (the admin reviews/edits, then saves normally).
export async function POST(req: Request) {
  await requireAdmin();

  if (!isAiConfigured()) {
    return NextResponse.json(
      { ok: false, configured: false, error: "AI is not set up yet." },
      { status: 503 },
    );
  }

  let body: { title?: unknown; body?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const title = String(body.title ?? "");
  const articleBody = String(body.body ?? "");
  if (!articleBody.trim() && !title.trim()) {
    return NextResponse.json(
      { ok: false, error: "Add a title or some content first." },
      { status: 400 },
    );
  }
  const model = isValidModel(body.model) ? body.model : await getDefaultAiModel();

  try {
    const points = await generateKeyPoints({ title, body: articleBody, model });
    return NextResponse.json({ ok: true, points });
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
              : "Couldn’t generate key points. Please try again.";
    console.error("Key points generation failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
