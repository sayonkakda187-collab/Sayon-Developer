import { getAgentSettings } from "@/lib/agent/store";
import { isAiConfigured } from "@/lib/agent/anthropic";
import { AgentSettingsForm } from "@/components/admin/AgentSettings";
import { ToastProvider } from "@/components/admin/Toast";

export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const settings = await getAgentSettings();
  return (
    <ToastProvider>
      <AgentSettingsForm initial={settings} aiConfigured={isAiConfigured()} />
    </ToastProvider>
  );
}
