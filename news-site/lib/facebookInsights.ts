import "server-only";

import {
  FacebookApiError,
  fetchPageFields,
  fetchPageInsights,
  type InsightValue,
} from "@/lib/facebook";
import { ppDayOfEndTime } from "@/lib/fbInsightsRange";

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
// Paid reach: prefer the UNIQUE paid-reach metric (apples-to-apples with
// page_impressions_unique above), falling back to total paid impressions. Both
// belong to the page_impressions_* family Meta is retiring through mid-2026, so
// if neither resolves the caller just gets null paidReach (shown as "not
// available") — total reach / engagement / follows are unaffected.
const PAID_REACH_METRICS = ["page_impressions_paid_unique", "page_impressions_paid"];

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

/** One calendar day's metrics (null = no data for that day → shown as "—").
 *  `paidReach` is the paid slice of reach; null when Meta no longer returns a
 *  paid-reach metric for the Page, so the UI can show "not available" gracefully.
 *  Optional/additive: only the Page Control path populates it, so the farm's own
 *  insights aggregation (which omits it) stays valid without changes. */
export type DayPoint = { date: string; reach: number | null; engagement: number | null; follows: number | null; paidReach?: number | null };
export type PageDaily = {
  days: DayPoint[];
  /** Which metric name actually backed each series (null = none available). */
  reachMetric: string | null;
  engagementMetric: string | null;
  followsMetric: string | null;
  paidReachMetric: string | null;
};

/** First candidate metric that returned a non-empty day series. */
function firstPresent(series: Record<string, InsightValue[]>, candidates: string[]): string | null {
  for (const m of candidates) {
    if (series[m] && series[m].length > 0) return m;
  }
  return null;
}

/** Sum a metric's values into a Phnom-Penh day → total map. */
function bucketByDay(values: InsightValue[] | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values ?? []) {
    if (!v.endTime) continue;
    const day = ppDayOfEndTime(v.endTime);
    m.set(day, (m.get(day) ?? 0) + (typeof v.value === "number" ? v.value : 0));
  }
  return m;
}

/**
 * Daily reach / engagement / follows for an arbitrary range (`since`..`until`
 * unix seconds), bucketed by Phnom-Penh day, for the day-by-day chart + table.
 * Self-healing: a retired/limited metric is skipped and its days come back
 * absent (the caller fills "—" for missing days, so history gaps degrade
 * gracefully). Token/permission errors propagate so the caller can show the
 * "needs reconnect" state. Only the days Facebook returned are included.
 */
export async function getPageDaily(
  pageId: string,
  accessToken: string,
  since: number,
  until: number,
): Promise<PageDaily> {
  const series = await fetchPageInsights({
    pageId,
    accessToken,
    metrics: [...REACH_METRICS, ...ENGAGEMENT_METRICS, ...FOLLOW_METRICS, ...PAID_REACH_METRICS],
    period: "day",
    since,
    until,
  });
  const reachMetric = firstPresent(series, REACH_METRICS);
  const engagementMetric = firstPresent(series, ENGAGEMENT_METRICS);
  const followsMetric = firstPresent(series, FOLLOW_METRICS);
  const paidReachMetric = firstPresent(series, PAID_REACH_METRICS);
  const reach = bucketByDay(reachMetric ? series[reachMetric] : undefined);
  const eng = bucketByDay(engagementMetric ? series[engagementMetric] : undefined);
  const fol = bucketByDay(followsMetric ? series[followsMetric] : undefined);
  const paid = bucketByDay(paidReachMetric ? series[paidReachMetric] : undefined);
  const dates = new Set<string>([...reach.keys(), ...eng.keys(), ...fol.keys(), ...paid.keys()]);
  const days: DayPoint[] = [...dates].sort().map((date) => ({
    date,
    reach: reach.has(date) ? (reach.get(date) as number) : null,
    engagement: eng.has(date) ? (eng.get(date) as number) : null,
    follows: fol.has(date) ? (fol.get(date) as number) : null,
    paidReach: paid.has(date) ? (paid.get(date) as number) : null,
  }));
  return { days, reachMetric, engagementMetric, followsMetric, paidReachMetric };
}
