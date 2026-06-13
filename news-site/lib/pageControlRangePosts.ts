import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPagePostsInRange } from "@/lib/facebook";
import { rangeToUnix, rangeKey, ppToday } from "@/lib/fbInsightsRange";

/**
 * Range-aware published-post counts for a monitored page's landing-list "Posts"
 * pill: how many posts the page published WITHIN the selected range, split into
 * video vs image/other. Cached per (page, range) in `MonitoredPageRangePostsCache`
 * — short TTL when the range includes today (the count grows through the day),
 * longer for historical ranges. One range-bounded, capped Graph call per page per
 * range (never the page's whole history). Token failures degrade to a graceful
 * `reconnect` status; transient errors degrade to a 0 count.
 */

const TTL_TODAY_MS = 3 * 60 * 60 * 1000;
const TTL_PAST_MS = 24 * 60 * 60 * 1000;

export type RangePosts = { total: number; video: number; image: number; capped: boolean };
export type MonitoredRangePosts = RangePosts & { status: "ok" | "reconnect" };

const EMPTY: RangePosts = { total: 0, video: 0, image: 0, capped: false };

function parse(data: string): RangePosts | null {
  try {
    const o = JSON.parse(data) as Partial<RangePosts>;
    if (typeof o.total === "number") {
      return { total: o.total, video: typeof o.video === "number" ? o.video : 0, image: typeof o.image === "number" ? o.image : 0, capped: Boolean(o.capped) };
    }
  } catch {
    /* fall through */
  }
  return null;
}

export async function getMonitoredRangePosts(
  page: { id: string; pageId: string; accessToken: string },
  range: { from: string; to: string },
  wantFresh = false,
): Promise<MonitoredRangePosts> {
  const key = rangeKey(range.from, range.to);
  const ttl = range.to >= ppToday() ? TTL_TODAY_MS : TTL_PAST_MS;

  if (!wantFresh) {
    const cached = await prisma.monitoredPageRangePostsCache
      .findUnique({ where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } } })
      .catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < ttl) {
      const p = parse(cached.data);
      if (p) return { ...p, status: "ok" };
    }
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { ...EMPTY, status: "reconnect" };
  }

  const { since, until } = rangeToUnix(range.from, range.to);
  try {
    const r = await getPagePostsInRange(page.pageId, token, since, until);
    await prisma.monitoredPageRangePostsCache
      .upsert({
        where: { monitoredPageId_rangeKey: { monitoredPageId: page.id, rangeKey: key } },
        create: { monitoredPageId: page.id, rangeKey: key, data: JSON.stringify(r), fetchedAt: new Date() },
        update: { data: JSON.stringify(r), fetchedAt: new Date() },
      })
      .catch(() => {});
    return { ...r, status: "ok" };
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) return { ...EMPTY, status: "reconnect" };
    return { ...EMPTY, status: "ok" }; // transient (rate limit / network) → 0 gracefully
  }
}
