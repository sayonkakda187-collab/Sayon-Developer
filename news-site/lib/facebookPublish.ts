// Server-only module: imports the Prisma client and decrypts tokens. Never
// import this from a Client Component.
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, postToPage, postPhotoToPage, commentOnPost } from "@/lib/facebook";
import { siteConfig } from "@/lib/site";
import {
  type ShareMode,
  DEFAULT_PHOTO_CAPTION,
  DEFAULT_PHOTO_COMMENT,
  renderTemplate,
  creditLine,
} from "@/lib/facebookShareTemplates";

/** Canonical public URL for an article (Facebook scrapes its OG tags). */
export function articleUrl(slug: string): string {
  // Single source of truth: siteConfig.url is env-aware and never localhost in
  // production, so shared links are always absolute + canonical.
  return `${siteConfig.url}/news/${slug}`;
}

/** The branded per-article OG card image (used as the photo when an article has
 *  no featured image). It's a public 1200x630 PNG Facebook can fetch. */
export function ogCardImageUrl(slug: string): string {
  return `${siteConfig.url}/news/${slug}/opengraph-image`;
}

/** The message body posted to Facebook for a LINK-mode share. */
export function buildMessage(article: { title: string; excerpt: string | null }): string {
  const parts = [article.title];
  if (article.excerpt) parts.push("", article.excerpt);
  parts.push("", `Read more on ${siteConfig.name}:`);
  return parts.join("\n");
}

type ArticleForPost = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  coverImage?: string | null;
  coverCredit?: string | null;
  coverImageSource?: string | null;
};

type PageForPost = {
  id: string;
  pageId: string;
  pageName: string;
  accessToken: string; // encrypted
  status: string;
};

/** Per-share config (mode + optional caption override + templates). */
export type ShareConfig = {
  mode?: ShareMode;
  /** Explicit caption/message override; blank → built from the template/default. */
  caption?: string;
  captionTemplate?: string;
  commentTemplate?: string;
};

/** Result of attempting to post one article to one page. */
export type PublishResult = {
  pageDbId: string;
  pageName: string;
  ok: boolean;
  graphPostId?: string;
  error?: string;
  /** True when the failure was a bad/expired token (page marked Expired). */
  expired?: boolean;
  /** Which mode actually ran. */
  mode?: ShareMode;
  /** Photo mode: the id of the link comment added as the Page (if it succeeded). */
  commentId?: string;
  /** Photo mode: set when the post succeeded but the link comment did NOT. */
  commentError?: string;
  /** True when the comment failed specifically for a missing permission. */
  commentPermission?: boolean;
};

/** Defense-in-depth for PHOTO mode: the article link belongs in the comment, never
 *  the photo caption. Drop any caption line that carries the URL (or host) or a
 *  dangling "Read more on …:" lead-in (e.g. from an edited/seeded link-style caption). */
function stripArticleUrlFromCaption(caption: string, url: string): string {
  const host = url.replace(/^https?:\/\//, "");
  return caption
    .split("\n")
    .filter(
      (line) =>
        !line.includes(url) &&
        !(host && line.includes(host)) &&
        !/^\s*read more on .+?:?\s*$/i.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function markConnected(pageDbId: string): Promise<void> {
  await prisma.facebookPage
    .update({ where: { id: pageDbId }, data: { status: "Connected", lastSyncedAt: new Date() } })
    .catch(() => {});
}

/** Add the link comment AS THE PAGE, retrying transient failures once. Permission/
 *  token errors are NOT retried (they won't change) and rethrow immediately. */
async function commentWithRetry(postId: string, token: string, message: string): Promise<{ commentId: string }> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await commentOnPost({ postId, accessToken: token, message });
    } catch (e) {
      lastErr = e;
      if (e instanceof FacebookApiError && (e.permission || e.expired)) throw e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

/**
 * Post one article to one page via the Graph API, updating page status on the
 * way. The single chokepoint every trigger calls ("Publish now", auto-share on
 * publish, scheduled publish-time shares, the cron, agent shares, re-share) — so
 * the share MODE and behavior are identical everywhere.
 *
 * - LINK mode (default): POST /{page}/feed with message + link (OG preview).
 * - PHOTO mode: POST /{page}/photos with the featured image (or the branded OG
 *   card when there's none) + a caption, then add the article link as the FIRST
 *   comment AS THE PAGE. If the photo posts but the comment fails, it returns
 *   ok:true with `commentError` set so the Share Center can offer a one-click
 *   retry — the link is never silently missing.
 *
 * Never throws for an expected Graph/token failure — returns `ok:false` with a
 * readable message so batch callers can report per-page outcomes and continue.
 */
export async function publishArticleToPage(
  article: ArticleForPost,
  page: PageForPost,
  share?: ShareConfig,
): Promise<PublishResult> {
  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    await prisma.facebookPage
      .update({ where: { id: page.id }, data: { status: "Expired" } })
      .catch(() => {});
    return {
      pageDbId: page.id,
      pageName: page.pageName,
      ok: false,
      expired: true,
      error: "Stored token could not be decrypted (key changed or corrupted). Reconnect the page.",
    };
  }

  const mode: ShareMode = share?.mode ?? "link";
  const url = articleUrl(article.slug);

  try {
    if (mode === "photo") {
      const imageUrl = (article.coverImage || "").trim() || ogCardImageUrl(article.slug);
      const rawCaption =
        share?.caption?.trim() ||
        renderTemplate(share?.captionTemplate || DEFAULT_PHOTO_CAPTION, {
          headline: article.title,
          excerpt: article.excerpt || "",
          credit: creditLine(article.coverCredit, article.coverImageSource),
          // No {url} — the link goes in the comment, never the caption.
        });
      // Belt-and-suspenders: never let the article link leak into the photo caption.
      const caption = stripArticleUrlFromCaption(rawCaption, url);
      const { postId } = await postPhotoToPage({ pageId: page.pageId, accessToken: token, imageUrl, caption });
      await markConnected(page.id);

      // Promised the reader the link in the comments — add it AS THE PAGE.
      const commentMsg = renderTemplate(share?.commentTemplate || DEFAULT_PHOTO_COMMENT, { url, headline: article.title });
      try {
        const { commentId } = await commentWithRetry(postId, token, commentMsg);
        return { pageDbId: page.id, pageName: page.pageName, ok: true, graphPostId: postId, mode, commentId };
      } catch (ce) {
        return {
          pageDbId: page.id,
          pageName: page.pageName,
          ok: true, // the photo IS posted — the comment just didn't land
          graphPostId: postId,
          mode,
          commentError: ce instanceof Error ? ce.message : "Could not add the link comment.",
          commentPermission: ce instanceof FacebookApiError && ce.permission,
        };
      }
    }

    // LINK mode (the original behavior).
    const { postId } = await postToPage({
      pageId: page.pageId,
      accessToken: token,
      message: share?.caption?.trim() || buildMessage(article),
      link: url,
    });
    await markConnected(page.id);
    return { pageDbId: page.id, pageName: page.pageName, ok: true, graphPostId: postId, mode: "link" };
  } catch (e) {
    const expired = e instanceof FacebookApiError && e.expired;
    if (expired) {
      await prisma.facebookPage
        .update({ where: { id: page.id }, data: { status: "Expired" } })
        .catch(() => {});
    }
    return {
      pageDbId: page.id,
      pageName: page.pageName,
      ok: false,
      expired,
      mode,
      error: e instanceof Error ? e.message : "Unknown error posting to Facebook.",
    };
  }
}

/**
 * Retry just the link COMMENT for a photo share whose post landed but whose
 * comment failed. Used by the Share Center's "Add comment" button + after a token
 * is fixed. Returns the new comment id or a categorized error.
 */
export async function addLinkComment(
  postId: string,
  page: PageForPost,
  article: { slug: string; title: string },
  commentTemplate?: string,
): Promise<{ ok: boolean; commentId?: string; error?: string; permission?: boolean }> {
  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    return { ok: false, error: "Stored token could not be decrypted. Reconnect the page." };
  }
  const url = articleUrl(article.slug);
  const message = renderTemplate(commentTemplate || DEFAULT_PHOTO_COMMENT, { url, headline: article.title });
  try {
    const { commentId } = await commentWithRetry(postId, token, message);
    return { ok: true, commentId };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not add the link comment.",
      permission: e instanceof FacebookApiError && e.permission,
    };
  }
}
