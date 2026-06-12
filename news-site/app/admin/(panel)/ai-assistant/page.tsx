import { AgentChat } from "@/components/admin/AgentChat";
import { isAiConfigured } from "@/lib/agent/anthropic";
import { prisma } from "@/lib/db";
import { getAgentSettings } from "@/lib/agent/store";
import { rangeToUnix, ppToday } from "@/lib/fbInsightsRange";

// Live agent + env-dependent; never statically cache.
export const dynamic = "force-dynamic";

/** Phnom-Penh "HH:MM" of the next enabled Auto-Pilot run (or null when off). */
function nextRunLabel(settings: Awaited<ReturnType<typeof getAgentSettings>>): string | null {
  const ap = settings.autopilot;
  if (!ap.enabled) return null;
  const runs = ap.runs.filter((r) => r.enabled);
  if (runs.length === 0) return null;
  const now = Date.now();
  let bestMs = Infinity;
  let bestUtc = "";
  for (const r of runs) {
    const [h, m] = r.timeUtc.split(":").map(Number);
    const t = new Date();
    t.setUTCHours(h, m, 0, 0);
    let occ = t.getTime();
    if (occ <= now) occ += 86_400_000;
    if (occ < bestMs) { bestMs = occ; bestUtc = r.timeUtc; }
  }
  const [h, m] = bestUtc.split(":").map(Number);
  const tot = (h * 60 + m + 7 * 60) % (24 * 60); // UTC → Phnom Penh (+7, no DST)
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}

export default async function AiAssistantPage() {
  // Admin auth is enforced by the (panel) layout. We only pass whether the AI key
  // is set (server-decided) so the chat can show a setup state — never the key.
  const aiConfigured = isAiConfigured();

  // Live context for the welcome hero chips (real data; read-only counts).
  let drafts = 0;
  let scheduledToday = 0;
  let nextRun: string | null = null;
  if (aiConfigured) {
    const today = ppToday();
    const { since, until } = rangeToUnix(today, today);
    try {
      const [d, s, settings] = await Promise.all([
        prisma.article.count({ where: { status: "draft" } }),
        prisma.article.count({ where: { status: "scheduled", scheduledAt: { gte: new Date(since * 1000), lt: new Date(until * 1000) } } }),
        getAgentSettings(),
      ]);
      drafts = d;
      scheduledToday = s;
      nextRun = nextRunLabel(settings);
    } catch {
      /* hero chips are best-effort; the chat still works without them */
    }
  }

  return <AgentChat aiConfigured={aiConfigured} context={{ drafts, scheduledToday, nextRun }} />;
}
