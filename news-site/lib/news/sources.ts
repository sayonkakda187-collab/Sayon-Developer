// Client-safe news-source registry. Defines the sources the aggregator can pull
// from + their UI metadata. No server-only imports + no keys here, so both the
// route (server) and the source selector (browser) can import it.

export type NewsSourceId = "gnews" | "newsdata" | "thenewsapi" | "currents";

export type NewsSourceMeta = {
  id: NewsSourceId;
  label: string;
  /** Where to register for the free key. */
  site: string;
  /** Env var that enables this source (server-side only). */
  envVar: string;
  /** Short free-tier note for the UI tooltip. */
  freeNote: string;
};

// Order also defines dedupe priority (earlier = preferred when the same story
// appears in multiple sources).
export const NEWS_SOURCES: NewsSourceMeta[] = [
  { id: "gnews", label: "GNews", site: "gnews.io", envVar: "GNEWS_API_KEY", freeNote: "~100 req/day · 10 articles/req" },
  { id: "newsdata", label: "NewsData", site: "newsdata.io", envVar: "NEWSDATA_API_KEY", freeNote: "~200 credits/day · 10 articles/req" },
  { id: "thenewsapi", label: "TheNewsAPI", site: "thenewsapi.com", envVar: "THENEWSAPI_KEY", freeNote: "~100 req/day · 3 articles/req" },
  { id: "currents", label: "Currents", site: "currentsapi.services", envVar: "CURRENTSAPI_KEY", freeNote: "~600 req/day (dev)" },
];

export const NEWS_SOURCE_IDS = NEWS_SOURCES.map((s) => s.id);

export function isNewsSourceId(v: unknown): v is NewsSourceId {
  return typeof v === "string" && (NEWS_SOURCE_IDS as string[]).includes(v);
}

// Per-source status reported back to the UI after a fetch.
export type SourceStatus = {
  id: NewsSourceId;
  label: string;
  configured: boolean; // key present
  ok: boolean; // returned without a hard error
  count: number; // items contributed (pre-dedupe)
  note: string | null; // e.g. "limit reached", "not set up"
};
