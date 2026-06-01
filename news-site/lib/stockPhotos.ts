import "server-only";

// Server-only Pexels client for the cover-image "free photos" feature. The key
// (PEXELS_API_KEY) is read here only and NEVER sent to the browser.
//
// Why Pexels over Unsplash: simpler free integration (no mandatory download-
// tracking ping or UTM-hotlink rules), a higher free limit (~200 req/hour), and
// strong editorial imagery. License: free for commercial use, no permission
// needed; attribution not strictly required but appreciated — we store + show a
// photographer credit anyway. https://www.pexels.com/license/
//
// These are LICENSED/FREE stock photos only — never news-source images.

const PEXELS_ENDPOINT = "https://api.pexels.com/v1/search";
export const STOCK_PER_PAGE = 12;

export function isStockConfigured(): boolean {
  return Boolean(process.env.PEXELS_API_KEY);
}

export type StockPhoto = {
  id: number;
  /** Small thumbnail for the results grid. */
  thumb: string;
  /** Larger URL used as the cropper source / cover. */
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  /** Average color — a nice placeholder while the thumb loads. */
  avgColor: string;
};

export type StockResult = {
  photos: StockPhoto[];
  page: number;
  hasMore: boolean;
  cached: boolean;
};

export type StockErrorCode = "auth" | "quota" | "network" | "unknown";
export class StockError extends Error {
  code: StockErrorCode;
  constructor(code: StockErrorCode, message: string) {
    super(message);
    this.name = "StockError";
    this.code = code;
  }
}

// In-memory cache (per warm server instance). Stock results change slowly and
// the free tier is ~200 req/hour, so a generous TTL keeps repeat/common searches
// instant and well under the limit.
const TTL = 30 * 60 * 1000; // 30 minutes
const cache = new Map<string, { at: number; data: Omit<StockResult, "cached"> }>();
// When Pexels signals the hourly limit, back off briefly instead of hammering it.
let quotaBlockedUntil = 0;

type PexelsPhoto = {
  id: number;
  alt?: string;
  avg_color?: string;
  photographer?: string;
  photographer_url?: string;
  src?: { medium?: string; large?: string; large2x?: string; landscape?: string; original?: string };
};
type PexelsResponse = { photos?: PexelsPhoto[]; total_results?: number; per_page?: number; page?: number };

function toPhoto(p: PexelsPhoto): StockPhoto | null {
  const thumb = p.src?.medium || p.src?.landscape || p.src?.large;
  const full = p.src?.large2x || p.src?.large || p.src?.landscape || p.src?.original;
  if (!thumb || !full) return null;
  return {
    id: p.id,
    thumb,
    full,
    alt: (p.alt || "").trim(),
    photographer: (p.photographer || "Pexels photographer").trim(),
    photographerUrl: (p.photographer_url || "https://www.pexels.com").trim(),
    avgColor: p.avg_color || "#e5e7eb",
  };
}

/**
 * Search Pexels for free stock photos. Cached per query+page; serves cache during
 * a rate-limit backoff. Throws StockError with a friendly code on failure.
 */
export async function searchStockPhotos(opts: { query: string; page?: number }): Promise<StockResult> {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new StockError("auth", "PEXELS_API_KEY is not configured.");

  const query = opts.query.trim().replace(/\s+/g, " ").slice(0, 100);
  if (!query) throw new StockError("unknown", "A search term is required.");
  const page = Math.min(20, Math.max(1, Math.floor(opts.page ?? 1)));

  const ckey = `${query.toLowerCase()}::${page}`;
  const hit = cache.get(ckey);
  if (hit && Date.now() - hit.at < TTL) {
    return { ...hit.data, cached: true };
  }

  // Inside a quota backoff window: serve stale cache or signal quota.
  if (Date.now() < quotaBlockedUntil) {
    if (hit) return { ...hit.data, cached: true };
    throw new StockError("quota", "Photo search limit reached. Try again shortly.");
  }

  const url = new URL(PEXELS_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("page", String(page));
  url.searchParams.set("per_page", String(STOCK_PER_PAGE));
  url.searchParams.set("orientation", "landscape"); // best fit for 1.91:1 covers

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { Authorization: key }, cache: "no-store" });
  } catch {
    throw new StockError("network", "Could not reach the photo service.");
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new StockError("auth", "The photo API key was rejected.");
    if (res.status === 429) {
      quotaBlockedUntil = Date.now() + 5 * 60 * 1000; // back off 5 min
      if (hit) return { ...hit.data, cached: true };
      throw new StockError("quota", "Photo search limit reached. Try again shortly.");
    }
    throw new StockError("unknown", `Photo service error (HTTP ${res.status}).`);
  }

  const data = (await res.json().catch(() => ({}))) as PexelsResponse;
  const photos = (data.photos ?? []).map(toPhoto).filter((p): p is StockPhoto => p !== null);
  const hasMore = photos.length >= STOCK_PER_PAGE;
  const payload = { photos, page, hasMore };
  cache.set(ckey, { at: Date.now(), data: payload });
  return { ...payload, cached: false };
}

/** Derive a sensible auto-suggest query from an article's title (+ excerpt). */
export function suggestQueryFromArticle(title: string, excerpt?: string): string {
  const STOP = new Set([
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from",
    "as", "is", "are", "was", "were", "be", "this", "that", "these", "those", "how", "why", "what",
    "when", "who", "new", "says", "after", "over", "into", "amid", "vs", "will", "you", "your",
  ]);
  const words = `${title} ${excerpt ?? ""}`
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
  // Keep the first few significant words — good, focused image queries.
  return [...new Set(words)].slice(0, 4).join(" ") || title.trim().slice(0, 60);
}
