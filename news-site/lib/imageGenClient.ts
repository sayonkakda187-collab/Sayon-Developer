// Client-safe constants + helpers shared by the AI Images tab and the editor's
// "Generate with AI" modal. (lib/imageGen.ts is server-only — it can't be
// imported into client components — so the UI-facing bits live here.)

export type GenAspect = { id: string; label: string };

/** Aspect ratios offered in the generator UI. Mirrors lib/imageGen IMAGE_ASPECTS. */
export const GEN_ASPECTS: GenAspect[] = [
  { id: "16:9", label: "Wide · 16:9" },
  { id: "1:1", label: "Square · 1:1" },
  { id: "4:3", label: "Landscape · 4:3" },
  { id: "3:4", label: "Portrait · 3:4" },
  { id: "9:16", label: "Tall · 9:16" },
];

/** Cover crops are ~1.91:1 — 16:9 is the closest offered ratio, so default to it. */
export const DEFAULT_ASPECT = "16:9";

/** Style hints. Defaults nudge toward clearly-ILLUSTRATIVE output (news safety);
 *  "Photographic" stays available for legitimate non-event illustrative use. */
export const GEN_STYLES: { id: string; label: string }[] = [
  { id: "editorial illustration, clean vector-style, conceptual", label: "Editorial illustration" },
  { id: "digital art, painterly, concept art", label: "Digital art" },
  { id: "isometric 3D render, soft studio lighting", label: "3D render" },
  { id: "flat minimal vector graphic, bold shapes", label: "Flat vector" },
  { id: "watercolor illustration, soft washes", label: "Watercolor" },
  { id: "infographic / diagram style, labeled, schematic", label: "Diagram / infographic" },
  { id: "photographic, realistic lighting", label: "Photographic" },
  { id: "", label: "No style hint" },
];

/** Shown in BOTH the tab and the editor modal — keep the wording aligned with CLAUDE.md. */
export const NEWS_IMAGE_CAUTION =
  "AI-generated images are for illustrations, concept art, or stylized graphics — don’t present them as real photographs of real news events. For real events, use the free stock-photo search instead.";

export type GenImage = { url: string; mimeType: string };
export type GenResponse =
  | { ok: true; images: GenImage[] }
  | { ok: false; error: string; configured?: boolean };

/** POST a generation request. Never throws — returns a typed result the UI renders. */
export async function requestImages(input: {
  prompt: string;
  aspectRatio: string;
  style?: string;
  count?: number;
}): Promise<GenResponse> {
  try {
    const res = await fetch("/api/admin/generate-image", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 503 && data?.configured === false) {
      return { ok: false, error: data.error ?? "Image generation isn’t set up.", configured: false };
    }
    if (!res.ok || !data?.ok) {
      return { ok: false, error: data?.error ?? "Couldn’t generate the image." };
    }
    return { ok: true, images: (data.images ?? []) as GenImage[] };
  } catch {
    return { ok: false, error: "Couldn’t reach the image service. Please try again." };
  }
}

/** Convert a data: URL (or any image URL) to a File for the existing Blob upload. */
export async function imageUrlToFile(url: string, name: string): Promise<File> {
  const res = await fetch(url);
  const blob = await res.blob();
  const ext = (blob.type.split("/")[1] || "png").replace("jpeg", "jpg");
  return new File([blob], `${name}.${ext}`, { type: blob.type || "image/png" });
}

/** Upload an image (data URL or remote) to Vercel Blob via the existing endpoint. */
export async function saveImageToBlob(url: string, name: string): Promise<string> {
  const file = await imageUrlToFile(url, name);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error ?? "Upload failed.");
  return data.url;
}

/** One-shot sessionStorage handoff: AI Images tab → new-article editor cover. */
export const COVER_HANDOFF_KEY = "dl:cover-handoff";
