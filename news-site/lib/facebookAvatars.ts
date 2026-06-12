import "server-only";

import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { fetchPagePicture } from "@/lib/facebook";

/**
 * Page-avatar caching. Each Page's profile picture is resolved server-side (with
 * its encrypted token) and the public CDN URL is stored on the record so admin
 * lists render it directly — no Graph call per image. FB CDN URLs expire, so the
 * stored URL is refreshed when missing or older than this TTL (and the client
 * falls back to the token-safe proxy, then initials, if a stored URL 404s).
 */
export const AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000; // ~7 days

/** True when a Page's avatar has never been fetched or is past the TTL. */
export function avatarIsStale(avatarFetchedAt: Date | null | undefined): boolean {
  return !avatarFetchedAt || Date.now() - avatarFetchedAt.getTime() > AVATAR_TTL_MS;
}

/**
 * Refresh one Page's stored avatar (best-effort). Resolves the picture with the
 * Page token, stores the CDN URL (or null for a silhouette / no picture) +
 * `avatarFetchedAt`, and returns the new URL. Never throws — a bad token or Graph
 * error just leaves the avatar unset (the UI shows initials).
 */
export async function refreshPageAvatar(page: {
  id: string;
  pageId: string;
  accessToken: string;
}): Promise<string | null> {
  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return null;
  }
  try {
    const pic = await fetchPagePicture(page.pageId, token, 96);
    const url = pic.isSilhouette ? null : pic.url;
    await prisma.facebookPage
      .update({ where: { id: page.id }, data: { avatarUrl: url, avatarFetchedAt: new Date() } })
      .catch(() => {});
    return url;
  } catch {
    return null;
  }
}

/** Run an async map with bounded concurrency (keeps Graph calls under control). */
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

/**
 * Refresh several Pages' avatars at once, concurrency-limited and capped so a big
 * sync can't blow the function time budget. Only touches Pages whose avatar is
 * missing/stale; the rest are left as-is. Best-effort — failures are swallowed.
 */
export async function refreshAvatarsFor(
  pages: { id: string; pageId: string; accessToken: string; avatarFetchedAt: Date | null }[],
  opts: { cap?: number } = {},
): Promise<void> {
  const stale = pages.filter((p) => avatarIsStale(p.avatarFetchedAt)).slice(0, opts.cap ?? 60);
  if (stale.length === 0) return;
  await mapLimit(stale, 6, (p) => refreshPageAvatar(p));
}
