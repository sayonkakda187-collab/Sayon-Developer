// Client-safe AI metadata (model registry + editor quick-actions). Kept separate
// from lib/aiAssist.ts (which is `server-only`) so both the server route and the
// browser UI can import these lists without pulling the API key into the client.

export type AiModel = { id: string; label: string; note: string };

// The models offered in the picker. IDs must be valid Anthropic model ids.
export const AI_MODELS: AiModel[] = [
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5", note: "Fastest · ~1¢" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6", note: "Balanced · ~3–5¢" },
  { id: "claude-opus-4-8", label: "Opus 4.8", note: "Highest quality · pricier" },
];

export const DEFAULT_MODEL_ID = AI_MODELS[0].id;

const MODEL_IDS = new Set(AI_MODELS.map((m) => m.id));
export function isValidModel(id: unknown): id is string {
  return typeof id === "string" && MODEL_IDS.has(id);
}

// localStorage key for remembering the picked model across sessions.
export const AI_MODEL_STORAGE_KEY = "dl:ai-model";

// Editor quick-actions. Each maps to a fixed instruction sent to the model.
// `target` tells the UI which field the action changes (for the apply step).
export type AiEditAction = {
  id: string;
  label: string;
  instruction: string;
  target: "title" | "body";
};

export const AI_EDIT_ACTIONS: AiEditAction[] = [
  { id: "improve", label: "Improve writing", target: "body", instruction: "Improve the clarity, flow, and word choice of the article without changing its facts or meaning." },
  { id: "grammar", label: "Fix grammar & spelling", target: "body", instruction: "Correct grammar, spelling, and punctuation only. Do not change wording, facts, or meaning beyond what is needed for correctness." },
  { id: "shorten", label: "Make shorter", target: "body", instruction: "Tighten the article to be more concise while preserving all key facts and the lead. Remove redundancy." },
  { id: "lengthen", label: "Expand", target: "body", instruction: "Expand the article with relevant detail and context, keeping it factual and neutral. Use [VERIFY: ...] placeholders for any specific fact you are not certain of — do NOT fabricate." },
  { id: "tone", label: "Polish tone", target: "body", instruction: "Rewrite in a clear, engaging, neutral news tone. No opinion, marketing language, or clickbait." },
  { id: "headline", label: "Better headline", target: "title", instruction: "Write a single improved, original, non-clickbait headline for this article. Return only the new title." },
];
