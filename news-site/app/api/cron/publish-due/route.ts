import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishDue } from "@/lib/publish";
import { runDueAutopilot, countDueRuns } from "@/lib/autopilot";
import { addAction, updateAction } from "@/lib/agent/store";

// The pinger-driven dispatcher — FAST-ACK. It publishes every article whose
// scheduled time has arrived (+ fires the Facebook auto-share THEN) AND runs any
// due Auto-Pilot Runs. To never make the pinger hang (cron-job.org waits ~30s), it
// RESPONDS IMMEDIATELY (<2s) with a summary of what's due, then does the heavy work
// AFTER the response (Vercel keeps the function alive via the request context's
// `waitUntil`, bounded by maxDuration). All the underlying claims are idempotent —
// nothing publishes, shares, or runs twice even if pings overlap — and anything not
// finished in one invocation stays claimed-but-pending for the next ~10-min ping.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Budget for the BACKGROUND work (after the ack). Leaves headroom under the 60s
// maxDuration for the response + the activity-log writes.
const BUDGET_MS = 54_000;

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

/**
 * Run a promise to completion AFTER the response is sent. On Vercel this hooks the
 * request context's `waitUntil` (what `@vercel/functions` uses internally) so the
 * lambda isn't frozen at response time; locally it just runs (the dev server stays
 * alive). Errors are swallowed so a background failure can't crash anything.
 */
function runAfterResponse(p: Promise<unknown>): void {
  const safe = Promise.resolve(p).catch(() => {});
  try {
    const ctx = (globalThis as Record<symbol, unknown>)[Symbol.for("@vercel/request-context")] as
      | { get?: () => { waitUntil?: (p: Promise<unknown>) => void } | undefined }
      | undefined;
    const waitUntil = ctx?.get?.()?.waitUntil;
    if (typeof waitUntil === "function") {
      waitUntil(safe);
      return;
    }
  } catch {
    /* fall through to bare execution */
  }
  void safe;
}

/** The heavy work, run after the ack. Idempotent; logs a single activity entry
 *  (claim → completion) whenever a ping actually had work to do. */
async function doWork(claimed: { publishes: number; runs: number }): Promise<void> {
  const hadWork = claimed.publishes > 0 || claimed.runs > 0;
  let logId: string | undefined;
  if (hadWork) {
    const rec = await addAction({
      type: "cron_ping",
      status: "pending",
      summary: `Auto-Pilot ping: ${claimed.publishes} publish${claimed.publishes === 1 ? "" : "es"} + ${claimed.runs} run${claimed.runs === 1 ? "" : "s"} due`,
      detail: "Working in the background…",
      params: { ...claimed },
    }).catch(() => undefined);
    logId = rec?.id;
  }

  try {
    const t0 = Date.now();
    const publish = await publishDue();
    const autopilot = await runDueAutopilot({ budgetMs: BUDGET_MS - (Date.now() - t0) });

    if (logId) {
      const parts: string[] = [];
      if (publish.published) parts.push(`${publish.published} published`);
      if (publish.failed) parts.push(`${publish.failed} failed`);
      if (autopilot.published) parts.push(`${autopilot.published} auto-published`);
      if (autopilot.scheduled) parts.push(`${autopilot.scheduled} scheduled`);
      if (autopilot.created && !autopilot.published && !autopilot.scheduled) parts.push(`${autopilot.created} drafted`);
      await updateAction(logId, {
        status: "done",
        result: parts.length ? parts.join(", ") : "nothing left to do",
        decidedAt: new Date().toISOString(),
      }).catch(() => {});
    }
  } catch (e) {
    if (logId) {
      await updateAction(logId, { status: "failed", error: e instanceof Error ? e.message : "ping failed", decidedAt: new Date().toISOString() }).catch(() => {});
    }
  }
}

async function handle(req: Request): Promise<NextResponse> {
  // Unauthenticated callers get a cheap 200 PROBE (no work) so pingers that probe
  // first don't see an error; the actual work only runs for authorized calls.
  if (!authorize(req)) {
    return NextResponse.json({ ok: true, probe: true, note: "Send Authorization: Bearer <CRON_SECRET> to trigger work." });
  }

  const now = new Date();
  // Cheap pre-count so the ack can summarize what's due (no heavy work here).
  let publishes = 0;
  let runs = 0;
  try {
    [publishes, runs] = await Promise.all([
      prisma.article.count({ where: { status: "scheduled", scheduledAt: { lte: now } } }),
      countDueRuns(now),
    ]);
  } catch {
    /* counts are best-effort; the background work still runs */
  }

  // Kick off the real work AFTER we respond, then ack immediately.
  runAfterResponse(doWork({ publishes, runs }));

  return NextResponse.json({ ok: true, claimed: { publishes, runs }, background: true });
}

export async function GET(req: Request): Promise<NextResponse> {
  return handle(req);
}

// The pinger may prefer POST; same auth + fast-ack behavior.
export const POST = GET;

// Cheap reachability probe (some pingers HEAD the URL first) — always 200, no work.
export function HEAD(): NextResponse {
  return new NextResponse(null, { status: 200 });
}
