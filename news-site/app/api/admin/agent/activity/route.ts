import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listActions } from "@/lib/agent/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Recent agent action / approval log for the AI Assistant page (most recent first).
export async function GET() {
  await requireAdmin();
  const actions = await listActions(30);
  return NextResponse.json({ ok: true, actions });
}
