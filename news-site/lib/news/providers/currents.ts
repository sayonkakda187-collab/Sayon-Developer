import "server-only";

import { makeItem, type NormalizedItem } from "../normalize";
import { timedFetch, errorForStatus } from "../fetcher";
import type { ProviderQuery } from "./types";

// Currents API — https://currentsapi.services/ — free dev tier ~600 req/day.
// Server-side only (CURRENTSAPI_KEY). Endpoints: /v1/latest-news and /v1/search.

type CurrentsArticle = {
  title?: string;
  description?: string;
  url?: string;
  image?: string; // "None" when absent
  published?: string;
  author?: string;
};
type CurrentsResponse = { status?: string; news?: CurrentsArticle[]; message?: string };

const CATS = new Set(["business", "entertainment", "finance", "health", "politics", "science", "sports", "technology", "world", "general"]);
function mapCategory(c: string): string {
  if (c === "nation") return "general";
  return CATS.has(c) ? c : "general";
}

// Currents has no reliable per-article "source name"; derive it from the host.
function hostName(url: string | undefined): string {
  try {
    return new URL(url ?? "").host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export async function fetchCurrents(q: ProviderQuery): Promise<NormalizedItem[]> {
  const key = process.env.CURRENTSAPI_KEY;
  if (!key) return [];

  const isSearch = q.query.length > 0;
  const url = new URL(`https://api.currentsapi.services/v1/${isSearch ? "search" : "latest-news"}`);
  url.searchParams.set("apiKey", key);
  url.searchParams.set("language", q.lang);
  if (isSearch) url.searchParams.set("keywords", q.query);
  else url.searchParams.set("category", mapCategory(q.category));

  const res = await timedFetch(url.toString());
  if (!res.ok) throw errorForStatus(res.status, "Currents");
  const data = (await res.json().catch(() => ({}))) as CurrentsResponse;

  return (data.news ?? [])
    .map((a) =>
      makeItem({
        title: a.title,
        description: a.description,
        source: hostName(a.url),
        url: a.url,
        image: a.image && a.image !== "None" ? a.image : null,
        publishedAt: a.published ? new Date(a.published).toISOString() : null,
        via: "currents",
      }),
    )
    .filter((x): x is NormalizedItem => x !== null);
}
