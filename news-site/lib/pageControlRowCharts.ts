import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPagePostsDailyInRange } from "@/lib/facebook";
import { getMonitoredDaily } from "@/lib/pageControlInsights";
import { rangeToUnix, rangeKey, ppToday, ppDate, eachDate, previousPeriod } from "@/lib/fbInsightsRange";

/**
 * Lazy per-row chart data for an EXPANDED monitored-page row, over the selected
 * range — all from EXISTING per-page caches (no new bulk Graph hammer):
 *  • reach: the daily reach series — reuses the SAME `MonitoredPageDailyCache` entry
 *    the landing-row stats already populate (prev-start..to), sliced to the range, and
 *  • posts: per-day published-post counts split video vs image, from ONE capped,
 *    range-bounded /published_posts call, cached per (page, range) in
 *    `MonitoredPageRangePostsCache` under a namespaced "#daily" rangeKey (no new table,
 *    separate from the pill's totals entry).
 * Token/permission failure → status "reconnect"; transient errors → empty, gracefully.
 */

const TTL_TODAY_MS = 3 * 60 * 60 * 1000; // range includes today → grows through the day
const TTL_PAST_MS = 24 * 60 * 60 * 1000; // fully historical → stable

export type SeriesPoint = { date: string; value: number };
export type PostsDay = { date: string; video: number; image: number };
export type RowCharts = {
  reach: SeriesPoint[];
  posts: PostsDay[];
  typeMix: { video: number; image: number };
  capped: boolean;
  status: "ok" | "reconnect";
};

type PostsDaily = { byDay: PostsDay[]; capped: boolean };

function parsePostsDaily(data: string): PostsDaily | null {
  try {
    const o = JSON.parse(data) as { byDay?: unknown; capped?: unknown };
    if (Array.isArray(o.byDay)) {
      const byDay = o.byDay
        .filter((x): x is PostsDay => !!x && typeof x.date === "string")
        .map((x) => ({ date: x.date, video: Number(x.video) || 0, image: Number(x.image) || 0 }));
      return { byDay, capped: Boolean(o.capped) };
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** Per-day video/image post counts for [from, to], served from a namespaced cache
 *  row when fresh, else one capped range-bounded Graph call, bucketed by PP day. */
async function getPostsDaily(
  page: { id: string; pageId: string; accessToken: string },
  range: { from: string; to: string },
  wantFresh: boolean,
): Promise<{ data: PostsDaily; status: "ok" | "reconnect" }> {
  const key = `${rangeKey(range.from, range.to)}#daily`;
  const ttl = range.to >= ppToday() ? TTL_TODAY_MS : TTL_PAST_MS;

  if (!wantFresh) {
    const cached = await prisma.monitoredPageRangePostsCache
      .findUnique({ where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } } })
      .catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
      const p = parsePostsDaily(cached.data);
      if (p) return { data: p, status: "ok" };
    }
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { data: { byDay: [], capped: false }, status: "reconnect" };
  }

  const { since, until } = rangeToUnix(range.from, range.to);
  try {
    const { items, capped } = await getPagePostsDailyInRange(page.pageId, token, since, until);
    const counts = new Map<string, { video: number; image: number }>();
    for (const it of items) {
      const d = ppDate(new Date(it.createdTime));
      if (d < range.from || d > range.to) continue;
      const e = counts.get(d) ?? { video: 0, image: 0 };
      if (it.video) e.video++;
      else e.image++;
      counts.set(d, e);
    }
    // Full series with zero-filled empty days so the bar chart spans the whole range.
    const byDay: PostsDay[] = eachDate(range.from, range.to).map((date) => ({
      date,
      video: counts.get(date)?.video ?? 0,
      image: counts.get(date)?.image ?? 0,
    }));
    const out: PostsDaily = { byDay, capped };
    await prisma.monitoredPageRangePostsCache
      .upsert({
        where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } },
        create: { monitoredPageId: page.id, rangeKey: key, data: JSON.stringify(out), fetchedAt: new Date() },
        update: { data: JSON.stringify(out), fetchedAt: new Date() },
      })
      .catch(() => {});
    return { data: out, status: "ok" };
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) return { data: { byDay: [], capped: false }, status: "reconnect" };
    return { data: { byDay: [], capped: false }, status: "ok" }; // transient → empty gracefully
  }
}

/** All three charts' data for one expanded row over [from, to]. */
export async function getMonitoredRowCharts(
  page: { id: string; pageId: string; accessToken: string },
  range: { from: string; to: string },
  wantFresh = false,
): Promise<RowCharts> {
  // Reach: reuse the SAME daily-cache entry the landing-row stats populate
  // (prev-start..to), sliced to the selected range — no extra Graph call.
  const prev = previousPeriod(range.from, range.to);
  const { days, status } = await getMonitoredDaily(page, prev.from, range.to, wantFresh);
  if (status === "reconnect") {
    return { reach: [], posts: [], typeMix: { video: 0, image: 0 }, capped: false, status: "reconnect" };
  }
  let anyReach = false;
  const reach: SeriesPoint[] = days
    .filter((d) => d.date >= range.from && d.date <= range.to)
    .map((d) => {
      if (d.reach != null) anyReach = true;
      return { date: d.date, value: d.reach ?? 0 };
    });

  const posts = await getPostsDaily(page, range, wantFresh);
  const typeMix = posts.data.byDay.reduce(
    (a, d) => ({ video: a.video + d.video, image: a.image + d.image }),
    { video: 0, image: 0 },
  );
  return {
    reach: anyReach ? reach : [],
    posts: posts.data.byDay,
    typeMix,
    capped: posts.data.capped,
    status: posts.status === "reconnect" ? "reconnect" : "ok",
  };
}
