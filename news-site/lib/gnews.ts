// Server-side GNews API client for the admin "Trending News" discovery tool.
//
// The API key (GNEWS_API_KEY) is read from the server environment and is NEVER
// sent to the browser — only this module, imported by the protected API route
// (`/api/admin/trending`) and the admin server component, ever touches it.
//
// Results are cached in-memory (20 min) so browsing the page / switching tabs
// reuses a single upstream call rather than burning through the free tier's
// 100-requests/day quota. The cache is best-effort per server instance, which
// is exactly the right scope for "don't re-fetch on every click".

const GNEWS_BASE = "https://gnews.io/api/v4";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min — within the 15–30 min target
const MAX_ARTICLES = 10;
const REQUEST_TIMEOUT_MS = 10_000;

/** Category tabs surfaced in the UI, mapped to GNews top-headlines categories. */
export const TRENDING_CATEGORIES = [
  { id: "general", label: "Top" },
  { id: "world", label: "World" },
  { id: "nation", label: "Nation" },
  { id: "business", label: "Business" },
  { id: "technology", label: "Technology" },
  { id: "science", label: "Science" },
  { id: "health", label: "Health" },
  { id: "sports", label: "Sports" },
  { id: "entertainment", label: "Entertainment" },
] as const;

export type TrendingCategory = (typeof TRENDING_CATEGORIES)[number]["id"];

const VALID_CATEGORIES = new Set<string>(TRENDING_CATEGORIES.map((c) => c.id));

/** Clean, browser-safe shape returned to the client (no secrets, no raw body). */
export type TrendingItem = {
  title: string;
  description: string; // short snippet — NOT the full article body
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
};

// Raw GNews response shapes (only the fields we read).
type GNewsArticle = {
  title?: string;
  description?: string;
  url?: string;
  image?: string | null;
  publishedAt?: string;
  source?: { name?: string };
};
type GNewsResponse = { totalArticles?: number; articles?: GNewsArticle[]; errors?: string[] };

export type TrendingResult =
  | { ok: true; items: TrendingItem[]; cached: boolean }
  | { ok: false; error: string; status: number };

type CacheEntry = { at: number; items: TrendingItem[] };
const cache = new Map<string, CacheEntry>();

function cacheKey(scope: string, query: string): string {
  return `${scope}::${query.toLowerCase()}`;
}

/**
 * Reduce a raw GNews article to the inspiration-only fields we expose. We keep
 * the headline, the short `description` snippet, the source link and metadata —
 * deliberately NOT GNews's `content` field — so nothing here invites copying a
 * source's article text into a post.
 */
function clean(article: GNewsArticle): TrendingItem | null {
  const title = article.title?.trim();
  const url = article.url?.trim();
  if (!title || !url) return null;
  return {
    title,
    description: article.description?.trim() ?? "",
    source: article.source?.name?.trim() || "Unknown source",
    url,
    image: article.image?.trim() || null,
    publishedAt: article.publishedAt ?? null,
  };
}

/**
 * Fetch trending headlines from GNews. A non-empty `query` runs a keyword
 * search (`/search`); otherwise it returns top headlines for `category`
 * (`/top-headlines`). Always resolves to a typed result — callers never need a
 * try/catch and the UI can show a friendly message for every failure mode.
 */
export async function fetchTrending(opts: {
  category?: string;
  query?: string;
}): Promise<TrendingResult> {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      error:
        "Trending News isn’t configured yet. Add a free GNEWS_API_KEY (from gnews.io) to your environment to enable it.",
    };
  }

  const query = (opts.query ?? "").trim().slice(0, 120);
  const category =
    opts.category && VALID_CATEGORIES.has(opts.category) ? opts.category : "general";

  // Serve from cache when fresh (search results keyed by query, headlines by
  // category) so repeated browsing doesn't spend the daily quota.
  const key = query ? cacheKey("search", query) : cacheKey(category, "");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { ok: true, items: hit.items, cached: true };
  }

  const params = new URLSearchParams({
    lang: "en",
    max: String(MAX_ARTICLES),
    apikey: apiKey,
  });
  let endpoint: string;
  if (query) {
    endpoint = "search";
    params.set("q", query);
  } else {
    endpoint = "top-headlines";
    params.set("category", category);
  }

  // Manual timeout (AbortController) — universally typed, no reliance on a
  // specific @types/node version for AbortSignal.timeout.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${GNEWS_BASE}/${endpoint}?${params.toString()}`, {
      cache: "no-store", // we do our own in-memory caching
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
  } catch {
    return {
      ok: false,
      status: 504,
      error: "Couldn’t reach the GNews service. Check your connection and try again.",
    };
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    // GNews: 429 rate-limited, 403 over-quota / forbidden, 401 bad key.
    if (res.status === 429 || res.status === 403) {
      return {
        ok: false,
        status: 429,
        error:
          "GNews daily request limit reached (free tier: 100 requests/day). It refreshes when your quota resets — try again later.",
      };
    }
    if (res.status === 401) {
      return {
        ok: false,
        status: 502,
        error: "GNews rejected the API key. Double-check GNEWS_API_KEY.",
      };
    }
    return { ok: false, status: 502, error: `GNews request failed (HTTP ${res.status}).` };
  }

  let data: GNewsResponse;
  try {
    data = (await res.json()) as GNewsResponse;
  } catch {
    return { ok: false, status: 502, error: "GNews returned an unreadable response." };
  }

  const items = (data.articles ?? [])
    .map(clean)
    .filter((x): x is TrendingItem => x !== null);

  cache.set(key, { at: Date.now(), items });
  return { ok: true, items, cached: false };
}
