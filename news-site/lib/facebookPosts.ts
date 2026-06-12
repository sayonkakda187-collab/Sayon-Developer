import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { getPagePosts, getPostReach, type PagePost } from "@/lib/facebook";

/**
 * Page Control → Content data source: a Page's REAL published posts from the
 * OFFICIAL Graph API, with a ~6h first-page cache so opening a Page's dashboard
 * doesn't re-hit Facebook each time. Lazy by design — only the Page being viewed
 * is fetched, never the whole list of (hundreds of) Pages. Reach is enriched
 * best-effort and one post failing never breaks the rest.
 */

const PER_PAGE = 15;
// First-page cache TTL. "Load more" (cursor paging) and Refresh always go live;
// Refresh also rewrites this first-page snapshot.
const FRESH_MS = 6 * 60 * 60 * 1000;

export type PagePostsResult = { posts: PagePost[]; after: string | null };

/** Bounded-concurrency map so the reach pass stays under the route time budget. */
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

/** Add best-effort reach to each post (read_insights). Tolerates per-post failure. */
async function enrichReach(posts: PagePost[], token: string): Promise<PagePost[]> {
  return mapLimit(posts, 5, async (p) => {
    const { reach } = await getPostReach(p.id, token);
    return { ...p, reach };
  });
}

/**
 * Posts for one Page's Content view. Serves the cached first page when fresh; a
 * cursor (`after`) or `refresh` fetches live from Graph. Throws on token /
 * permission failures so the caller can show "needs reconnect". The first page is
 * cached (with reach) for fast subsequent opens.
 */
export async function getPagePostsForView(
  page: { id: string; pageId: string; accessToken: string },
  opts: { after?: string | null; refresh?: boolean } = {},
): Promise<PagePostsResult> {
  const firstPage = !opts.after;

  if (firstPage && !opts.refresh) {
    const cached = await prisma.pagePostsCache.findUnique({ where: { facebookPageId: page.id } }).catch(() => null);
    if (cached && Date.now() - cached.fetchedAt.getTime() < FRESH_MS) {
      const parsed = parseCache(cached.data);
      if (parsed) return parsed;
    }
  }

  const token = decryptSecret(page.accessToken); // throws on corrupt token → caller maps to reconnect
  const { posts, after } = await getPagePosts(page.pageId, token, { after: opts.after, limit: PER_PAGE });
  const enriched = await enrichReach(posts, token);

  if (firstPage) {
    await prisma.pagePostsCache
      .upsert({
        where: { facebookPageId: page.id },
        create: { facebookPageId: page.id, data: JSON.stringify({ posts: enriched, after }), fetchedAt: new Date() },
        update: { data: JSON.stringify({ posts: enriched, after }), fetchedAt: new Date() },
      })
      .catch(() => {});
  }

  return { posts: enriched, after };
}
