import "server-only";

// Server-only AI image generator. Calls Google's Gemini / Imagen image API via
// raw fetch (no SDK). The key (GEMINI_API_KEY / IMAGE_API_KEY) is read here only
// and is NEVER sent to the browser.
//
// PROVIDER-SWAPPABLE: there is ONE chokepoint, generateImage(prompt, opts). To
// switch providers later, add another generate*() implementation and branch in
// generateImage — the API route + UI only depend on the GeneratedImage shape.
//
// MODEL is configurable via IMAGE_GEN_MODEL. Because Google's exact free image-
// model naming/limits shift over time, non-OK responses surface the provider's
// VERBATIM error message so the admin can adjust the model env if needed. The
// request auto-selects the right wire format from the model family:
//   • imagen-*  → POST :predict   { instances, parameters{ sampleCount, aspectRatio } }
//   • gemini-*  → POST :generateContent { contents, generationConfig{ responseModalities } }
//
// NEWS SAFETY: AI images are illustrations/concept art. The admin UI warns they
// must NOT be presented as real photos of real events; the generator UI defaults
// the style toward clearly-illustrative output. This module does not force a
// style (legitimate illustrative/photographic use is the admin's call).

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
// "Nano Banana" — Gemini's current flash image model. Override with IMAGE_GEN_MODEL
// (e.g. "imagen-3.0-generate-002") if your key/account uses a different one.
const DEFAULT_MODEL = "gemini-2.5-flash-image";

/** Aspect ratios offered in the UI. Imagen takes these natively; for Gemini we
 *  also fold the ratio into the prompt as a textual hint. */
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

/** The image-gen API key, from any of the accepted env vars (server-side only). */
function apiKey(): string | undefined {
  return (
    process.env.GEMINI_API_KEY ||
    process.env.IMAGE_API_KEY ||
    process.env.GOOGLE_AI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    undefined
  );
}

/** Whether image generation is set up (a key is present). Used by the UI to show
 *  a tidy "set up" state instead of erroring. */
export function isImageGenConfigured(): boolean {
  return Boolean(apiKey());
}

function modelName(): string {
  return (process.env.IMAGE_GEN_MODEL || DEFAULT_MODEL).trim();
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
 *  Gemini, which has no structured aspect param) a textual aspect hint. */
function composePrompt(prompt: string, style: string | undefined, aspect: AspectId, withAspectHint: boolean): string {
  let p = prompt;
  if (style && style.trim()) p += `\n\nStyle: ${style.trim()}.`;
  if (withAspectHint) p += `\nComposition: ${aspect} aspect ratio.`;
  return p;
}

/** Map a non-OK HTTP response to a typed error, preserving the provider message. */
async function httpError(res: Response): Promise<ImageGenError> {
  let providerMsg = "";
  try {
    const data = (await res.json()) as { error?: { message?: string; status?: string } };
    providerMsg = data?.error?.message?.trim() || "";
  } catch {
    /* non-JSON body */
  }
  const msg = providerMsg ? ` ${providerMsg}` : "";
  if (res.status === 401 || res.status === 403) {
    return new ImageGenError("auth", `The image API key was rejected (HTTP ${res.status}).${msg}`, res.status);
  }
  if (res.status === 429) {
    return new ImageGenError("quota", `Image generation rate limit / quota reached (HTTP 429).${msg}`, 429);
  }
  if (res.status === 400) {
    // 400 covers bad prompt, unsupported model, or a safety rejection — the
    // provider message is the useful part, so surface it verbatim.
    return new ImageGenError("parse", `The image request was rejected (HTTP 400).${msg}`, 400);
  }
  return new ImageGenError("unknown", `Image service error (HTTP ${res.status}).${msg}`, res.status);
}

type GeminiPart = { text?: string; inlineData?: { mimeType?: string; data?: string } };
type GeminiResp = {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
};

/** Gemini flash image generation (:generateContent). One image per call, so for
 *  count>1 we issue sequential calls (bounded by the route's maxDuration). */
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
    if (!res.ok) throw await httpError(res);

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
      // First call returned nothing usable → real failure; later calls → partial.
      if (out.length === 0) throw new ImageGenError("parse", "The image service returned no image.");
      break;
    }
    out.push({ b64: img.inlineData.data, mimeType: img.inlineData.mimeType || "image/png" });
  }
  return out;
}

type ImagenResp = {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string; raiFilteredReason?: string }[];
};

/** Imagen image generation (:predict) — native sampleCount + aspectRatio. */
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
  if (!res.ok) throw await httpError(res);

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

/**
 * Generate one or more images from a text prompt. The single public entry point;
 * picks the wire format from the configured model family. Throws ImageGenError
 * with a friendly code (the route maps it to an HTTP status + message).
 */
export async function generateImage(promptRaw: string, opts: GenerateOpts = {}): Promise<GeneratedImage[]> {
  const key = apiKey();
  if (!key) throw new ImageGenError("config", "Image generation is not configured.");

  const prompt = promptRaw.trim().slice(0, 1500);
  if (prompt.length < 3) throw new ImageGenError("unknown", "A longer prompt is required.");

  const aspect = normalizeAspect(opts.aspectRatio);
  const style = opts.style?.slice(0, 120);
  const count = Math.min(4, Math.max(1, Math.floor(opts.count ?? 1)));
  const model = modelName();

  return model.toLowerCase().includes("imagen")
    ? generateImagen(key, model, prompt, aspect, style, count)
    : generateGemini(key, model, prompt, aspect, style, count);
}
