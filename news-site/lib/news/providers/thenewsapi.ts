import "server-only";

import { makeItem, type NormalizedItem } from "../normalize";
import { timedFetch, errorForStatus } from "../fetcher";
import type { ProviderQuery } from "./types";

// TheNewsAPI — https://www.thenewsapi.com/ — free tier ~100 req/day, 3 articles
// per request (low, but adds variety). Server-side only (THENEWSAPI_KEY).
// Endpoints: /v1/news/top (headlines) and /v1/news/all (search).

type TheNewsArticle = {
  title?: string;
  description?: string;
  snippet?: string;
  url?: string;
  image_url?: string;
  published_at?: string;
  source?: string;
};
type TheNewsResponse = { data?: TheNewsArticle[]; error?: string };

const CATS = new Set(["general", "science", "sports", "business", "health", "entertainment", "tech", "politics", "food", "travel"]);
function mapCategory(c: string): string {
  if (c === "technology") return "tech";
  if (c === "world" || c === "nation") return "general";
  return CATS.has(c) ? c : "general";
}

export async function fetchTheNewsApi(q: ProviderQuery): Promise<NormalizedItem[]> {
  const key = process.env.THENEWSAPI_KEY;
  if (!key) return [];

  const isSearch = q.query.length > 0;
  const url = new URL(`https://api.thenewsapi.com/v1/news/${isSearch ? "all" : "top"}`);
  url.searchParams.set("api_token", key);
  url.searchParams.set("language", q.lang);
  url.searchParams.set("limit", "3"); // free-tier hard cap
  if (isSearch) {
    url.searchParams.set("search", q.query);
  } else {
    url.searchParams.set("categories", mapCategory(q.category));
    url.searchParams.set("locale", q.country);
  }

  const res = await timedFetch(url.toString());
  if (!res.ok) throw errorForStatus(res.status, "TheNewsAPI");
  const data = (await res.json().catch(() => ({}))) as TheNewsResponse;

  return (data.data ?? [])
    .map((a) =>
      makeItem({
        title: a.title,
        description: a.description || a.snippet,
        source: a.source,
        url: a.url,
        image: a.image_url,
        publishedAt: a.published_at ? new Date(a.published_at).toISOString() : null,
        via: "thenewsapi",
      }),
    )
    .filter((x): x is NormalizedItem => x !== null);
}
