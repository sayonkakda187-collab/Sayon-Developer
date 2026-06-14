import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { uniqueArticleSlug } from "@/lib/slug";
import { permalinkForPost } from "@/lib/facebook";
import { publishArticleNow } from "@/app/admin/facebook-actions";
import { publishScheduledArticleById, scheduleArticle } from "@/lib/publish";
import { formatSchedule } from "@/lib/fbSchedule";
import { applyStoredEarnings, type StoredEarningRow } from "@/lib/pageEarningsImport";
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
      case "set_page_earnings":
        return await doSetEarnings(action.params);
      default:
        return { ok: false, error: "Unknown action type." };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Action failed." };
  }
}

async function doPublish(params: Record<string, unknown>): Promise<ExecResult> {
  const articleId = String(params.articleId ?? "");
  const a = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, status: true } });
  if (!a) return { ok: false, error: "Article not found." };
  if (a.status === "published") return { ok: true, result: `“${a.title}” is already published.` };

  // The approval may carry a scheduled time (set by the agent or overridden in the
  // approval card). A valid FUTURE time → schedule; otherwise publish now.
  const iso = typeof params.scheduledAt === "string" ? params.scheduledAt : "";
  const when = iso ? new Date(iso) : null;
  if (when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 30_000) {
    await scheduleArticle(a.id, when);
    return { ok: true, result: `Scheduled “${a.title}” to publish ${formatSchedule(when)} (Phnom Penh).` };
  }

  // Publish now via the shared chokepoint (Key Points + Facebook auto-share to any
  // pages stored on the article fire here, at publish time).
  const res = await publishScheduledArticleById(a.id);
  if (!res.ok) return { ok: false, error: res.error ?? "Publish failed." };
  const shareNote = res.shared ? ` Auto-shared to ${res.shared} Facebook page${res.shared === 1 ? "" : "s"}.` : "";
  return { ok: true, result: `Published “${a.title}”.${shareNote}` };
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

async function doSetEarnings(params: Record<string, unknown>): Promise<ExecResult> {
  const rows = Array.isArray(params.rows) ? (params.rows as StoredEarningRow[]) : [];
  if (rows.length === 0) return { ok: false, error: "No earnings rows to save." };
  const res = await applyStoredEarnings(rows);
  if (res.saved + res.overwritten === 0) {
    return { ok: false, error: res.skipped ? `Couldn't save — ${res.skipped} row(s) were skipped (pages may have been removed).` : "Nothing was saved." };
  }
  // Refresh the Page Control views that read earnings (list pill + Earnings tab).
  revalidatePath("/admin/page-control");
  const parts = [`Saved ${res.saved} new`];
  if (res.overwritten) parts.push(`${res.overwritten} overwritten`);
  if (res.skipped) parts.push(`${res.skipped} skipped`);
  return { ok: true, result: `${parts.join(", ")} earnings value${res.saved + res.overwritten === 1 ? "" : "s"}.` };
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
