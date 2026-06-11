import type { NewsSourceId } from "./sources";

// One normalized, inspiration-only item — the shape every provider maps into and
// the shape the client renders. NEVER carries a source's full article body.
export type NormalizedItem = {
  title: string;
  description: string;
  source: string; // the outlet name (e.g. "Reuters")
  url: string;
  image: string | null;
  publishedAt: string | null; // ISO string
  via: NewsSourceId; // which API surfaced it (provenance tag)
};

/** Build a normalized item, dropping anything without a title + url. */
export function makeItem(input: {
  title?: string | null;
  description?: string | null;
  source?: string | null;
  url?: string | null;
  image?: string | null;
  publishedAt?: string | null;
  via: NewsSourceId;
}): NormalizedItem | null {
  const title = (input.title ?? "").trim();
  const url = (input.url ?? "").trim();
  if (!title || !/^https?:\/\//i.test(url)) return null;
  return {
    title,
    description: (input.description ?? "").trim(),
    source: (input.source ?? "").trim() || "Unknown source",
    url,
    image: (input.image ?? "")?.trim() || null,
    publishedAt: input.publishedAt ?? null,
    via: input.via,
  };
}

/** Canonical URL key for exact-duplicate detection (host + path, no query/hash,
 *  no trailing slash, no www). */
export function urlKey(url: string): string {
  try {
    const u = new URL(url);
    const host = u.host.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/+$/, "").toLowerCase();
    return `${host}${path}`;
  } catch {
    return url.toLowerCase();
  }
}

const TITLE_STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from",
  "as", "is", "are", "was", "were", "be", "it", "its", "this", "that", "new", "says", "after",
]);

/** Significant title tokens for fuzzy comparison. */
export function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !TITLE_STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Source preference for tie-breaking duplicates (lower index = preferred). */
const SOURCE_RANK: Record<NewsSourceId, number> = { gnews: 0, newsdata: 1, thenewsapi: 2, currents: 3 };

/**
 * Merge items from multiple providers and remove duplicates — the same story
 * often appears across sources. Dedupes by canonical URL AND by near-identical
 * title (Jaccard ≥ threshold). Keeps the "richest" copy: prefers one with an
 * image, then the preferred source. Returns sorted by most-recent.
 */
export function mergeAndDedupe(lists: NormalizedItem[][], titleThreshold = 0.82): NormalizedItem[] {
  const all = lists.flat();

  // Pass 1: exact URL dedupe.
  const byUrl = new Map<string, NormalizedItem>();
  for (const item of all) {
    const key = urlKey(item.url);
    const existing = byUrl.get(key);
    if (!existing || better(item, existing)) byUrl.set(key, item);
  }
  const urlUnique = [...byUrl.values()];

  // Pass 2: fuzzy title dedupe across what remains.
  const kept: { item: NormalizedItem; tokens: Set<string> }[] = [];
  for (const item of urlUnique) {
    const tokens = titleTokens(item.title);
    const dupIdx = kept.findIndex((k) => jaccard(k.tokens, tokens) >= titleThreshold);
    if (dupIdx === -1) {
      kept.push({ item, tokens });
    } else if (better(item, kept[dupIdx].item)) {
      kept[dupIdx] = { item, tokens };
    }
  }

  // Sort by most recent (null dates sink to the bottom).
  return kept
    .map((k) => k.item)
    .sort((a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0));
}

/** Is `a` a "better" representative of a duplicate than `b`? */
function better(a: NormalizedItem, b: NormalizedItem): boolean {
  if (Boolean(a.image) !== Boolean(b.image)) return Boolean(a.image); // prefer with image
  if (a.via !== b.via) return SOURCE_RANK[a.via] < SOURCE_RANK[b.via]; // prefer preferred source
  return (a.description?.length ?? 0) > (b.description?.length ?? 0); // prefer richer snippet
}
