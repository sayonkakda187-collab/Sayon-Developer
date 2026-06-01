import "server-only";

import { makeItem, type NormalizedItem } from "../normalize";
import { timedFetch, errorForStatus, ProviderError } from "../fetcher";
import type { ProviderQuery } from "./types";

// NewsData.io — https://newsdata.io/ — free tier ~200 credits/day, 10 articles
// per credit. Server-side only (NEWSDATA_API_KEY). Endpoint: /api/1/latest.

type NewsDataArticle = {
  title?: string;
  description?: string;
  link?: string;
  image_url?: string;
  pubDate?: string;
  source_id?: string;
  source_name?: string;
};
type NewsDataResponse = { status?: string; results?: NewsDataArticle[]; message?: string };

// NewsData categories (its taxonomy differs slightly from ours).
const CAT = new Set(["business", "entertainment", "environment", "food", "health", "politics", "science", "sports", "technology", "top", "world"]);
function mapCategory(c: string): string {
  if (c === "general" || c === "nation") return "top";
  return CAT.has(c) ? c : "top";
}

export async function fetchNewsData(q: ProviderQuery): Promise<NormalizedItem[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];

  const url = new URL("https://newsdata.io/api/1/latest");
  url.searchParams.set("apikey", key);
  url.searchParams.set("language", q.lang);
  if (q.query) {
    url.searchParams.set("q", q.query);
  } else {
    url.searchParams.set("category", mapCategory(q.category));
    url.searchParams.set("country", q.country);
  }

  const res = await timedFetch(url.toString());
  if (!res.ok) throw errorForStatus(res.status, "NewsData");
  const data = (await res.json().catch(() => ({}))) as NewsDataResponse;
  if (data.status && data.status !== "success") {
    throw new ProviderError("unknown", data.message || "NewsData error");
  }

  return (data.results ?? [])
    .map((a) =>
      makeItem({
        title: a.title,
        description: a.description,
        source: a.source_name || a.source_id,
        url: a.link,
        image: a.image_url,
        publishedAt: a.pubDate ? new Date(a.pubDate.replace(" ", "T") + "Z").toISOString() : null,
        via: "newsdata",
      }),
    )
    .filter((x): x is NormalizedItem => x !== null);
}
