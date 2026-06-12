import { NextResponse } from "next/server";
import { runDueAutopilot } from "@/lib/autopilot";

// A once-daily Vercel-cron SAFETY NET that dispatches any due Auto-Pilot Run (same
// idempotent dispatcher the pinger-driven /api/cron/publish-due uses, so a Run
// never runs twice). The external pinger is what fires Runs near their actual
// times; this guarantees at least one daily attempt if the pinger is down.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUDGET_MS = 58_000;

/**
 * Authorize the caller. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`;
 * we also accept `x-cron-secret` for manual curl tests. If CRON_SECRET is unset in
 * production we refuse (fail closed) so no outsider can trigger drafting. (Same
 * scheme as /api/cron/facebook-post.)
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
    const result = await runDueAutopilot({ budgetMs: BUDGET_MS });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Auto-Pilot run failed." },
      { status: 500 },
    );
  }
}

// Some schedulers prefer POST; same auth + behavior.
export const POST = GET;
