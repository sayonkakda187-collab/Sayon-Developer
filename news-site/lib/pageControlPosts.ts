import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getPagePosts, getPostReach, getPostReactionBreakdowns, getPostVideoAdBreakImpressions, type PagePost } from "@/lib/facebook";

/**
 * Page Control → Content data source for a MONITORED page: its REAL published
 * posts from the official Graph API, cached ~6h in its OWN
 * `MonitoredPagePostsCache` table. Reuses the shared low-level Graph helpers
 * (`getPagePosts` / `getPostReach`); only the cache table differs. Lazy — only the
 * opened page is fetched.
 */

const PER_PAGE = 15;
const FRESH_MS = 6 * 60 * 60 * 1000;

export type PagePostsResult = { posts: PagePost[]; after: string | null };

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

function parseCache(data: string): PagePostsResult | null {
  try {
    const o = JSON.parse(data) as { posts?: unknown; after?: unknown };
    if (Array.isArray(o.posts)) {
      return { posts: o.posts as PagePost[], after: typeof o.after === "string" ? o.after : null };
    }
  } catch {
    // fall through
  }
  return null;
}

async function enrichReach(posts: PagePost[], token: string): Promise<PagePost[]> {
  return mapLimit(posts, 5, async (p) => {
    const { reach } = await getPostReach(p.id, token);
    return { ...p, reach };
  });
}

/**
 * Best-effort per-emotion reaction breakdown for the loaded posts in ONE batched
 * Graph call. Isolated from the core posts fetch on purpose: if Facebook ever
 * rejects a reaction field (deprecation/permission), we keep the posts and just
 * drop the breakdown (`reactionsByType: null`) rather than failing the Content view.
 */
async function enrichReactionBreakdown(posts: PagePost[], token: string): Promise<PagePost[]> {
  if (posts.length === 0) return posts;
  try {
    const byId = await getPostReactionBreakdowns(posts.map((p) => p.id), token);
    return posts.map((p) => ({ ...p, reactionsByType: byId.get(p.id) ?? null }));
  } catch {
    return posts.map((p) => ({ ...p, reactionsByType: null }));
  }
}

/**
 * Best-effort per-post VIDEO ad-break ad IMPRESSIONS (not earnings) for the loaded
 * posts in ONE batched call. Only video posts on a monetized Page return a value;
 * everything else is left null. Isolated try/catch so a non-video batch / retired
 * metric / missing monetization access never breaks the Content view.
 */
async function enrichVideoAdBreaks(posts: PagePost[], token: string): Promise<PagePost[]> {
  if (posts.length === 0) return posts;
  try {
    const byId = await getPostVideoAdBreakImpressions(posts.map((p) => p.id), token);
    return posts.map((p) => ({ ...p, videoAdImpressions: byId.get(p.id) ?? null }));
  } catch {
    return posts.map((p) => ({ ...p, videoAdImpressions: null }));
  }
}

/**
 * Posts for one monitored page's Content view. Serves the cached first page when
 * fresh; a cursor (`after`) or `refresh` fetches live. Throws on token/permission
 * failures so the caller can show "needs reconnect".
 */
export async function getMonitoredPagePostsForView(
  page: { id: string; pageId: string; accessToken: string },
  opts: { after?: string | null; refresh?: boolean } = {},
): Promise<PagePostsResult> {
  const firstPage = !opts.after;

  if (firstPage && !opts.refresh) {
    const cached = await prisma.monitoredPagePostsCache.findUnique({ where: { monitoredPageId: page.id } }).catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < FRESH_MS) {
      const parsed = parseCache(cached.data);
      if (parsed) return parsed;
    }
  }

  const token = decryptSecret(page.accessToken); // throws on corrupt token → caller maps to reconnect
  const { posts, after } = await getPagePosts(page.pageId, token, { after: opts.after, limit: PER_PAGE });
  const enriched = await enrichVideoAdBreaks(await enrichReactionBreakdown(await enrichReach(posts, token), token), token);

  if (firstPage) {
    await prisma.monitoredPagePostsCache
      .upsert({
        where: { monitoredPageId: page.id },
        create: { monitoredPageId: page.id, data: JSON.stringify({ posts: enriched, after }), fetchedAt: new Date() },
        update: { data: JSON.stringify({ posts: enriched, after }), fetchedAt: new Date() },
      })
      .catch(() => {});
  }

  return { posts: enriched, after };
}
