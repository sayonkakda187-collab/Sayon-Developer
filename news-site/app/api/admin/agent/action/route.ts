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

  let body: { id?: unknown; decision?: unknown; scheduledAt?: unknown };
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
        : action.type === "set_page_earnings" ? settings.capabilities.pageEarnings
          : settings.capabilities.editing; // update_published_article
  if (!capOk) {
    const updated = await updateAction(id, { status: "failed", error: "That capability is turned off in Agent Settings.", decidedAt: new Date().toISOString() });
    return NextResponse.json({ ok: false, error: "That capability is turned off in Agent Settings.", action: updated }, { status: 403 });
  }

  // For publishes, the approval card can set/override the time (a UTC ISO string)
  // or choose "Publish now" (empty). Apply it to the action's params before we run.
  let toRun = action;
  if (action.type === "publish_article") {
    const sa = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : "";
    const params = { ...action.params };
    if (sa && !Number.isNaN(Date.parse(sa)) && Date.parse(sa) > Date.now() + 30_000) {
      params.scheduledAt = sa;
    } else {
      delete params.scheduledAt; // publish now
    }
    toRun = (await updateAction(id, { params })) ?? action;
  }

  const res = await executeAgentAction(toRun);
  const updated = await updateAction(id, {
    status: res.ok ? "done" : "failed",
    result: res.result,
    error: res.error,
    decidedAt: new Date().toISOString(),
  });
  return NextResponse.json({ ok: res.ok, action: updated, result: res.result, error: res.error }, { status: res.ok ? 200 : 502 });
}
