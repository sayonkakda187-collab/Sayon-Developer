import "server-only";

const GNEWS_ENDPOINT = "https://gnews.io/api/v4";

// GNews free tier: ~100 requests/day and a HARD cap of 10 articles per request
// (the `max` param can't exceed 10, and the `page` parameter + larger `max` are
// paid-only). We request the maximum allowed and never promise more than the
// API returns. See CLAUDE.md → "Trending News / GNews limits".
export const GNEWS_MAX_PAGE_SIZE = 10;

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

/** Languages + countries offered in the UI to widen / target coverage. */
export const TRENDING_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "es", label: "Spanish" },
  { id: "fr", label: "French" },
  { id: "de", label: "German" },
  { id: "it", label: "Italian" },
  { id: "pt", label: "Portuguese" },
  { id: "nl", label: "Dutch" },
  { id: "hi", label: "Hindi" },
  { id: "ar", label: "Arabic" },
  { id: "ru", label: "Russian" },
  { id: "zh", label: "Chinese" },
  { id: "ja", label: "Japanese" },
] as const;
export const TRENDING_COUNTRIES = [
  { id: "us", label: "United States" },
  { id: "gb", label: "United Kingdom" },
  { id: "ca", label: "Canada" },
  { id: "au", label: "Australia" },
  { id: "in", label: "India" },
  { id: "ie", label: "Ireland" },
  { id: "nz", label: "New Zealand" },
  { id: "fr", label: "France" },
  { id: "de", label: "Germany" },
  { id: "es", label: "Spain" },
  { id: "it", label: "Italy" },
  { id: "nl", label: "Netherlands" },
  { id: "br", label: "Brazil" },
  { id: "jp", label: "Japan" },
  { id: "sg", label: "Singapore" },
  { id: "za", label: "South Africa" },
] as const;

/** Clean, browser-safe item: headline + snippet + source link, NEVER the full
 *  article body (`content`) — keeps the tool inspiration-only (no copy/paste). */
export type TrendingItem = {
  title: string;
  description: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
};

/** Reduce a raw GNews article to the inspiration-only fields we expose. */
export function toTrendingItem(a: GNewsArticle): TrendingItem | null {
  const title = a.title?.trim();
  const url = a.url?.trim();
  if (!title || !url) return null;
  return {
    title,
    description: a.description?.trim() ?? "",
    source: a.source?.name?.trim() || "Unknown source",
    url,
    image: a.image?.trim() || null,
    publishedAt: a.publishedAt ?? null,
  };
}

export type GNewsArticle = {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string;
  publishedAt: string;
  source: { name: string; url: string };
};

type GNewsResponse = { totalArticles: number; articles: GNewsArticle[] };

export type TrendingResult = {
  articles: GNewsArticle[];
  totalArticles: number;
  cached: boolean; // served from cache
  stale: boolean; // served from cache because a live fetch failed
};

export type GNewsErrorCode = "quota" | "auth" | "network" | "unknown";
export class GNewsError extends Error {
  code: GNewsErrorCode;
  status?: number;
  constructor(code: GNewsErrorCode, message: string, status?: number) {
    super(message);
    this.name = "GNewsError";
    this.code = code;
    this.status = status;
  }
}

// In-memory cache (per server instance). Trending data changes slowly, so a
// generous TTL keeps repeat/common searches instant and protects the daily
// quota. On serverless, cache lives for the life of a warm instance.
const TTL = 20 * 60 * 1000; // 20 minutes
const cache = new Map<string, { at: number; data: GNewsArticle[]; total: number }>();

// When GNews signals the daily limit, back off until UTC midnight and serve
// cache instead of burning more requests.
let quotaBlockedUntil = 0;
// Discovered once: whether this key's plan supports the `page` param. Starts
// null (unknown); set false the first time a page>1 request is rejected so we
// never waste quota retrying pagination on the free tier.
let pagingSupported: boolean | null = null;

function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

const LANGS = new Set(["en", "es", "fr", "de", "it", "pt", "nl", "ru", "ar", "zh", "hi", "ja", "uk", "sv", "no", "el", "he", "ro"]);
const COUNTRIES = new Set(["us", "gb", "ca", "au", "in", "ie", "nz", "fr", "de", "it", "es", "nl", "br", "jp", "sg", "za", "ua", "ru", "cn"]);
const CATEGORIES = new Set(["general", "world", "nation", "business", "technology", "entertainment", "sports", "science", "health"]);

function pick(set: Set<string>, value: string | undefined, fallback: string): string {
  const v = (value ?? "").toLowerCase().trim();
  return set.has(v) ? v : fallback;
}

function cacheKey(path: string, params: Record<string, string>): string {
  return `${path}?${JSON.stringify(params)}`;
}

async function gnewsFetch(
  path: "search" | "top-headlines",
  params: Record<string, string>,
): Promise<{ articles: GNewsArticle[]; total: number }> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) throw new GNewsError("auth", "GNEWS_API_KEY is not configured.");

  const url = new URL(`${GNEWS_ENDPOINT}/${path}`);
  url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    throw new GNewsError("network", "Could not reach GNews.");
  }

  if (!res.ok) {
    if (res.status === 429) throw new GNewsError("quota", "GNews daily request limit reached.", 429);
    if (res.status === 401 || res.status === 403) throw new GNewsError("auth", "GNews rejected the request (plan/limit).", res.status);
    throw new GNewsError("unknown", `GNews API error: ${res.status}`, res.status);
  }

  const data = (await res.json()) as GNewsResponse;
  return { articles: data.articles ?? [], total: data.totalArticles ?? 0 };
}

/**
 * Fetch trending stories. Cleaned query, relevance-sorted searches, optional
 * language/country targeting, and defensive pagination. Returns cache-aware
 * metadata; serves stale cache when a live fetch fails so the UI never breaks.
 */
export async function getTrending(opts: {
  category?: string;
  query?: string;
  lang?: string;
  country?: string;
  page?: number;
}): Promise<TrendingResult> {
  const lang = pick(LANGS, opts.lang, "en");
  const country = pick(COUNTRIES, opts.country, "us");
  const page = Math.min(10, Math.max(1, Math.floor(opts.page ?? 1)));
  const q = (opts.query ?? "").trim().replace(/\s+/g, " ");
  const isSearch = q.length > 0;

  // Free tier can't paginate — short-circuit known-unsupported page>1 requests
  // so we don't waste quota; the caller treats an empty page as "the end".
  if (page > 1 && pagingSupported === false) {
    return { articles: [], totalArticles: 0, cached: false, stale: false };
  }

  const path: "search" | "top-headlines" = isSearch ? "search" : "top-headlines";
  const params: Record<string, string> = { lang, country, max: String(GNEWS_MAX_PAGE_SIZE) };
  if (isSearch) {
    params.q = q;
    params.sortby = "relevance"; // best matches first (vs. default publishedAt)
    params.in = "title,description"; // match where it counts → higher relevance
  } else {
    params.category = pick(CATEGORIES, opts.category, "general");
  }
  if (page > 1) params.page = String(page);

  const ckey = cacheKey(path, params);
  const cached = cache.get(ckey);
  if (cached && Date.now() - cached.at < TTL) {
    return { articles: cached.data, totalArticles: cached.total, cached: true, stale: false };
  }

  // Inside a quota backoff window: serve stale cache or signal quota.
  if (Date.now() < quotaBlockedUntil) {
    if (cached) return { articles: cached.data, totalArticles: cached.total, cached: true, stale: true };
    if (page > 1) return { articles: [], totalArticles: 0, cached: false, stale: false };
    throw new GNewsError("quota", "GNews daily request limit reached.");
  }

  try {
    const { articles, total } = await gnewsFetch(path, params);
    if (page > 1) pagingSupported = true; // a page>1 call succeeded
    cache.set(ckey, { at: Date.now(), data: articles, total });
    return { articles, totalArticles: total, cached: false, stale: false };
  } catch (e) {
    // A failed "load more" on the free tier just means "no more results".
    if (page > 1) {
      if (e instanceof GNewsError && (e.code === "auth" || e.code === "unknown")) pagingSupported = false;
      if (e instanceof GNewsError && e.code === "quota") quotaBlockedUntil = nextUtcMidnight();
      return { articles: [], totalArticles: 0, cached: false, stale: false };
    }
    if (e instanceof GNewsError && e.code === "quota") quotaBlockedUntil = nextUtcMidnight();
    // Stale-while-error: better to show slightly old results than nothing.
    if (cached) return { articles: cached.data, totalArticles: cached.total, cached: true, stale: true };
    throw e;
  }
}
