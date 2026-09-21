import type { AiAssistResult } from "@/lib/aiAssist";
import type { NormalizedItem } from "@/lib/news/normalize";
import type { WpAiDraft, WpTrendingItem } from "./types";

/**
 * Mapping between the trending/AI pipelines and the WordPress editor's fields.
 *
 * Kept pure and separate from the server actions so it can be tested directly:
 * the calls it sits between reach api.anthropic.com and the news APIs, which no
 * test in this repo can exercise. The shape of what lands in the editor is the
 * part that can actually go wrong, so that is the part that is covered.
 */

/** Text the model sometimes prefixes a headline with, despite being told not to. */
const HEADLINE_NOISE = /^(headline|title|suggested(\s+headline)?)\s*[:\-–—]\s*/i;

function cleanHeadline(raw: string): string {
  return (raw ?? "")
    .replace(HEADLINE_NOISE, "")
    // Models like to wrap a headline in quotes; WordPress would publish them.
    .replace(/^["“”'']+|["“”'']+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Turns an AI result into the three editor fields.
 *
 * `fallbackHeadline` is the story the draft was written about. It is used when
 * the model returns no usable headline, so the title box is never left empty
 * after a generation that otherwise succeeded.
 */
export function draftToEditorFields(
  result: Partial<AiAssistResult> | null | undefined,
  fallbackHeadline = "",
): WpAiDraft {
  const headlines = (result?.headlines ?? [])
    .map(cleanHeadline)
    .filter((h) => h.length > 0);

  // De-duplicate case-insensitively, keeping the first spelling offered.
  const seen = new Set<string>();
  const unique = headlines.filter((h) => {
    const k = h.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const fallback = cleanHeadline(fallbackHeadline);
  return {
    title: unique[0] ?? fallback,
    headlines: unique,
    content: (result?.draft ?? "").trim(),
    excerpt: (result?.excerpt ?? "").trim(),
    brief: (result?.brief ?? "").trim(),
  };
}

/** Trims a trending feed down to what the picker shows, dropping unusable rows. */
export function trendingToItems(items: NormalizedItem[] | null | undefined): WpTrendingItem[] {
  return (items ?? [])
    .filter((i) => i && typeof i.title === "string" && i.title.trim() && i.url)
    .map((i) => ({
      title: i.title.trim(),
      description: (i.description ?? "").trim(),
      source: (i.source ?? "").trim(),
      url: i.url,
      publishedAt: i.publishedAt ?? null,
    }));
}
