import "server-only";

import { anthropicCall, type AnthropicMessage, type ContentBlock } from "./anthropic";
import { PHASE1_TOOLS, executeTool } from "./tools";

export type AgentTurnInput = {
  // The prior conversation as plain text turns (tool calls are internal to a turn).
  messages: { role: "user" | "assistant"; content: string }[];
  model: string;
  categories: string[];
  customInstructions?: string;
};

export type ToolLogEntry = { tool: string; summary: string; isError?: boolean };
export type AgentTurnResult = {
  reply: string;
  toolLog: ToolLogEntry[];
  stoppedAtMax: boolean;
};

// Hard ceiling on tool executions per user message (cost + latency guard).
const MAX_TOOL_CALLS = 6;

function isText(b: ContentBlock): b is Extract<ContentBlock, { type: "text" }> {
  return b.type === "text";
}
function isToolUse(b: ContentBlock): b is Extract<ContentBlock, { type: "tool_use" }> {
  return b.type === "tool_use";
}

function buildSystemPrompt(categories: string[], custom?: string): string {
  return `You are the AI Assistant for "The Daily Ledger", an independent online news publication. You help the owner run the site by using tools in the admin panel.

SAFETY RULES — never violate:
- NEVER invent facts, quotes, statistics, names, or dates. Base any draft on real news found with search_news. When a specific fact is needed but unknown, leave a clear "[VERIFY: ...]" placeholder instead of fabricating.
- ALWAYS attribute sources: when you create a draft from a news item, pass its source_url so a source link is included.
- Write ORIGINAL prose in the site's own voice — never copy or closely paraphrase a source's wording.
- You can READ articles, SEARCH news, and CREATE/EDIT DRAFTS only. You CANNOT publish, edit a live (published) article, or share to Facebook — those need the owner's explicit approval and are not available to you yet. Never claim to have published or shared anything.
- Respect the site's existing categories: ${categories.length ? categories.join(", ") : "(none defined yet)"}.
- Be concise and act efficiently — a few tool calls at most per request. After acting, briefly tell the owner what you did and reference any new draft by its title (and edit URL when you have it).${
    custom && custom.trim() ? `\n\nOWNER'S CUSTOM INSTRUCTIONS:\n${custom.trim()}` : ""
  }`;
}

/**
 * Run one assistant turn: call the model, execute any tools it requests (bounded
 * by MAX_TOOL_CALLS), feed results back, and repeat until it answers in text.
 * When the tool budget is spent, the final call omits tools so the model must
 * summarize in words rather than loop forever.
 */
export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const messages: AnthropicMessage[] = input.messages.map((m) => ({ role: m.role, content: m.content }));
  const system = buildSystemPrompt(input.categories, input.customInstructions);
  const toolLog: ToolLogEntry[] = [];
  let toolCalls = 0;
  let stoppedAtMax = false;

  // Iteration cap as a backstop beyond the tool-call budget.
  for (let iter = 0; iter < MAX_TOOL_CALLS + 2; iter++) {
    const allowTools = toolCalls < MAX_TOOL_CALLS;
    const { content } = await anthropicCall({
      model: input.model,
      system,
      messages,
      tools: allowTools ? PHASE1_TOOLS : undefined,
      maxTokens: 1600,
    });

    const toolUses = allowTools ? content.filter(isToolUse) : [];
    const text = content.filter(isText).map((b) => b.text).join("\n").trim();

    if (toolUses.length === 0) {
      // The model answered in words — we're done for this turn.
      return {
        reply: text || (allowTools ? "(no reply)" : "I reached the tool-call limit for this message — here's what I have so far."),
        toolLog,
        stoppedAtMax,
      };
    }

    // Record the assistant turn (text + tool_use blocks) before sending results.
    messages.push({ role: "assistant", content });

    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      if (toolCalls >= MAX_TOOL_CALLS) {
        stoppedAtMax = true;
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: "Tool-call limit for this message reached. Stop calling tools and summarize what you have.",
          is_error: true,
        });
        continue;
      }
      toolCalls++;
      let r;
      try {
        r = await executeTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, input.model);
      } catch (e) {
        r = { content: e instanceof Error ? e.message : "Tool failed.", summary: `${tu.name} failed`, isError: true };
      }
      toolLog.push({ tool: tu.name, summary: r.summary, isError: r.isError });
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError });
    }
    if (toolCalls >= MAX_TOOL_CALLS) stoppedAtMax = true;
    messages.push({ role: "user", content: results });
  }

  return { reply: "I stopped after several steps — please narrow the request.", toolLog, stoppedAtMax: true };
}
