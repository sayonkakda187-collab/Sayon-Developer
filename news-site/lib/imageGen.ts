import "server-only";

// Server-only AI image generator with SWAPPABLE providers. The key(s) are read
// here only and are NEVER sent to the browser — the browser only ever receives
// the resulting image.
//
// PROVIDERS (pick with IMAGE_PROVIDER, else auto-detected from the keys present):
//   • "gemini"      — Google Gemini / Imagen (GEMINI_API_KEY). Note: Google's
//                     free image tier is limited in 2026 — may require billing.
//   • "cloudflare"  — Cloudflare Workers AI (CLOUDFLARE_ACCOUNT_ID + _API_TOKEN).
//                     Free daily quota, no card. Default model FLUX.1 [schnell].
//   • "huggingface" — Hugging Face Inference (HF_API_TOKEN). Free tier, no card.
//
// There is ONE chokepoint, generateImage(prompt, opts) → GeneratedImage[]. To add
// another provider, write a generate*() and branch in generateImage — the route +
// UI only depend on the GeneratedImage shape.
//
// NEWS SAFETY: AI images are illustrations/concept art. The admin UI warns they
// must NOT be presented as real photos of real events; the generator UI defaults
// the style toward clearly-illustrative output.

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-image";
const DEFAULT_CF_MODEL = "@cf/black-forest-labs/flux-1-schnell";
const DEFAULT_HF_MODEL = "black-forest-labs/FLUX.1-schnell";

/** Aspect ratios offered in the UI. Imagen takes these natively; the other
 *  providers fold the ratio into the prompt as a textual hint (their output size
 *  is fixed, so the editor cropper handles final framing). */
export const IMAGE_ASPECTS = [
  { id: "1:1", label: "Square · 1:1" },
  { id: "16:9", label: "Wide · 16:9" },
  { id: "4:3", label: "Landscape · 4:3" },
  { id: "3:4", label: "Portrait · 3:4" },
  { id: "9:16", label: "Tall · 9:16" },
] as const;
export type AspectId = (typeof IMAGE_ASPECTS)[number]["id"];
const ASPECT_IDS = new Set(IMAGE_ASPECTS.map((a) => a.id));

/** A generated image as raw base64 (no data: prefix) + its mime type. */
export type GeneratedImage = { b64: string; mimeType: string };

export type ImageGenErrorCode =
  | "config"
  | "auth"
  | "quota"
  | "safety"
  | "network"
  | "parse"
  | "unknown";

export class ImageGenError extends Error {
  code: ImageGenErrorCode;
  status?: number;
  constructor(code: ImageGenErrorCode, message: string, status?: number) {
    super(message);
    this.name = "ImageGenError";
    this.code = code;
    this.status = status;
  }
}

export type Provider = "gemini" | "cloudflare" | "huggingface";

// ── Keys (server-side only) ──────────────────────────────────────────────────
function geminiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.IMAGE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    undefined
  );
}
function hfKey(): string | undefined {
  return process.env.HF_API_TOKEN || process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || undefined;
}
function cfAccount(): string | undefined {
  return process.env.CLOUDFLARE_ACCOUNT_ID || undefined;
}
function cfToken(): string | undefined {
  return process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_AI_TOKEN || undefined;
}
function cloudflareConfigured(): boolean {
  return Boolean(cfAccount() && cfToken());
}

/** The active provider: an explicit IMAGE_PROVIDER wins; otherwise auto-detect
 *  from whichever keys are present (gemini first, for backward compatibility). */
export function activeImageProvider(): Provider {
  const explicit = (process.env.IMAGE_PROVIDER || "").trim().toLowerCase();
  if (explicit === "cloudflare" || explicit === "huggingface" || explicit === "gemini") return explicit;
  if (geminiKey()) return "gemini";
  if (cloudflareConfigured()) return "cloudflare";
  if (hfKey()) return "huggingface";
  return "gemini";
}

/** Whether the ACTIVE provider has its key(s) set. The UI uses this to show a
 *  tidy "set up" state instead of erroring. */
export function isImageGenConfigured(): boolean {
  switch (activeImageProvider()) {
    case "cloudflare":
      return cloudflareConfigured();
    case "huggingface":
      return Boolean(hfKey());
    default:
      return Boolean(geminiKey());
  }
}

export type GenerateOpts = {
  aspectRatio?: string;
  /** Number of images to produce (1–4). */
  count?: number;
  /** Optional style hint appended to the prompt (e.g. "editorial illustration"). */
  style?: string;
};

function normalizeAspect(a?: string): AspectId {
  return a && ASPECT_IDS.has(a as AspectId) ? (a as AspectId) : "1:1";
}

/** Compose the final text prompt: the admin's prompt + optional style, and (for
 *  providers with no structured aspect param) a textual aspect hint. */
function composePrompt(prompt: string, style: string | undefined, aspect: AspectId, withAspectHint: boolean): string {
  let p = prompt;
  if (style && style.trim()) p += `\n\nStyle: ${style.trim()}.`;
  if (withAspectHint) p += `\nComposition: ${aspect} aspect ratio.`;
  return p;
}

function bufToB64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

/** Map a non-OK HTTP response to a typed error, preserving the provider message. */
async function httpError(res: Response, label: string): Promise<ImageGenError> {
  let providerMsg = "";
  try {
    const data = (await res.json()) as {
      error?: { message?: string } | string;
      errors?: { message?: string }[];
    };
    if (typeof data?.error === "string") providerMsg = data.error;
    else if (data?.error?.message) providerMsg = data.error.message;
    else if (Array.isArray(data?.errors) && data.errors[0]?.message) providerMsg = data.errors[0].message as string;
  } catch {
    /* non-JSON body */
  }
  const msg = providerMsg ? ` ${providerMsg.trim()}` : "";
  if (res.status === 401 || res.status === 403) {
    return new ImageGenError("auth", `${label} rejected the key (HTTP ${res.status}).${msg}`, res.status);
  }
  if (res.status === 429) {
    return new ImageGenError("quota", `${label} rate limit / quota reached (HTTP 429).${msg}`, 429);
  }
  if (res.status === 400 || res.status === 422) {
    return new ImageGenError("parse", `${label} rejected the request (HTTP ${res.status}).${msg}`, res.status);
  }
  return new ImageGenError("unknown", `${label} error (HTTP ${res.status}).${msg}`, res.status);
}

// ── Provider: Google Gemini (:generateContent) ───────────────────────────────
type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type GeminiResp = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

async function generateGemini(
  key: string,
  model: string,
  prompt: string,
  aspect: AspectId,
  style: string | undefined,
  count: number,
): Promise<GeneratedImage[]> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`;
  const text = composePrompt(prompt, style, aspect, true);
  const out: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text }] }],
          generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
        }),
        cache: "no-store",
      });
    } catch {
      throw new ImageGenError("network", "Could not reach the image service.");
    }
    if (!res.ok) throw await httpError(res, "Google");

    const data = (await res.json().catch(() => ({}))) as GeminiResp;
    if (data.promptFeedback?.blockReason) {
      throw new ImageGenError("safety", `The prompt was blocked (${data.promptFeedback.blockReason}). Try rephrasing.`);
    }
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const img = parts.find((p) => p.inlineData?.data);
    if (!img?.inlineData?.data) {
      const reason = data.candidates?.[0]?.finishReason;
      if (reason && reason !== "STOP") {
        throw new ImageGenError("safety", `No image was produced (${reason}). Try a different prompt.`);
      }
      if (out.length === 0) throw new ImageGenError("parse", "The image service returned no image.");
      break;
    }
    out.push({ b64: img.inlineData.data, mimeType: img.inlineData.mimeType || "image/png" });
  }
  return out;
}

// ── Provider: Google Imagen (:predict) ───────────────────────────────────────
type ImagenResp = {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string }[];
};

async function generateImagen(
  key: string,
  model: string,
  prompt: string,
  aspect: AspectId,
  style: string | undefined,
  count: number,
): Promise<GeneratedImage[]> {
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(model)}:predict`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        instances: [{ prompt: composePrompt(prompt, style, aspect, false) }],
        parameters: { sampleCount: count, aspectRatio: aspect },
      }),
      cache: "no-store",
    });
  } catch {
    throw new ImageGenError("network", "Could not reach the image service.");
  }
  if (!res.ok) throw await httpError(res, "Google");

  const data = (await res.json().catch(() => ({}))) as ImagenResp;
  const preds = data.predictions ?? [];
  const images = preds
    .filter((p) => p.bytesBase64Encoded)
    .map((p) => ({ b64: p.bytesBase64Encoded as string, mimeType: p.mimeType || "image/png" }));
  if (images.length === 0) {
    const filtered = preds.find((p) => p.raiFilteredReason)?.raiFilteredReason;
    if (filtered) throw new ImageGenError("safety", `Image was filtered (${filtered}). Try a different prompt.`);
    throw new ImageGenError("parse", "The image service returned no image.");
  }
  return images;
}

// ── Provider: Cloudflare Workers AI ──────────────────────────────────────────
// FLUX returns JSON { result: { image: "<base64>" } }; SD-style models stream raw
// image bytes. We handle both by content-type. One image per call → loop.
type CfResp = { result?: { image?: string }; errors?: { message?: string }[] };

async function generateCloudflare(
  prompt: string,
  aspect: AspectId,
  style: string | undefined,
  count: number,
): Promise<GeneratedImage[]> {
  const acct = cfAccount();
  const token = cfToken();
  if (!acct || !token) throw new ImageGenError("config", "Cloudflare Workers AI isn’t configured.");
  const model = (process.env.CLOUDFLARE_IMAGE_MODEL || DEFAULT_CF_MODEL).trim();
  const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/ai/run/${model}`;
  const text = composePrompt(prompt, style, aspect, true);
  const out: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: text, steps: 4 }),
        cache: "no-store",
      });
    } catch {
      throw new ImageGenError("network", "Could not reach Cloudflare Workers AI.");
    }
    if (!res.ok) throw await httpError(res, "Cloudflare");

    const ct = res.headers.get("content-type") || "";
    if (ct.includes("application/json")) {
      const data = (await res.json().catch(() => ({}))) as CfResp;
      const b64 = data.result?.image;
      if (!b64) {
        const m = data.errors?.[0]?.message;
        if (out.length === 0) throw new ImageGenError("parse", `Cloudflare returned no image.${m ? ` ${m}` : ""}`);
        break;
      }
      out.push({ b64, mimeType: "image/jpeg" });
    } else if (ct.startsWith("image/")) {
      out.push({ b64: bufToB64(await res.arrayBuffer()), mimeType: ct });
    } else {
      if (out.length === 0) throw new ImageGenError("parse", "Cloudflare returned an unexpected response.");
      break;
    }
  }
  return out;
}

// ── Provider: Hugging Face Inference ─────────────────────────────────────────
// Returns raw image bytes on success; JSON (often a "loading" notice) otherwise.
async function generateHuggingFace(
  prompt: string,
  aspect: AspectId,
  style: string | undefined,
  count: number,
): Promise<GeneratedImage[]> {
  const key = hfKey();
  if (!key) throw new ImageGenError("config", "Hugging Face isn’t configured.");
  const model = (process.env.HF_IMAGE_MODEL || DEFAULT_HF_MODEL).trim();
  const url = `https://api-inference.huggingface.co/models/${model}`;
  const text = composePrompt(prompt, style, aspect, true);
  const out: GeneratedImage[] = [];

  for (let i = 0; i < count; i++) {
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`, accept: "image/png" },
        body: JSON.stringify({ inputs: text }),
        cache: "no-store",
      });
    } catch {
      throw new ImageGenError("network", "Could not reach Hugging Face.");
    }

    const ct = res.headers.get("content-type") || "";
    if (res.ok && ct.startsWith("image/")) {
      out.push({ b64: bufToB64(await res.arrayBuffer()), mimeType: ct });
      continue;
    }
    // Non-image: parse the JSON notice (loading / error) ONCE (don't re-read it).
    const data = (await res.json().catch(() => ({}))) as { error?: string; estimated_time?: number };
    const msg = typeof data.error === "string" ? data.error.trim() : "";
    const tail = msg ? ` ${msg}` : "";
    if (res.status === 503 || data.estimated_time != null || /loading/i.test(msg)) {
      throw new ImageGenError("quota", `The model is warming up${msg ? ` (${msg})` : ""}. Try again in ~30s.`);
    }
    if (res.status === 401 || res.status === 403) throw new ImageGenError("auth", `Hugging Face rejected the key (HTTP ${res.status}).${tail}`, res.status);
    if (res.status === 429) throw new ImageGenError("quota", `Hugging Face rate limit reached (HTTP 429).${tail}`, 429);
    if (!res.ok) throw new ImageGenError("unknown", `Hugging Face error (HTTP ${res.status}).${tail}`, res.status);
    if (out.length === 0) throw new ImageGenError("parse", `Hugging Face returned no image.${tail}`);
    break;
  }
  return out;
}

/**
 * Generate one or more images from a text prompt via the active provider.
 * Throws ImageGenError with a friendly code (the route maps it to HTTP + message).
 */
export async function generateImage(promptRaw: string, opts: GenerateOpts = {}): Promise<GeneratedImage[]> {
  const prompt = promptRaw.trim().slice(0, 1500);
  if (prompt.length < 3) throw new ImageGenError("unknown", "A longer prompt is required.");

  const aspect = normalizeAspect(opts.aspectRatio);
  const style = opts.style?.slice(0, 200);
  const count = Math.min(4, Math.max(1, Math.floor(opts.count ?? 1)));

  switch (activeImageProvider()) {
    case "cloudflare":
      return generateCloudflare(prompt, aspect, style, count);
    case "huggingface":
      return generateHuggingFace(prompt, aspect, style, count);
    default: {
      const key = geminiKey();
      if (!key) throw new ImageGenError("config", "Image generation is not configured.");
      const model = (process.env.IMAGE_GEN_MODEL || DEFAULT_GEMINI_MODEL).trim();
      return model.toLowerCase().includes("imagen")
        ? generateImagen(key, model, prompt, aspect, style, count)
        : generateGemini(key, model, prompt, aspect, style, count);
    }
  }
}
