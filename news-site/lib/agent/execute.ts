import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { uniqueArticleSlug } from "@/lib/slug";
import { permalinkForPost } from "@/lib/facebook";
import { publishArticleNow } from "@/app/admin/facebook-actions";
import type { AgentActionRecord } from "./store";

export type ExecResult = { ok: boolean; result?: string; error?: string };

/**
 * Run a gated action's real side effect. Called ONLY after an Approve click (or
 * when the owner has turned approval off for that action). Reuses the existing
 * publish/share flows so behavior matches the manual UI.
 */
export async function executeAgentAction(action: AgentActionRecord): Promise<ExecResult> {
  try {
    switch (action.type) {
      case "publish_article":
        return await doPublish(action.params);
      case "update_published_article":
        return await doUpdatePublished(action.params);
      case "share_to_facebook":
        return await doShare(action.params);
      default:
        return { ok: false, error: "Unknown action type." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Action failed." };
  }
}

async function doPublish(params: Record<string, unknown>): Promise<ExecResult> {
  const articleId = String(params.articleId ?? "");
  const a = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, slug: true, status: true, publishedAt: true } });
  if (!a) return { ok: false, error: "Article not found." };
  if (a.status === "published") return { ok: true, result: `“${a.title}” is already published.` };
  await prisma.article.update({
    where: { id: a.id },
    data: { status: "published", publishedAt: a.publishedAt ?? new Date() },
  });
  revalidatePath("/");
  revalidatePath(`/news/${a.slug}`);
  revalidatePath("/admin/articles");
  return { ok: true, result: `Published “${a.title}”.` };
}

async function doUpdatePublished(params: Record<string, unknown>): Promise<ExecResult> {
  const articleId = String(params.articleId ?? "");
  const a = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, slug: true, status: true } });
  if (!a) return { ok: false, error: "Article not found." };
  if (a.status !== "published") return { ok: false, error: "That article isn’t published — use update_draft instead." };

  const data: { title?: string; slug?: string; excerpt?: string; content?: string } = {};
  if (typeof params.title === "string" && params.title.trim()) {
    data.title = params.title.trim().slice(0, 200);
    data.slug = await uniqueArticleSlug(data.title, a.id);
  }
  if (typeof params.excerpt === "string" && params.excerpt.trim()) data.excerpt = params.excerpt.trim();
  if (typeof params.content === "string" && params.content.trim()) data.content = params.content;
  if (Object.keys(data).length === 0) return { ok: false, error: "No changes were provided." };

  await prisma.article.update({ where: { id: a.id }, data });
  revalidatePath("/");
  revalidatePath(`/news/${data.slug ?? a.slug}`);
  if (data.slug && data.slug !== a.slug) revalidatePath(`/news/${a.slug}`);
  revalidatePath("/admin/articles");
  return { ok: true, result: `Updated the live article “${data.title ?? a.title}”.` };
}

async function doShare(params: Record<string, unknown>): Promise<ExecResult> {
  const articleId = String(params.articleId ?? "");
  const pageDbId = String(params.pageDbId ?? "");
  if (!articleId || !pageDbId) return { ok: false, error: "Missing article or page." };
  const res = await publishArticleNow({ articleId, pageDbIds: [pageDbId] });
  if (!res.ok) return { ok: false, error: res.error };
  const r = res.data[0];
  if (!r) return { ok: false, error: "No result from the share." };
  if (!r.ok) return { ok: false, error: r.error ?? "Share failed." };
  const link = r.graphPostId ? ` ${permalinkForPost(r.graphPostId)}` : "";
  return { ok: true, result: `Shared to ${r.pageName}.${link}` };
}
