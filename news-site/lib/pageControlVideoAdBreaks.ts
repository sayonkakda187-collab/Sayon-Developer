import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPageVideoAdBreakSeries } from "@/lib/facebook";
import { rangeToUnix, rangeKey, ppToday, ppDayOfEndTime } from "@/lib/fbInsightsRange";

/**
 * Page Control · Phase 3 — one MONITORED page's DAILY video ad-break ad IMPRESSIONS
 * (in-stream ad views; NOT $ earnings) for a range. Built on the low-level
 * `getPageVideoAdBreakSeries` and cached in the EXISTING `MonitoredPageDailyCache`
 * under a namespaced rangeKey (`adbreak:<from>_<to>`) so it needs no migration and
 * never collides with the reach/engagement series. Defensive by construction: a
 * permission/empty response → `needs_monetization`, a retired metric (#100) →
 * `unavailable`, an invalid token → `reconnect`. Never throws.
 */

const TTL_TODAY_MS = 6 * 60 * 60 * 1000; // ranges including today still change → ~6h
const TTL_PAST_MS = 24 * 60 * 60 * 1000; // fully historical → stable, longer

export type AdBreakDay = { date: string; impressions: number };
/** ok = real data · needs_monetization = no access/empty · unavailable = retired metric · reconnect = bad token. */
export type VideoAdBreakStatus = "ok" | "needs_monetization" | "unavailable" | "reconnect";
export type MonitoredVideoAdBreaks = { status: VideoAdBreakStatus; days: AdBreakDay[] };

function cacheKey(from: string, to: string): string {
  return `adbreak:${rangeKey(from, to)}`;
}

function parse(data: string): MonitoredVideoAdBreaks | null {
  try {
    const o = JSON.parse(data) as { status?: unknown; days?: unknown };
    if (typeof o.status === "string" && Array.isArray(o.days)) {
      const days = o.days
        .filter((x): x is { date: string; impressions?: unknown } => Boolean(x) && typeof x.date === "string")
        .map((x) => ({ date: x.date, impressions: typeof x.impressions === "number" ? x.impressions : 0 }));
      return { status: o.status as VideoAdBreakStatus, days };
    }
  } catch {
    // fall through
  }
  return null;
}

export async function getMonitoredVideoAdBreaks(
  page: { id: string; pageId: string; accessToken: string },
  from: string,
  to: string,
  wantFresh = false,
): Promise<MonitoredVideoAdBreaks> {
  const key = cacheKey(from, to);
  const ttl = to >= ppToday() ? TTL_TODAY_MS : TTL_PAST_MS;

  if (!wantFresh) {
    const cached = await prisma.monitoredPageDailyCache
      .findUnique({ where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } } })
      .catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
      const parsed = parse(cached.data);
      if (parsed) return parsed;
    }
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { status: "reconnect", days: [] }; // bad token — not cached (transient)
  }

  const { since, until } = rangeToUnix(from, to);
  let result: MonitoredVideoAdBreaks;
  try {
    const series = await getPageVideoAdBreakSeries(page.pageId, token, since, until);
    const byDay = new Map<string, number>();
    for (const s of series) {
      const day = ppDayOfEndTime(s.endTime);
      byDay.set(day, (byDay.get(day) ?? 0) + s.impressions);
    }
    const days: AdBreakDay[] = [...byDay.entries()]
      .map(([date, impressions]) => ({ date, impressions }))
      .sort((a, b) => a.date.localeCompare(b.date));
    const total = days.reduce((s, d) => s + d.impressions, 0);
    // Call succeeded but nothing recorded → the Page almost certainly isn't enrolled
    // in in-stream-ad monetization (or had no ad views) — surface the monetization hint.
    result = total > 0 ? { status: "ok", days } : { status: "needs_monetization", days };
  } catch (e) {
    if (e instanceof FacebookApiError && e.expired) return { status: "reconnect", days: [] }; // transient → not cached
    if (e instanceof FacebookApiError && e.code === 100) result = { status: "unavailable", days: [] };
    else result = { status: "needs_monetization", days: [] };
  }

  await prisma.monitoredPageDailyCache
    .upsert({
      where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } },
      create: { monitoredPageId: page.id, rangeKey: key, data: JSON.stringify(result), fetchedAt: new Date() },
      update: { data: JSON.stringify(result), fetchedAt: new Date() },
    })
    .catch(() => {});

  return result;
}
