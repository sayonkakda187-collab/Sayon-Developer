import "server-only";

import { NEWS_SOURCES, type NewsSourceId, type SourceStatus } from "./sources";
import { mergeAndDedupe, type NormalizedItem } from "./normalize";
import { runProvider } from "./fetcher";
import type { ProviderQuery } from "./providers/types";
import { fetchGNews } from "./providers/gnews";
import { fetchNewsData } from "./providers/newsdata";
import { fetchTheNewsApi } from "./providers/thenewsapi";
import { fetchCurrents } from "./providers/currents";

// Maps each source id to its fetch function.
const FETCHERS: Record<NewsSourceId, (q: ProviderQuery) => Promise<NormalizedItem[]>> = {
  gnews: fetchGNews,
  newsdata: fetchNewsData,
  thenewsapi: fetchTheNewsApi,
  currents: fetchCurrents,
};

/** Is a source's key present? (server-side check; never leaks the value). */
export function isSourceConfigured(id: NewsSourceId): boolean {
  const meta = NEWS_SOURCES.find((s) => s.id === id);
  return Boolean(meta && process.env[meta.envVar]);
}

/** The per-source configured map for the initial page render. */
export function sourceConfigMap(): Record<NewsSourceId, boolean> {
  return Object.fromEntries(NEWS_SOURCES.map((s) => [s.id, isSourceConfigured(s.id)])) as Record<NewsSourceId, boolean>;
}

export type AggregateResult = {
  items: NormalizedItem[];
  sources: SourceStatus[];
  cached: boolean; // every contributing source was served from cache
};

/**
 * Fetch the requested sources in parallel (each with its own timeout, cache, and
 * quota backoff), then merge + dedupe. One failing/missing/limited source never
 * breaks the feed — it just contributes nothing and reports its status.
 */
export async function aggregateTrending(opts: {
  enabled: NewsSourceId[];
  query: ProviderQuery;
}): Promise<AggregateResult> {
  const ckey = `${opts.query.query}|${opts.query.category}|${opts.query.lang}|${opts.query.country}|${opts.query.page}`;

  const targets = NEWS_SOURCES.filter(
    (s) => opts.enabled.includes(s.id) && isSourceConfigured(s.id),
  );

  const settled = await Promise.all(
    targets.map((s) => runProvider(s.id, ckey, () => FETCHERS[s.id](opts.query))),
  );

  const lists: NormalizedItem[][] = [];
  const statuses: SourceStatus[] = [];
  let allCached = targets.length > 0;

  // Build status for every registered source (so the UI can show inactive ones).
  for (const meta of NEWS_SOURCES) {
    const configured = isSourceConfigured(meta.id);
    const idx = targets.findIndex((t) => t.id === meta.id);
    if (idx === -1) {
      // Not fetched this round (disabled by the user or not configured).
      statuses.push({
        id: meta.id,
        label: meta.label,
        configured,
        ok: false,
        count: 0,
        note: configured ? (opts.enabled.includes(meta.id) ? null : "off") : "not set up",
      });
      continue;
    }
    const r = settled[idx];
    if (!r.cached) allCached = false;
    if (r.items.length) lists.push(r.items);
    statuses.push({
      id: meta.id,
      label: meta.label,
      configured: true,
      ok: !r.failed,
      count: r.items.length,
      note: r.note,
    });
  }

  return { items: mergeAndDedupe(lists), sources: statuses, cached: allCached };
}
