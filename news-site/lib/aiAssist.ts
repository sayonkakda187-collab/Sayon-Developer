import "server-only";

// Server-only AI writing assistant for the Trending News page. Calls the
// Anthropic Messages API via raw fetch (no SDK dependency). The key
// (ANTHROPIC_API_KEY) is read here only and NEVER sent to the browser.
//
// COPYRIGHT / ORIGINALITY: we send the AI only the HEADLINE + topic — never a
// source's scraped full text — and the system prompt forces ORIGINAL writing
// from general knowledge (no copying / close paraphrase, no fabricated quotes
// or stats). Output is a STARTING POINT the admin must fact-check and edit; it
// is never auto-published.

import { DEFAULT_MODEL_ID, isValidModel } from "@/lib/aiModels";
import { sanitizeDraft, cleanExcerpt } from "@/lib/aiDraft";

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Resolve the model to use: a validated per-request pick wins; otherwise the
// env default (ANTHROPIC_MODEL), otherwise the cheapest capable model. Runs only
// on an explicit click, so cost is bounded by usage.
function resolveModel(requested?: string): string {
  if (isValidModel(requested)) return requested;
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL_ID;
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AiAssistResult = {
  brief: string;
  headlines: string[];
  excerpt: string;
  outline: string;
  background: string;
  draft: string;
};

export type AiAssistErrorCode = "auth" | "quota" | "network" | "parse" | "unknown";
export class AiAssistError extends Error {
  code: AiAssistErrorCode;
  constructor(code: AiAssistErrorCode, message: string) {
    super(message);
    this.name = "AiAssistError";
    this.code = code;
  }
}

const SYSTEM_PROMPT = `You are an editorial assistant for an independent news publisher. The editor gives you only a trending HEADLINE and (optionally) a topic/category. You help them START an ORIGINAL article that they will fact-check and edit before publishing.

STRICT RULES:
- Write ORIGINAL content in your own words from general knowledge. Do NOT copy or closely paraphrase any single source's article text. You are NOT given the source article and must not pretend to have it.
- Do NOT fabricate specific quotes, statistics, names, dates, or events you are not confident about. When a concrete fact would be needed, write a clearly bracketed placeholder like "[VERIFY: latest figure]" instead of inventing one.
- Neutral, factual news tone. No opinion, no marketing language, no clickbait.
- Assume some details may be outdated; the editor will verify current facts.
- The first draft must be genuinely original prose suitable as a starting point — not a reworded copy of the headline's source.

CRITICAL — the "draft" is publishable article text:
- The "draft" field must contain ONLY the article body itself (the real paragraphs, with inline [VERIFY: ...] markers where a fact must be checked).
- Do NOT add any editor's note, disclaimer, reminder, or "verify before publication" / "rewrite in your own words" sentence as a header or footer of the draft. Do NOT end the draft with such a note. Do NOT add a trailing "---" divider followed by a note. No "Editor's note:". The reminder is shown to the editor elsewhere in the UI — it must never appear in the draft body.

Respond with ONLY a JSON object (no markdown fences, no preamble) matching exactly:
{
  "brief": "3-5 sentence plain-language summary of what this story is likely about and why it matters (the editor's reference).",
  "headlines": ["2-3 original alternative headline options, as an array of strings"],
  "excerpt": "A clean 1-2 sentence summary (~120-160 characters) suitable as the article's excerpt / SEO meta-description. Plain prose only — NO markdown, NO [VERIFY] markers, NO editor's note.",
  "outline": "A structured outline as markdown with section headings and bullet points.",
  "background": "Relevant background context and 3-5 distinct angles worth covering, as markdown.",
  "draft": "A genuinely ORIGINAL first draft in neutral news style, as markdown (~300-500 words), using [VERIFY: ...] placeholders wherever a specific fact must be checked. ARTICLE BODY ONLY — no editor's note, disclaimer, or verify-before-publication footer/header."
}`;

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  error?: { type?: string; message?: string };
};

/**
 * Single chokepoint for the Anthropic Messages API: builds the request, maps
 * transport/HTTP failures to AiAssistError, and returns the concatenated text.
 * Shared by both the trending "assist" and the editor "edit" flows.
 */
async function callAnthropic(opts: {
  model?: string;
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiAssistError("auth", "ANTHROPIC_API_KEY is not configured.");

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: resolveModel(opts.model),
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      cache: "no-store",
    });
  } catch {
    throw new AiAssistError("network", "Could not reach the AI service.");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiAssistError("auth", "The AI API key was rejected.");
    if (res.status === 429) throw new AiAssistError("quota", "AI rate limit or credit reached. Try again shortly.");
    throw new AiAssistError("unknown", `AI service error (HTTP ${res.status}).`);
  }

  const data = (await res.json().catch(() => ({}))) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  if (!text) throw new AiAssistError("parse", "AI returned an empty response.");
  return text;
}

/** Extract the first JSON object from the model's text output. */
function parseResult(text: string): AiAssistResult {
  let raw = text.trim();
  // Strip accidental code fences if the model added them.
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiAssistError("parse", "AI returned an unexpected format.");
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiAssistError("parse", "AI returned malformed JSON.");
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const headlines = Array.isArray(obj.headlines)
    ? obj.headlines.map((h) => str(h)).filter(Boolean).slice(0, 5)
    : [];
  const brief = str(obj.brief);
  // Defense-in-depth: strip any reminder/editor's-note the model may still emit
  // so the draft body is publishable, and derive a clean excerpt.
  const draft = sanitizeDraft(str(obj.draft));
  const excerpt = cleanExcerpt({ excerpt: str(obj.excerpt), brief, draft });
  return {
    brief,
    headlines,
    excerpt,
    outline: str(obj.outline),
    background: str(obj.background),
    draft,
  };
}

/**
 * Generate the 5-section assist payload from a headline + optional topic. Sends
 * the AI ONLY the headline and topic — no scraped article body.
 */
export async function generateAiAssist(input: {
  headline: string;
  topic?: string;
  model?: string;
}): Promise<AiAssistResult> {
  const headline = input.headline.trim().slice(0, 300);
  const topic = (input.topic ?? "").trim().slice(0, 100);
  if (!headline) throw new AiAssistError("unknown", "A headline is required.");

  const userMessage =
    `Trending headline: "${headline}"` +
    (topic ? `\nTopic/category: ${topic}` : "") +
    `\n\nHelp me start an original article about this. Remember: I do NOT have the source text, and you must write original content I will fact-check.`;

  const text = await callAnthropic({
    model: input.model,
    system: SYSTEM_PROMPT,
    user: userMessage,
    maxTokens: 2000,
  });
  return parseResult(text);
}

// ── Editor "edit this article" flow ──────────────────────────────────────────
// Revises the admin's OWN article (title + body they wrote) per a quick-action
// or free-form instruction. Returns revised fields; the editor applies them as
// an UNSAVED change the admin reviews. Never auto-saves or publishes.

export type AiEditResult = {
  /** Revised title, when the instruction targets the headline. */
  title?: string;
  /** Revised article body (markdown), when the instruction targets the body. */
  body?: string;
  /** One-line summary of what changed, shown to the admin. */
  summary: string;
};

const EDIT_SYSTEM_PROMPT = `You are an editing assistant for an independent news publisher. The editor gives you THEIR OWN article (title and/or markdown body that they wrote) and an instruction. Revise it per the instruction.

STRICT RULES:
- Edit only as the instruction asks; preserve the article's facts and meaning unless explicitly told to change them.
- Do NOT invent specific quotes, statistics, names, or dates. If expansion needs a concrete fact you are not sure of, insert a clearly bracketed placeholder like "[VERIFY: ...]" instead of fabricating.
- Keep a neutral, factual news tone (no opinion, marketing, or clickbait). Preserve the author's voice.
- Keep markdown formatting valid. Return the FULL revised text for whichever field(s) you change, not a diff.

Respond with ONLY a JSON object (no markdown fences, no preamble) matching exactly:
{
  "title": "the revised title — include ONLY if the instruction changes the title, else omit or null",
  "body": "the full revised article body in markdown — include ONLY if the instruction changes the body, else omit or null",
  "summary": "one short sentence describing what you changed"
}`;

export async function editArticle(input: {
  title: string;
  body: string;
  instruction: string;
  /** "title" | "body" — which field the instruction targets (hint for the model). */
  target?: "title" | "body";
  model?: string;
}): Promise<AiEditResult> {
  const title = input.title.trim().slice(0, 300);
  const body = input.body.slice(0, 24000); // generous cap; protects token usage
  const instruction = input.instruction.trim().slice(0, 600);
  if (!instruction) throw new AiAssistError("unknown", "An instruction is required.");
  if (!title && !body) throw new AiAssistError("unknown", "There's nothing to edit yet — add a title or body first.");

  const userMessage =
    `INSTRUCTION: ${instruction}` +
    (input.target ? `\n(This primarily targets the ${input.target}.)` : "") +
    `\n\nCURRENT TITLE:\n${title || "(none)"}` +
    `\n\nCURRENT BODY (markdown):\n${body || "(none)"}`;

  const text = await callAnthropic({
    model: input.model,
    system: EDIT_SYSTEM_PROMPT,
    user: userMessage,
    maxTokens: 4000,
  });

  const raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new AiAssistError("parse", "AI returned an unexpected format.");
  }
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new AiAssistError("parse", "AI returned malformed JSON.");
  }
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const newTitle = str(obj.title);
  const newBody = str(obj.body);
  if (!newTitle && !newBody) throw new AiAssistError("parse", "AI didn’t return any changes.");
  return {
    title: newTitle || undefined,
    body: newBody || undefined,
    summary: str(obj.summary) || "Updated the article.",
  };
}
