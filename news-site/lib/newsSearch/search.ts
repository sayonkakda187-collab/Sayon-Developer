import "server-only";

import { timedFetch, ProviderError } from "@/lib/news/fetcher";
import { resolveProviderKey, type NewsSearchProviderId } from "./settings";

// Server-only News Search across a paid metasearch provider (SerpApi Google News
// or NewsAPI). Normalizes each provider's response into one shape, caches per
// (provider+query+category+region+lang+page) to protect paid quota, and maps
// rate-limit/quota errors to friendly messages with stale-cache fallback.

// One normalized search result (inspiration-only: headline, snippet, source link
// — never the source's full article body).
export type SearchItem = {
  title: string;
  description: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
};

export type SearchResult = {
  items: SearchItem[];
  page: number;
  hasMore: boolean;
  cached: boolean;
  notice: string | null;
};

export type SearchErrorCode = "auth" | "quota" | "network" | "unconfigured" | "unknown";
export class SearchError extends Error {
  code: SearchErrorCode;
  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type SearchParams = {
  query: string;
  category: string; // general/business/technology/world/sports/health/science/entertainment
  country: string; // 2-letter
  lang: string; // 2-letter
  page: number;
};

const PER_PAGE = 12;
const TTL = 20 * 60 * 1000; // 20 min — protects paid quota
const cache = new Map<string, { at: number; items: SearchItem[]; hasMore: boolean }>();
// Per-provider quota backoff (epoch ms).
const quotaBlocked = new Map<NewsSearchProviderId, number>();

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function item(input: {
  title?: string | null;
  description?: string | null;
  source?: string | null;
  url?: string | null;
  image?: string | null;
  publishedAt?: string | null;
}): SearchItem | null {
  const title = clean(input.title);
  const url = clean(input.url);
  if (!title || !/^https?:\/\//i.test(url)) return null;
  return {
    title,
    description: clean(input.description),
    source: clean(input.source) || "Unknown source",
    url,
    image: clean(input.image) || null,
    publishedAt: input.publishedAt ?? null,
  };
}

// ── SerpApi (Google News engine) ─────────────────────────────────────────────
// Topic tokens for category browsing when there's no free-text query.
const SERP_TOPICS: Record<string, string> = {
  business: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB",
  technology: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGRqTVhZU0FtVnVHZ0pWVXlnQVAB",
  entertainment: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFJ1ZEdvU0FtVnVHZ0pWVXlnQVAB",
  sports: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp1ZEdvU0FtVnVHZ0pWVXlnQVAB",
  science: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB",
  health: "CAAqIQgKIhtDQkFTRGdvSUwyMHZNR3QwTlRFU0FtVnVLQUFQAQ",
  world: "CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx1YlY4U0FtVnVHZ0pWVXlnQVAB",
};

async function searchSerpApi(key: string, p: SearchParams): Promise<{ items: SearchItem[]; hasMore: boolean }> {
  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google_news");
  url.searchParams.set("api_key", key);
  url.searchParams.set("gl", p.country);
  url.searchParams.set("hl", p.lang);
  if (p.query) {
    url.searchParams.set("q", p.query);
  } else if (p.category !== "general" && SERP_TOPICS[p.category]) {
    url.searchParams.set("topic_token", SERP_TOPICS[p.category]);
  } else {
    // No query + general → use a broad query so the engine returns headlines.
    url.searchParams.set("q", "top stories");
  }

  const res = await timedFetch(url.toString(), {}, 9000);
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new ProviderError("auth", "SerpApi rejected the key");
    if (res.status === 429) throw new ProviderError("quota", "SerpApi search limit reached");
    throw new ProviderError("unknown", `SerpApi error ${res.status}`);
  }
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    news_results?: {
      title?: string;
      link?: string;
      snippet?: string;
      thumbnail?: string;
      date?: string;
      source?: { name?: string } | string;
      stories?: unknown[];
    }[];
  };
  if (data.error) {
    if (/run out|limit|plan/i.test(data.error)) throw new ProviderError("quota", data.error);
    throw new ProviderError("unknown", data.error);
  }

  const rows = data.news_results ?? [];
  const items = rows
    .map((r) =>
      item({
        title: r.title,
        description: r.snippet,
        source: typeof r.source === "string" ? r.source : r.source?.name,
        url: r.link,
        image: r.thumbnail,
        publishedAt: r.date ? new Date(r.date).toISOString() : null,
      }),
    )
    .filter((x): x is SearchItem => x !== null);
  // SerpApi returns one big page; paginate client-side via slices.
  const start = (p.page - 1) * PER_PAGE;
  const slice = items.slice(start, start + PER_PAGE);
  return { items: slice, hasMore: items.length > start + PER_PAGE };
}

// ── NewsAPI.org ──────────────────────────────────────────────────────────────
const NEWSAPI_CATS = new Set(["business", "entertainment", "general", "health", "science", "sports", "technology"]);

async function searchNewsApi(key: string, p: SearchParams): Promise<{ items: SearchItem[]; hasMore: boolean }> {
  const isSearch = p.query.length > 0;
  const url = new URL(`https://newsapi.org/v2/${isSearch ? "everything" : "top-headlines"}`);
  url.searchParams.set("pageSize", String(PER_PAGE));
  url.searchParams.set("page", String(p.page));
  if (isSearch) {
    url.searchParams.set("q", p.query);
    url.searchParams.set("language", p.lang);
    url.searchParams.set("sortBy", "publishedAt");
  } else {
    url.searchParams.set("country", p.country);
    const cat = NEWSAPI_CATS.has(p.category) ? p.category : "general";
    if (cat !== "general") url.searchParams.set("category", cat);
  }

  // NewsAPI accepts the key via header (keeps it out of any logged URL).
  const res = await timedFetch(url.toString(), { headers: { "X-Api-Key": key } }, 9000);
  const data = (await res.json().catch(() => ({}))) as {
    status?: string;
    code?: string;
    message?: string;
    totalResults?: number;
    articles?: {
      title?: string;
      description?: string;
      url?: string;
      urlToImage?: string;
      publishedAt?: string;
      source?: { name?: string };
    }[];
  };
  if (!res.ok || data.status === "error") {
    const code = data.code ?? "";
    if (res.status === 401 || code === "apiKeyInvalid" || code === "apiKeyMissing") {
      throw new ProviderError("auth", "NewsAPI rejected the key");
    }
    if (res.status === 429 || code === "rateLimited") throw new ProviderError("quota", "NewsAPI rate limit reached");
    throw new ProviderError("unknown", data.message || `NewsAPI error ${res.status}`);
  }

  const rows = data.articles ?? [];
  const items = rows
    .map((a) =>
      item({
        title: a.title,
        description: a.description,
        source: a.source?.name,
        url: a.url,
        image: a.urlToImage,
        publishedAt: a.publishedAt ?? null,
      }),
    )
    .filter((x): x is SearchItem => x !== null);
  const total = data.totalResults ?? items.length;
  return { items, hasMore: p.page * PER_PAGE < total };
}

/**
 * Run a News Search for the active provider with caching + quota backoff +
 * graceful degradation. Throws SearchError("unconfigured") when no key is set.
 */
export async function runNewsSearch(
  provider: NewsSearchProviderId,
  key: string | null,
  p: SearchParams,
): Promise<SearchResult> {
  if (!key) throw new SearchError("unconfigured", "No API key set for this provider.");

  const ckey = `${provider}|${p.query}|${p.category}|${p.country}|${p.lang}|${p.page}`;
  const hit = cache.get(ckey);
  if (hit && Date.now() - hit.at < TTL) {
    return { items: hit.items, page: p.page, hasMore: hit.hasMore, cached: true, notice: null };
  }

  // Inside a quota backoff window → serve cache or signal the limit.
  const blockedUntil = quotaBlocked.get(provider) ?? 0;
  if (Date.now() < blockedUntil) {
    if (hit) return { items: hit.items, page: p.page, hasMore: hit.hasMore, cached: true, notice: "Search limit reached — showing recent cached results." };
    throw new SearchError("quota", "Search limit reached — try again later or check your plan.");
  }

  try {
    const { items, hasMore } = provider === "serpapi" ? await searchSerpApi(key, p) : await searchNewsApi(key, p);
    cache.set(ckey, { at: Date.now(), items, hasMore });
    return { items, page: p.page, hasMore, cached: false, notice: null };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "unknown";
    if (code === "quota") {
      quotaBlocked.set(provider, Date.now() + 10 * 60 * 1000); // 10-min backoff
      if (hit) return { items: hit.items, page: p.page, hasMore: hit.hasMore, cached: true, notice: "Search limit reached — showing recent cached results." };
      throw new SearchError("quota", "Search limit reached — try again later or check your plan.");
    }
    if (code === "auth") throw new SearchError("auth", "The API key was rejected. Check it in API Settings.");
    if (code === "network") {
      if (hit) return { items: hit.items, page: p.page, hasMore: hit.hasMore, cached: true, notice: "Showing recent cached results — the service was slow to respond." };
      throw new SearchError("network", "Couldn’t reach the search service. Please try again.");
    }
    throw new SearchError("unknown", "Couldn’t run the search. Please try again.");
  }
}

/** Convenience wrapper used by the route: resolves the active provider + key. */
export async function newsSearch(p: SearchParams, provider: NewsSearchProviderId): Promise<SearchResult> {
  const key = await resolveProviderKey(provider);
  return runNewsSearch(provider, key, p);
}
