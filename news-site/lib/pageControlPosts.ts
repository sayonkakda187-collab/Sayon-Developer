import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getPagePosts, getPostReach, type PagePost } from "@/lib/facebook";

/**
 * Page Control → Content data source for a MONITORED page: its REAL published
 * posts from the official Graph API, cached ~6h in `MonitoredPagePostsCache` (its
 * OWN cache, independent from the farm's `PagePostsCache`). Reuses the shared
 * low-level Graph helpers (`getPagePosts` / `getPostReach`); only the cache table
 * differs. Lazy — only the opened page is fetched.
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
  const enriched = await enrichReach(posts, token);

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
