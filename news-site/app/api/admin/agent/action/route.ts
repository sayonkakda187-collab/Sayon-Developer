import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { getAction, updateAction, getAgentSettings } from "@/lib/agent/store";
import { executeAgentAction } from "@/lib/agent/execute";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

// Approve or reject a gated agent action. This is the ONLY place a gated action's
// real side effect runs — never during the chat turn that proposed it.
export async function POST(req: Request) {
  await requireAdmin();

  let body: { id?: unknown; decision?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const decision = body.decision === "approve" ? "approve" : body.decision === "reject" ? "reject" : null;
  if (!id || !decision) return NextResponse.json({ ok: false, error: "Missing id or decision." }, { status: 400 });

  const action = await getAction(id);
  if (!action) return NextResponse.json({ ok: false, error: "Action not found." }, { status: 404 });
  if (action.status !== "pending") {
    return NextResponse.json({ ok: false, error: `This action was already ${action.status}.`, action }, { status: 409 });
  }

  if (decision === "reject") {
    const updated = await updateAction(id, { status: "rejected", decidedAt: new Date().toISOString() });
    return NextResponse.json({ ok: true, action: updated });
  }

  // Approve → re-check the capability is still enabled, then execute for real.
  const settings = await getAgentSettings();
  const capOk =
    action.type === "publish_article" ? settings.capabilities.publishing
      : action.type === "share_to_facebook" ? settings.capabilities.sharing
        : settings.capabilities.editing; // update_published_article
  if (!capOk) {
    const updated = await updateAction(id, { status: "failed", error: "That capability is turned off in Agent Settings.", decidedAt: new Date().toISOString() });
    return NextResponse.json({ ok: false, error: "That capability is turned off in Agent Settings.", action: updated }, { status: 403 });
  }

  const res = await executeAgentAction(action);
  const updated = await updateAction(id, {
    status: res.ok ? "done" : "failed",
    result: res.result,
    error: res.error,
    decidedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: res.ok, action: updated, result: res.result, error: res.error }, { status: res.ok ? 200 : 502 });
}
