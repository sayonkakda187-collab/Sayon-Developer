// Server-only module: imports the Prisma client and decrypts tokens. Never
// import this from a Client Component.
import { prisma } from "@/lib/db";
import { decryptSecret } from "@/lib/crypto";
import { FacebookApiError, postToPage } from "@/lib/facebook";
import { siteConfig } from "@/lib/site";

/** Canonical public URL for an article (Facebook scrapes its OG tags). */
export function articleUrl(slug: string): string {
  // Single source of truth: siteConfig.url is env-aware and never localhost in
  // production, so shared links are always absolute + canonical.
  return `${siteConfig.url}/news/${slug}`;
}

/** The message body posted to Facebook for an article. */
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
};

type PageForPost = {
  id: string;
  pageId: string;
  pageName: string;
  accessToken: string; // encrypted
  status: string;
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
};

/**
 * Post one article to one page via the Graph API, updating page status on the
 * way. This is the single chokepoint both the "Publish now" action and the cron
 * runner call, so behavior (token decrypt, message build, error handling,
 * Expired marking) is identical everywhere.
 *
 * Never throws for an expected Graph/token failure — returns `ok:false` with a
 * readable message so batch callers can report per-page outcomes and continue.
 */
export async function publishArticleToPage(
  article: ArticleForPost,
  page: PageForPost,
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

  try {
    const { postId } = await postToPage({
      pageId: page.pageId,
      accessToken: token,
      message: buildMessage(article),
      link: articleUrl(article.slug),
    });
    // Successful post implies a valid token → keep/restore Connected + sync time.
    await prisma.facebookPage
      .update({
        where: { id: page.id },
        data: { status: "Connected", lastSyncedAt: new Date() },
      })
      .catch(() => {});
    return { pageDbId: page.id, pageName: page.pageName, ok: true, graphPostId: postId };
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
      error: e instanceof Error ? e.message : "Unknown error posting to Facebook.",
    };
  }
}
