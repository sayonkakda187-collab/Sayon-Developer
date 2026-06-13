import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, getPageTotalPosts } from "@/lib/facebook";

/**
 * All-time post count for a MONITORED page's "Total posts" gauge. Cached ~24h on
 * the `MonitoredPage` row (totalPosts / totalPostsCapped / totalPostsAt). Computed
 * LAZILY (only when a page's dashboard opens) and only for that one page — never a
 * bulk fetch. Token/permission failures come back as `status: "reconnect"`; other
 * errors fall back to any cached value (or null) so the gauge degrades gracefully.
 */

const TTL_MS = 24 * 60 * 60 * 1000;

export type MonitoredTotalPosts = { count: number | null; capped: boolean; status: "ok" | "reconnect" };

type Row = {
  id: string;
  pageId: string;
  accessToken: string;
  totalPosts: number | null;
  totalPostsCapped: boolean;
  totalPostsAt: Date | null;
};

export async function getMonitoredTotalPosts(page: Row, wantFresh = false): Promise<MonitoredTotalPosts> {
  const fresh = page.totalPostsAt != null && Date.now() - page.totalPostsAt.getTime() < TTL_MS;
  if (!wantFresh && fresh && page.totalPosts != null) {
    return { count: page.totalPosts, capped: page.totalPostsCapped, status: "ok" };
  }

  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { count: page.totalPosts, capped: page.totalPostsCapped, status: "reconnect" };
  }

  try {
    const { count, capped } = await getPageTotalPosts(page.pageId, token);
    await prisma.monitoredPage
      .update({ where: { id: page.id }, data: { totalPosts: count, totalPostsCapped: capped, totalPostsAt: new Date() } })
      .catch(() => {});
    return { count, capped, status: "ok" };
  } catch (e) {
    if (e instanceof FacebookApiError && (e.expired || e.permission)) {
      return { count: page.totalPosts, capped: page.totalPostsCapped, status: "reconnect" };
    }
    // Transient (rate limit / network) — serve any stale cached value gracefully.
    return { count: page.totalPosts, capped: page.totalPostsCapped, status: "ok" };
  }
}
