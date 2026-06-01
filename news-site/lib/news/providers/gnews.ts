import "server-only";

import { getTrending, toTrendingItem } from "@/lib/gnews";
import { makeItem, type NormalizedItem } from "../normalize";
import type { ProviderQuery } from "./types";

// GNews provider: wraps the EXISTING lib/gnews.ts getTrending() (its own cache,
// quota backoff, and pagination logic are unchanged) and normalizes the output.
export async function fetchGNews(q: ProviderQuery): Promise<NormalizedItem[]> {
  const result = await getTrending({
    category: q.category,
    query: q.query,
    lang: q.lang,
    country: q.country,
    page: q.page,
  });
  return result.articles
    .map(toTrendingItem)
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .map((it) =>
      makeItem({
        title: it.title,
        description: it.description,
        source: it.source,
        url: it.url,
        image: it.image,
        publishedAt: it.publishedAt,
        via: "gnews",
      }),
    )
    .filter((x): x is NormalizedItem => x !== null);
}
