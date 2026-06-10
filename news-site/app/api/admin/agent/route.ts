import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { isAiConfigured, resolveModel, AgentError } from "@/lib/agent/anthropic";
import { runAgentTurn } from "@/lib/agent/run";
import { getAgentSettings } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// The agent loop can chain several AI + tool calls (incl. a draft generation),
// so give the function room. 60s is the Vercel Hobby ceiling.
export const maxDuration = 60;

export async function GET() {
  await requireAdmin();
  return NextResponse.json({ configured: isAiConfigured() });
}

export async function POST(req: Request) {
  await requireAdmin();

  if (!isAiConfigured()) {
    return NextResponse.json(
      { ok: false, error: "AI isn’t set up yet — add ANTHROPIC_API_KEY in the environment." },
      { status: 503 },
    );
  }

  let body: { messages?: unknown; model?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  // Accept only well-formed text turns; cap length + history depth defensively.
  const raw = Array.isArray(body.messages) ? body.messages : [];
  const messages = raw
    .filter(
      (m): m is { role: "user" | "assistant"; content: string } =>
        !!m &&
        typeof m === "object" &&
        ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") &&
        typeof (m as { content?: unknown }).content === "string",
    )
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }))
    .slice(-20);

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ ok: false, error: "Send a message to the assistant." }, { status: 400 });
  }

  const settings = await getAgentSettings();
  // The chat's model picker wins; otherwise the saved Agent-Settings default.
  const model = resolveModel(
    typeof body.model === "string" ? body.model : settings.model ?? undefined,
  );
  const categories = (
    await prisma.category.findMany({ select: { name: true }, orderBy: { name: "asc" } })
  ).map((c) => c.name);

  try {
    const result = await runAgentTurn({ messages, model, categories, settings });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const code = err instanceof AgentError ? err.code : "unknown";
    const status = code === "auth" ? 502 : code === "quota" ? 429 : code === "network" ? 504 : 500;
    const message =
      code === "auth"
        ? "The AI service rejected the request. Check ANTHROPIC_API_KEY."
        : code === "quota"
          ? "AI rate limit or credit reached. Please try again shortly."
          : code === "network"
            ? "Couldn’t reach the AI service. Please try again."
            : "The assistant hit an error. Please try again.";
    console.error("Agent turn failed:", err);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
