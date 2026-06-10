import "server-only";

import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/aiModels";

// Tool-capable Anthropic Messages client for the admin agent. Reuses the SAME
// provider + key (ANTHROPIC_API_KEY) as lib/aiAssist.ts — no second AI provider.
// The existing aiAssist callAnthropic is text-only; this one adds `tools`.

const ENDPOINT = "https://api.anthropic.com/v1/messages";
const VERSION = "2023-06-01";

export type AnthropicTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };

export type AnthropicMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export type AgentErrorCode = "auth" | "quota" | "network" | "parse" | "unknown";
export class AgentError extends Error {
  code: AgentErrorCode;
  constructor(code: AgentErrorCode, message: string) {
    super(message);
    this.name = "AgentError";
    this.code = code;
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Validated model id → itself; otherwise the env default, otherwise the cheapest. */
export function resolveModel(requested?: string): string {
  if (isValidModel(requested)) return requested;
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_ID;
}

/** One Messages API call. Returns the assistant content blocks + stop reason. */
export async function anthropicCall(opts: {
  model: string;
  system: string;
  messages: AnthropicMessage[];
  tools?: AnthropicTool[];
  maxTokens?: number;
}): Promise<{ content: ContentBlock[]; stopReason: string | null }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AgentError("auth", "ANTHROPIC_API_KEY is not configured.");

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": VERSION,
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? 1500,
        system: opts.system,
        messages: opts.messages,
        ...(opts.tools && opts.tools.length ? { tools: opts.tools } : {}),
      }),
      cache: "no-store",
    });
  } catch {
    throw new AgentError("network", "Could not reach the AI service.");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AgentError("auth", "The AI API key was rejected.");
    if (res.status === 429) throw new AgentError("quota", "AI rate limit or credit reached.");
    throw new AgentError("unknown", `AI service error (HTTP ${res.status}).`);
  }

  const data = (await res.json().catch(() => null)) as
    | { content?: ContentBlock[]; stop_reason?: string }
    | null;
  if (!data || !Array.isArray(data.content)) {
    throw new AgentError("parse", "AI returned an unexpected response.");
  }
  return { content: data.content as ContentBlock[], stopReason: data.stop_reason ?? null };
}
