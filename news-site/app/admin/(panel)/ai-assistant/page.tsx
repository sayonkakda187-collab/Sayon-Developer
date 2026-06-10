import { AgentChat } from "@/components/admin/AgentChat";
import { isAiConfigured } from "@/lib/agent/anthropic";

// Live agent + env-dependent; never statically cache.
export const dynamic = "force-dynamic";

export default async function AiAssistantPage() {
  // Admin auth is enforced by the (panel) layout. We only pass whether the AI key
  // is set (server-decided) so the chat can show a setup state — never the key.
  return <AgentChat aiConfigured={isAiConfigured()} />;
}
