"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { isValidModel } from "@/lib/aiModels";
import { saveAgentSettings, normalizeAutopilot, type AgentSettings } from "@/lib/agent/store";
import { normalizePreferredTimes } from "@/lib/scheduleSlots";

/** Save Agent Settings. Publishing + sharing approval are hard-required and are
 *  re-forced here + in saveAgentSettings regardless of what the form sends. */
export async function updateAgentSettings(input: AgentSettings): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const c = input?.capabilities ?? ({} as AgentSettings["capabilities"]);
  const r = input?.requireApproval ?? ({} as AgentSettings["requireApproval"]);
  const safe: AgentSettings = {
    capabilities: {
      newsSearch: !!c.newsSearch,
      drafting: !!c.drafting,
      editing: !!c.editing,
      publishing: !!c.publishing,
      sharing: !!c.sharing,
    },
    requireApproval: {
      editLive: r.editLive !== false,
      publishing: true,
      sharing: true,
    },
    customInstructions: typeof input?.customInstructions === "string" ? input.customInstructions.slice(0, 4000) : "",
    model: isValidModel(input?.model) ? input.model : null,
    autopilot: normalizeAutopilot(input?.autopilot),
    preferredTimes: normalizePreferredTimes(input?.preferredTimes),
  };
  await saveAgentSettings(safe);
  revalidatePath("/admin/ai-assistant/settings");
  return { ok: true };
}
