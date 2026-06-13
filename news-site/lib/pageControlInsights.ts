import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError } from "@/lib/facebook";
import { getPageDaily, type DayPoint } from "@/lib/facebookInsights";
import { rangeToUnix, rangeKey, ppToday, addDays } from "@/lib/fbInsightsRange";

/**
 * Page Control insights data layer for MONITORED pages. Reuses the shared,
 * self-healing `getPageDaily` (which already requests CANDIDATE metrics and drops
 * any the v25.0 API rejects, so retired metrics degrade to null and are never
 * shown). Adds a per-(page, range) cache (`MonitoredPageDailyCache`) — its own,
 * independent from the farm — that powers BOTH the dashboard trends and the
 * landing-list quick stats. Watch-only; never posts.
 */

const TTL_TODAY_MS = 6 * 60 * 60 * 1000; // ranges including today change → ~6h
const TTL_PAST_MS = 24 * 60 * 60 * 1000; // fully historical → stable, longer

function numOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function parseDays(data: string): DayPoint[] | null {
  try {
    const a = JSON.parse(data);
    if (Array.isArray(a)) {
      return a
        .filter((x) => x && typeof x.date === "string")
        .map((x) => ({ date: x.date as string, reach: numOrNull(x.reach), engagement: numOrNull(x.engagement), follows: numOrNull(x.follows) }));
    }
  } catch {
    // fall through
  }
  return null;
}

export type MonitoredDaily = { days: DayPoint[]; status: "ok" | "reconnect" };

/**
 * One monitored page's day-by-day reach/engagement/follows for [from, to], served
 * from cache when fresh, else computed via the self-healing Graph call + cached.
 * Token/permission failures come back as `status: "reconnect"` (never throws).
 */
export async function getMonitoredDaily(
  page: { id: string; pageId: string; accessToken: string },
  from: string,
  to: string,
  wantFresh = false,
): Promise<MonitoredDaily> {
  const key = rangeKey(from, to);
  const ttl = to >= ppToday() ? TTL_TODAY_MS : TTL_PAST_MS;

  if (!wantFresh) {
    const cached = await prisma.monitoredPageDailyCache
      .findUnique({ where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } } })
      .catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
      const days = parseDays(cached.data);
      if (days) return { days, status: "ok" };
    }
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { days: [], status: "reconnect" };
  }

  const { since, until } = rangeToUnix(from, to);
  try {
    const res = await getPageDaily(page.pageId, token, since, until);
    await prisma.monitoredPageDailyCache
      .upsert({
        where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } },
        create: { monitoredPageId: page.id, rangeKey: key, data: JSON.stringify(res.days), fetchedAt: new Date() },
        update: { data: JSON.stringify(res.days), fetchedAt: new Date() },
      })
      .catch(() => {});
    return { days: res.days, status: "ok" };
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) return { days: [], status: "reconnect" };
    return { days: [], status: "ok" }; // other errors → empty (graceful)
  }
}

/** Sum a metric over [from, to]; null when the metric had NO data (so the UI shows
 *  "—" for a retired/unavailable metric instead of a misleading 0). */
function sumWindow(days: DayPoint[], from: string, to: string, key: "reach" | "engagement" | "follows"): number | null {
  let sum = 0;
  let any = false;
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    const v = d[key];
    if (v != null) {
      sum += v;
      any = true;
    }
  }
  return any ? sum : null;
}

/** Chronological daily values for [from, to] (null → 0) — the row sparkline series.
 *  Returns [] when the metric is entirely absent (so the UI shows a flat placeholder). */
function windowSeries(days: DayPoint[], from: string, to: string, key: "reach" | "engagement"): number[] {
  const out: number[] = [];
  let any = false;
  for (const d of days) {
    if (d.date < from || d.date > to) continue;
    if (d[key] != null) any = true;
    out.push(d[key] ?? 0);
  }
  return any ? out : [];
}

export type MonitoredRowStats = {
  reach: number | null;
  engagement: number | null;
  follows: number | null;
  reachPrev: number | null;
  engagementPrev: number | null;
  followsPrev: number | null;
  /** Last-28-day daily series (chronological) for the row sparkline. */
  sparkReach: number[];
  sparkEngagement: number[];
  status: "ok" | "reconnect";
};

/**
 * Landing-list quick stats for one monitored page: last-28-day reach / engagement /
 * net new follows, plus the previous 28 days (for a % change) and a 28-day daily
 * series for the row sparkline. Computed from ONE cached 56-day daily series — so a
 * page's row costs at most one Graph call per ~6h, never a bulk hammer.
 */
export async function getMonitoredRowStats(
  page: { id: string; pageId: string; accessToken: string },
  wantFresh = false,
): Promise<MonitoredRowStats> {
  const today = ppToday();
  const winFrom = addDays(today, -55);
  const { days, status } = await getMonitoredDaily(page, winFrom, today, wantFresh);
  if (status === "reconnect") {
    return { reach: null, engagement: null, follows: null, reachPrev: null, engagementPrev: null, followsPrev: null, sparkReach: [], sparkEngagement: [], status };
  }
  const curFrom = addDays(today, -27);
  const prevFrom = winFrom;
  const prevTo = addDays(today, -28);
  return {
    reach: sumWindow(days, curFrom, today, "reach"),
    engagement: sumWindow(days, curFrom, today, "engagement"),
    follows: sumWindow(days, curFrom, today, "follows"),
    reachPrev: sumWindow(days, prevFrom, prevTo, "reach"),
    engagementPrev: sumWindow(days, prevFrom, prevTo, "engagement"),
    followsPrev: sumWindow(days, prevFrom, prevTo, "follows"),
    sparkReach: windowSeries(days, curFrom, today, "reach"),
    sparkEngagement: windowSeries(days, curFrom, today, "engagement"),
    status: "ok",
  };
}
