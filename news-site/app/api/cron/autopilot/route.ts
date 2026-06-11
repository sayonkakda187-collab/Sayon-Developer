import { NextResponse } from "next/server";
import { runAutopilot } from "@/lib/autopilot";

// Mutates the DB + calls the AI; never statically cached. maxDuration is set to
// the Hobby ceiling (60s) — runAutopilot self-limits how many drafts it starts so
// it always finishes inside this budget (push + activity log included).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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
    const result = await runAutopilot({ manual: false });
    return NextResponse.json(result);
  } catch (e) {
    // runAutopilot is designed not to throw, but guard anyway.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Auto-Pilot run failed." },
      { status: 500 },
    );
  }
}

// Some schedulers prefer POST; same auth + behavior.
export const POST = GET;
