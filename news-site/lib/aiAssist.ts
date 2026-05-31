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

const ANTHROPIC_ENDPOINT = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// Default to the cheapest capable model; overridable via env. Runs only on an
// explicit click, so cost is bounded by usage.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type AiAssistResult = {
  brief: string;
  headlines: string[];
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
- Assume some details may be outdated; prompt the editor to verify current facts.
- The first draft must be genuinely original prose suitable as a starting point — not a reworded copy of the headline's source.

Respond with ONLY a JSON object (no markdown fences, no preamble) matching exactly:
{
  "brief": "3-5 sentence plain-language summary of what this story is likely about and why it matters (the editor's reference).",
  "headlines": ["2-3 original alternative headline options, as an array of strings"],
  "outline": "A structured outline as markdown with section headings and bullet points.",
  "background": "Relevant background context and 3-5 distinct angles worth covering, as markdown.",
  "draft": "A genuinely ORIGINAL first draft in neutral news style, as markdown (~300-500 words), using [VERIFY: ...] placeholders wherever a specific fact must be checked. End with a one-line note reminding the editor to fact-check and write in their own words."
}`;

type AnthropicResponse = {
  content?: { type: string; text?: string }[];
  error?: { type?: string; message?: string };
};

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
  return {
    brief: str(obj.brief),
    headlines,
    outline: str(obj.outline),
    background: str(obj.background),
    draft: str(obj.draft),
  };
}

/**
 * Generate the 5-section assist payload from a headline + optional topic. Sends
 * the AI ONLY the headline and topic — no scraped article body.
 */
export async function generateAiAssist(input: {
  headline: string;
  topic?: string;
}): Promise<AiAssistResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiAssistError("auth", "ANTHROPIC_API_KEY is not configured.");

  const headline = input.headline.trim().slice(0, 300);
  const topic = (input.topic ?? "").trim().slice(0, 100);
  if (!headline) throw new AiAssistError("unknown", "A headline is required.");

  const userMessage =
    `Trending headline: "${headline}"` +
    (topic ? `\nTopic/category: ${topic}` : "") +
    `\n\nHelp me start an original article about this. Remember: I do NOT have the source text, and you must write original content I will fact-check.`;

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
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
      cache: "no-store",
    });
  } catch {
    throw new AiAssistError("network", "Could not reach the AI service.");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiAssistError("auth", "The AI API key was rejected.");
    }
    if (res.status === 429) {
      throw new AiAssistError("quota", "AI rate limit or credit reached. Try again shortly.");
    }
    throw new AiAssistError("unknown", `AI service error (HTTP ${res.status}).`);
  }

  const data = (await res.json().catch(() => ({}))) as AnthropicResponse;
  const text = (data.content ?? [])
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n")
    .trim();
  if (!text) throw new AiAssistError("parse", "AI returned an empty response.");

  return parseResult(text);
}
