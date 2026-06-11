import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getAgentSettings } from "@/lib/agent/store";
import { nextFreeSlots } from "@/lib/scheduleSlots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// The next FREE preferred posting slots (UTC ISO), skipping times already taken by
// scheduled articles. Drives the approval-card preset chips + "auto-stagger":
// approving drafts one after another each lands on the next open slot (because the
// just-scheduled time is then excluded on the next fetch).
export async function GET(req: Request) {
  await requireAdmin();
  const count = Math.min(8, Math.max(1, Number(new URL(req.url).searchParams.get("count") ?? "5") || 5));
  const [settings, scheduled] = await Promise.all([
    getAgentSettings(),
    prisma.article.findMany({ where: { status: "scheduled", scheduledAt: { not: null } }, select: { scheduledAt: true } }),
  ]);
  const takenUtcMs = scheduled.map((s) => s.scheduledAt!.getTime());
  const slots = nextFreeSlots({ times: settings.preferredTimes, count, takenUtcMs });
  return NextResponse.json({ ok: true, slots, preferredTimes: settings.preferredTimes });
}
