import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { runAutopilot } from "@/lib/autopilot";

// Admin-only "Run now" for the Auto-Pilot (the Agent Settings button). Separate
// from the CRON_SECRET cron route — this one is gated by the admin session and
// runs even while the daily toggle is OFF (for testing / on-demand drafting).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST() {
  await requireAdmin();
  const result = await runAutopilot({ manual: true });
  return NextResponse.json(result);
}
