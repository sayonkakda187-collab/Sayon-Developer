"use server";

import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { articleUrl } from "@/lib/facebookPublish";
import { siteConfig } from "@/lib/site";

// Single source of truth for the "Share / Promote" panel. Returns exactly what
// Facebook will scrape from the article's public page — the canonical URL
// (`articleUrl`, same builder the Graph API poster uses) and the saved
// `coverImage` (the page's Open Graph image) — plus a ready-made caption. Drafts
// have no public URL yet, so they return `ok:false` and the UI shows a hint.

export type ShareInfo = {
  id: string;
  title: string;
  /** Public canonical URL, e.g. https://dailyledger.today/news/{slug}. */
  url: string;
  /** Absolute cover image URL (matches the OG image), or null if none set. */
  image: string | null;
  /** Editable, pre-filled caption: headline + short hook + link. */
  caption: string;
};

/** Resolve a possibly-relative cover path to an absolute URL (for download/copy
 *  and to mirror what crawlers fetch). Blob uploads are already absolute. */
function absoluteImage(coverImage: string | null): string | null {
  if (!coverImage) return null;
  if (/^https?:\/\//i.test(coverImage)) return coverImage;
  return `${siteConfig.url}${coverImage.startsWith("/") ? "" : "/"}${coverImage}`;
}

/** Build a sensible, engaging-but-neutral default caption. */
function buildCaption(title: string, excerpt: string | null, url: string): string {
  const parts = [title];
  const hook = (excerpt ?? "").trim();
  if (hook) parts.push("", hook);
  parts.push("", `Read the full story on ${siteConfig.name}:`, url);
  return parts.join("\n");
}

export async function getShareInfo(
  id: string,
): Promise<{ ok: true; info: ShareInfo } | { ok: false; error: string; status?: string }> {
  await requireAdmin();
  const articleId = String(id ?? "").trim();
  if (!articleId) return { ok: false, error: "Missing article id." };

  const article = await prisma.article.findUnique({
    where: { id: articleId },
    select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, status: true },
  });
  if (!article) return { ok: false, error: "Article not found." };
  if (article.status !== "published") {
    return { ok: false, error: "Publish this article first to get its public share link.", status: article.status };
  }

  const url = articleUrl(article.slug);
  return {
    ok: true,
    info: {
      id: article.id,
      title: article.title,
      url,
      image: absoluteImage(article.coverImage),
      caption: buildCaption(article.title, article.excerpt, url),
    },
  };
}
