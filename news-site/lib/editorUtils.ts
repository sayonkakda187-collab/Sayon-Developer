// Client-safe editor helpers. Deliberately NO server imports (no prisma), so
// this can be used inside client components without bloating the bundle.

/** Browser-safe slugify, mirroring lib/slug.ts's slugify for the slug preview. */
export function slugifyClient(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Strip the most common Markdown so word/char counts reflect prose, not syntax. */
export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`[^`]*`/g, " ") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^#{1,6}\s+/gm, "") // headings
    .replace(/[*_~>#-]/g, " ") // emphasis / blockquote / list marks
    .replace(/\s+/g, " ")
    .trim();
}

export function countWords(md: string): number {
  const text = stripMarkdown(md);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

/** Reading time in minutes (min 1) at ~225 wpm. */
export function readingTime(words: number): number {
  return Math.max(1, Math.round(words / 225));
}

export type LengthStatus = "good" | "short" | "long" | "empty";

/** Classify a field length against an ideal [min, max] window. */
export function lengthStatus(len: number, min: number, max: number): LengthStatus {
  if (len === 0) return "empty";
  if (len < min) return "short";
  if (len > max) return "long";
  return "good";
}

// Ideal lengths for SEO surfaces.
export const SEO_TITLE = { min: 30, max: 60 } as const;
export const SEO_DESC = { min: 120, max: 160 } as const;
