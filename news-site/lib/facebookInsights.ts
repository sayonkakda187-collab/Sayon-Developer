import "server-only";

import {
  FacebookApiError,
  fetchPageFields,
  fetchPageInsights,
  type InsightValue,
} from "@/lib/facebook";

/**
 * Page-level performance for the admin Insights tab — computed from the OFFICIAL
 * Graph API (no scraping). Built on the self-healing `fetchPageInsights` so a
 * deprecated/unsupported metric degrades to `null` (shown as "—") instead of
 * failing the whole Page. One Page erroring never blocks the others.
 *
 * Metric note: Meta keeps retiring Page metrics (page_impressions* / page_fans
 * removed Nov 2025; more reach/viewer metrics retire mid-2026, replaced by
 * "Views"). So we request a list of CANDIDATES per stat and take the first one
 * that the API still answers — new pages / new metric names keep working without
 * code changes.
 */

// Reach: classic 28-day unique reach first, then the newer "views" fallbacks.
const REACH_METRICS = ["page_impressions_unique", "page_views_total", "page_views_unique"];
// Engagement: post engagements first, then the (older) engaged-users metric.
const ENGAGEMENT_METRICS = ["page_post_engagements", "page_engaged_users"];
// Daily follower growth, for the detail trend (several names across versions).
const FOLLOW_METRICS = ["page_daily_follows_unique", "page_daily_follows", "page_fan_adds_unique", "page_fan_adds"];

/** The newest value in a series (day series end on the most recent day). */
function latestValue(values: InsightValue[] | undefined): number | null {
  if (!values || values.length === 0) return null;
  const v = values[values.length - 1]?.value;
  return typeof v === "number" ? v : null;
}

/** First candidate metric that actually returned a value (deprecations skipped). */
function firstAvailable(series: Record<string, InsightValue[]>, candidates: string[]): number | null {
  for (const m of candidates) {
    const v = latestValue(series[m]);
    if (v != null) return v;
  }
  return null;
}

export type PageOverview = {
  followers: number | null;
  reach28: number | null;
  engagement28: number | null;
  /** "ok" = at least one metric resolved; "partial" = token works but nothing
   *  available yet (new/empty Page); "reconnect" = token invalid or missing scope. */
  status: "ok" | "partial" | "reconnect";
};

/**
 * One Page's overview row: followers (from page fields), plus 28-day reach and
 * engagement (from insights). A token/permission failure flips `status` to
 * "reconnect" (the table shows a badge); an empty new Page degrades to "partial".
 */
export async function getPageOverview(pageId: string, accessToken: string): Promise<PageOverview> {
  let followers: number | null = null;
  let reach28: number | null = null;
  let engagement28: number | null = null;
  let reconnect = false;

  // Followers / likes come from scalar Page fields (not the insights edge).
  try {
    const fields = await fetchPageFields(pageId, accessToken, ["followers_count", "fan_count"]);
    followers = fields.followers_count ?? fields.fan_count ?? null;
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) reconnect = true;
    // Any other error: leave followers null (non-fatal).
  }

  // 28-day reach + engagement in one self-healing insights call.
  try {
    const series = await fetchPageInsights({
      pageId,
      accessToken,
      metrics: [...REACH_METRICS, ...ENGAGEMENT_METRICS],
      period: "days_28",
    });
    reach28 = firstAvailable(series, REACH_METRICS);
    engagement28 = firstAvailable(series, ENGAGEMENT_METRICS);
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) reconnect = true;
  }

  const status: PageOverview["status"] = reconnect
    ? "reconnect"
    : followers == null && reach28 == null && engagement28 == null
      ? "partial"
      : "ok";

  return { followers, reach28, engagement28, status };
}

export type SeriesPoint = { date: string; value: number };
export type PageTimeseries = {
  reach: SeriesPoint[];
  engagement: SeriesPoint[];
  follows: SeriesPoint[];
  /** Which metric name actually backed each series (null = none available). */
  reachMetric: string | null;
  engagementMetric: string | null;
  followsMetric: string | null;
};

/** First candidate metric that returned a non-empty day series. */
function firstPresent(series: Record<string, InsightValue[]>, candidates: string[]): string | null {
  for (const m of candidates) {
    if (series[m] && series[m].length > 0) return m;
  }
  return null;
}

/** Map a value series → chart points keyed by YYYY-MM-DD (drops undated points). */
function toPoints(values: InsightValue[] | undefined): SeriesPoint[] {
  if (!values) return [];
  return values
    .filter((v) => v.endTime)
    .map((v) => ({ date: (v.endTime as string).slice(0, 10), value: typeof v.value === "number" ? v.value : 0 }));
}

/**
 * Daily reach / engagement / follows series over the last `days` (7 / 28 / 90),
 * for the Page detail charts. Self-healing: a retired metric is skipped and its
 * series comes back empty (the chart shows an empty state). Token/permission
 * errors propagate so the caller can render the "needs reconnect" state.
 */
export async function getPageTimeseries(
  pageId: string,
  accessToken: string,
  days: number,
): Promise<PageTimeseries> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  const series = await fetchPageInsights({
    pageId,
    accessToken,
    metrics: [...REACH_METRICS, ...ENGAGEMENT_METRICS, ...FOLLOW_METRICS],
    period: "day",
    since,
    until,
  });
  const reachMetric = firstPresent(series, REACH_METRICS);
  const engagementMetric = firstPresent(series, ENGAGEMENT_METRICS);
  const followsMetric = firstPresent(series, FOLLOW_METRICS);
  return {
    reach: toPoints(reachMetric ? series[reachMetric] : undefined),
    engagement: toPoints(engagementMetric ? series[engagementMetric] : undefined),
    follows: toPoints(followsMetric ? series[followsMetric] : undefined),
    reachMetric,
    engagementMetric,
    followsMetric,
  };
}
