// Pure, client-safe helpers for the article "Key Points" box. The points are
// stored newline-separated on Article.keyPoints; these normalize that text both
// when saving (admin) and when rendering (public). No server-only imports here so
// the editor form and the public page can both use them.

const MAX_POINTS = 6;
const MAX_LEN = 160; // generous per-bullet cap; generation aims for ~15 words

/** Clean a list of raw bullet strings: strip leading list markers, collapse
 *  whitespace, drop empties, cap count + length. */
export function normalizeKeyPoints(lines: string[]): string[] {
  return lines
    .map((l) => l.replace(/^\s*(?:[-*•·–—]|\d+[.)])\s*/, "")) // strip "- ", "1. ", "• " …
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_POINTS)
    .map((l) => (l.length > MAX_LEN ? `${l.slice(0, MAX_LEN).trimEnd()}…` : l));
}

/** Parse the stored value into an array of bullets for rendering. */
export function parseKeyPoints(stored: string | null | undefined): string[] {
  if (!stored) return [];
  return normalizeKeyPoints(stored.split("\n"));
}

/** Normalize editor textarea text into the stored form (or null when empty). */
export function keyPointsToStored(text: string | null | undefined): string | null {
  if (!text) return null;
  const points = normalizeKeyPoints(text.split("\n"));
  return points.length ? points.join("\n") : null;
}
