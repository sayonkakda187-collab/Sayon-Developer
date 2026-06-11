import { prisma } from "@/lib/db";
import { getAgentSettings } from "@/lib/agent/store";
import { isAiConfigured } from "@/lib/agent/anthropic";
import { AgentSettingsForm } from "@/components/admin/AgentSettings";
import { ToastProvider } from "@/components/admin/Toast";

export const dynamic = "force-dynamic";

export default async function AgentSettingsPage() {
  const [settings, categories] = await Promise.all([
    getAgentSettings(),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { name: true, slug: true } }),
  ]);
  return (
    <ToastProvider>
      <AgentSettingsForm initial={settings} aiConfigured={isAiConfigured()} categories={categories} />
    </ToastProvider>
  );
}
