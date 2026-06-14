import "server-only";

import { anthropicCall, type AnthropicMessage, type ContentBlock } from "./anthropic";
import { buildTools, executeTool } from "./tools";
import type { AgentSettings, AgentActionRecord } from "./store";
import { formatSchedule, toLocalInput } from "@/lib/fbSchedule";

export type AgentTurnInput = {
  messages: { role: "user" | "assistant"; content: string }[];
  model: string;
  categories: string[];
  settings: AgentSettings;
};

export type ToolLogEntry = { tool: string; summary: string; isError?: boolean };
export type AgentTurnResult = {
  reply: string;
  toolLog: ToolLogEntry[];
  proposedActions: AgentActionRecord[];
  stoppedAtMax: boolean;
};

const MAX_TOOL_CALLS = 6;

function isText(b: ContentBlock): b is Extract<ContentBlock, { type: "text" }> {
  return b.type === "text";
}
function isToolUse(b: ContentBlock): b is Extract<ContentBlock, { type: "tool_use" }> {
  return b.type === "tool_use";
}

function capLine(s: AgentSettings): string {
  const on = (b: boolean) => (b ? "on" : "OFF");
  const c = s.capabilities;
  return `news search ${on(c.newsSearch)}, drafting ${on(c.drafting)}, editing ${on(c.editing)}, publishing ${on(c.publishing)}, Facebook sharing ${on(c.sharing)}, page earnings ${on(c.pageEarnings)}`;
}

function buildSystemPrompt(input: AgentTurnInput): string {
  const { categories, settings } = input;
  return `You are the AI Assistant for "The Daily Ledger", an independent online news publication. You help the owner run the site by using tools in the admin panel.

SAFETY RULES — never violate:
- NEVER invent facts, quotes, statistics, names, or dates. Base any draft on real news found with search_news. When a fact is needed but unknown, leave a clear "[VERIFY: ...]" placeholder instead of fabricating.
- ALWAYS attribute sources: when creating a draft from a news item, pass its source_url so a source link is included.
- Write ORIGINAL prose in the site's own voice — never copy or closely paraphrase a source's wording.
- Respect the site's existing categories: ${categories.length ? categories.join(", ") : "(none defined yet)"}.

GATED ACTIONS — these need the owner's explicit approval:
- publish_article, update_published_article (editing a LIVE article), share_to_facebook, and set_page_earnings do NOT execute when you call them. They PROPOSE an action that the owner must Approve. Tell the owner you've proposed it and what it will do. NEVER claim something was published, edited live, shared, or saved until it is actually approved and done. Do not call the same gated tool repeatedly for one request.
- Reading (list_articles, get_article, get_share_stats), searching news, and creating/updating DRAFTS happen immediately (no approval).

PAGE EARNINGS (Page Control) — set_page_earnings:
- When the owner pastes or describes a Page's daily earnings ("Sunrise News — Jun 1 $2.10, Jun 2 $1.80 …", a "date — amount" block under a page name, or several pages at once), parse them into entries of { pageName, date, amount } and call set_page_earnings ONCE with all of them. Strip $ and commas; resolve dates to YYYY-MM-DD in Asia/Phnom_Penh (a bare day like "1" means the current month/year). Re-entering a (page, day) OVERWRITES — the preview flags that.
- This is GATED: the tool returns a preview (Page · Date · Amount, with overwrite + unmatched flags) the owner approves before anything is saved. If the tool reports page names it couldn't match (or that are ambiguous), relay them and ask the owner to clarify or pick — NEVER invent a page or silently guess. This tool only records earnings; it cannot connect pages, manage managers, or change other Page Control data.

SCHEDULING (all times Asia/Phnom_Penh):
- The current time in Asia/Phnom_Penh is ${formatSchedule(new Date())} (right now it is ${toLocalInput(new Date())} in 'YYYY-MM-DD HH:mm').
- When the owner asks to publish at a specific or relative time ("at 9pm", "tonight 9pm", "tomorrow 7am", "in 2 hours"), resolve it to an absolute Asia/Phnom_Penh time and pass it to publish_article as the 'when' parameter ('YYYY-MM-DD HH:mm', 24-hour). The owner can still adjust the time on the approval card before approving.
- The owner's preferred posting times are: ${settings.preferredTimes.join(", ")} (Phnom Penh). If they say "schedule it for tonight" without a specific time, suggest the next upcoming preferred time.
- Publishing/scheduling still needs approval — propose it; never claim it's scheduled or published until approved.

Currently enabled capabilities: ${capLine(settings)}. If a capability is off, its tool isn't available — tell the owner to enable it in Agent Settings rather than trying.

Be concise and efficient — a few tool calls at most per request. After acting, briefly summarize what you did or proposed, and reference drafts by their edit URL when you have it.${
    settings.customInstructions.trim() ? `\n\nOWNER'S CUSTOM INSTRUCTIONS (follow these):\n${settings.customInstructions.trim()}` : ""
  }`;
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnResult> {
  const messages: AnthropicMessage[] = input.messages.map((m) => ({ role: m.role, content: m.content }));
  const system = buildSystemPrompt(input);
  const tools = buildTools(input.settings);
  const ctx = { model: input.model, settings: input.settings };

  const toolLog: ToolLogEntry[] = [];
  const proposedActions: AgentActionRecord[] = [];
  let toolCalls = 0;
  let stoppedAtMax = false;

  for (let iter = 0; iter < MAX_TOOL_CALLS + 2; iter++) {
    const allowTools = toolCalls < MAX_TOOL_CALLS;
    const { content } = await anthropicCall({
      model: input.model,
      system,
      messages,
      tools: allowTools ? tools : undefined,
      maxTokens: 1600,
    });

    const toolUses = allowTools ? content.filter(isToolUse) : [];
    const text = content.filter(isText).map((b) => b.text).join("\n").trim();

    if (toolUses.length === 0) {
      return {
        reply: text || (allowTools ? "(no reply)" : "I reached the tool-call limit for this message — here's what I have so far."),
        toolLog,
        proposedActions,
        stoppedAtMax,
      };
    }

    messages.push({ role: "assistant", content });

    const results: ContentBlock[] = [];
    for (const tu of toolUses) {
      if (toolCalls >= MAX_TOOL_CALLS) {
        stoppedAtMax = true;
        results.push({ type: "tool_result", tool_use_id: tu.id, content: "Tool-call limit reached. Stop calling tools and summarize.", is_error: true });
        continue;
      }
      toolCalls++;
      let r;
      try {
        r = await executeTool(tu.name, (tu.input ?? {}) as Record<string, unknown>, ctx);
      } catch (e) {
        r = { content: e instanceof Error ? e.message : "Tool failed.", summary: `${tu.name} failed`, isError: true };
      }
      toolLog.push({ tool: tu.name, summary: r.summary, isError: r.isError });
      if (r.proposedAction) proposedActions.push(r.proposedAction);
      results.push({ type: "tool_result", tool_use_id: tu.id, content: r.content, is_error: r.isError });
    }
    if (toolCalls >= MAX_TOOL_CALLS) stoppedAtMax = true;
    messages.push({ role: "user", content: results });
  }

  return { reply: "I stopped after several steps — please narrow the request.", toolLog, proposedActions, stoppedAtMax: true };
}
