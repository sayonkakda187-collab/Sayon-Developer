import { NextResponse } from "next/server";
import { publishDue } from "@/lib/publish";
import { runDueAutopilot } from "@/lib/autopilot";

// The pinger-driven dispatcher: publishes every article whose scheduled time has
// arrived (+ fires the Facebook auto-share THEN) AND runs any due Auto-Pilot Runs.
// Both are idempotent — safe to call as often as the external pinger likes; nothing
// double-publishes, double-shares, or double-runs. The once-daily Vercel cron is a
// safety net; auto-publish Runs at arbitrary times need the external pinger.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Keep the whole invocation under the Hobby 60s ceiling: scheduled publishing runs
// first (time-sensitive), then a due Auto-Pilot Run gets whatever budget is left.
const BUDGET_MS = 58_000;

/**
 * Authorize the caller. The external pinger (e.g. cron-job.org) and Vercel Cron
 * both send `Authorization: Bearer <CRON_SECRET>`; we also accept `x-cron-secret`
 * for manual curl tests. If CRON_SECRET is unset in production we refuse (fail
 * closed). Same scheme as /api/cron/facebook-post + /api/cron/autopilot.
 */
function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const t0 = Date.now();
    const publish = await publishDue();
    // Give a due Auto-Pilot Run the remaining budget (it skips itself if too little
    // is left, and runs on the next pinger tick instead — never half-publishing).
    const autopilot = await runDueAutopilot({ budgetMs: BUDGET_MS - (Date.now() - t0) }).catch(() => ({ ran: 0, skipped: true, reason: "error" }));
    return NextResponse.json({ ok: true, publish, autopilot });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "publish-due run failed." },
      { status: 500 },
    );
  }
}

// The pinger may prefer POST; same auth + behavior.
export const POST = GET;
