import "server-only";

import { prisma } from "@/lib/db";
import { slugify, uniqueArticleSlug } from "@/lib/slug";
import { getActiveSiteId } from "@/lib/sites";
import { aggregateTrending, isSourceConfigured } from "@/lib/news/aggregate";
import { NEWS_SOURCE_IDS } from "@/lib/news/sources";
import { generateAiAssist } from "@/lib/aiAssist";
import { pickFeaturedImage } from "@/lib/imageSearch";
import { permalinkForPost } from "@/lib/facebook";
import { localInputToUtcISO, formatSchedule } from "@/lib/fbSchedule";
import { buildEarningsPreview, toStoredRows, MAX_EARNINGS_BATCH, type EarningEntryInput } from "@/lib/pageEarningsImport";
import type { AnthropicTool } from "./anthropic";
import { addAction, updateAction, type AgentSettings, type AgentActionRecord, type AgentActionType } from "./store";
import { executeAgentAction } from "./execute";
import { sendApprovalPush } from "./push";

export type ToolResult = {
  content: string; // fed back to the model
  summary: string; // "🔧 …" log line
  isError?: boolean;
  proposedAction?: AgentActionRecord; // set when a gated action awaits approval
};

export type ToolCtx = { model?: string; settings: AgentSettings };

// ── Tool schemas ─────────────────────────────────────────────────────────────
const T_list: AnthropicTool = {
  name: "list_articles",
  description: "List the site's articles (newest first). Filter by status ('draft','published','all') + optional title search. Returns id, title, status, category, excerpt, updated.",
  input_schema: { type: "object", properties: { status: { type: "string", enum: ["draft", "published", "all"] }, query: { type: "string" } } },
};
const T_get: AnthropicTool = {
  name: "get_article",
  description: "Get one article's full details by id (title, status, excerpt, body, category, slug).",
  input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
};
const T_news: AnthropicTool = {
  name: "search_news",
  description: "Search trending real-world news via the site's cached providers (small daily quotas — search sparingly). Give a category OR keyword. Returns headlines + source + url to research and attribute.",
  input_schema: { type: "object", properties: { category: { type: "string" }, keyword: { type: "string" } } },
};
const T_createDraft: AnthropicTool = {
  name: "create_draft",
  description: "Write a NEW ORIGINAL article in the site's own words and save as a DRAFT (never published). ALWAYS pass source_url when based on a news item so a source link is attributed. Returns the draft id + edit URL.",
  input_schema: { type: "object", properties: { topic: { type: "string" }, source_url: { type: "string" }, source_title: { type: "string" }, category: { type: "string" } }, required: ["topic"] },
};
const T_updateDraft: AnthropicTool = {
  name: "update_draft",
  description: "Edit a DRAFT's title, excerpt, or body (markdown). Drafts only — editing a live article uses update_published_article.",
  input_schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" }, content: { type: "string" } }, required: ["id"] },
};
const T_publish: AnthropicTool = {
  name: "publish_article",
  description: "Propose PUBLISHING or SCHEDULING a draft. Requires the owner's approval — it returns a pending action, it does NOT publish immediately. Pass `when` to schedule it for a future time (the owner can still adjust the time on the approval card); omit `when` to propose publishing immediately on approval.",
  input_schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      when: { type: "string", description: "Optional scheduled publish time in Asia/Phnom_Penh as 'YYYY-MM-DD HH:mm' (24-hour). Resolve natural-language times (e.g. 'tonight 9pm') to this format using the current Phnom Penh time given in the system prompt. Omit to publish immediately." },
    },
    required: ["id"],
  },
};
const T_updatePublished: AnthropicTool = {
  name: "update_published_article",
  description: "Propose EDITING a LIVE (published) article's title/excerpt/body. Gated — returns a pending action for the owner to approve.",
  input_schema: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, excerpt: { type: "string" }, content: { type: "string" } }, required: ["id"] },
};
const T_share: AnthropicTool = {
  name: "share_to_facebook",
  description: "Propose SHARING a published article to a connected Facebook Page. Gated — returns a pending action for the owner to approve. `page` is a Page name or id.",
  input_schema: { type: "object", properties: { article_id: { type: "string" }, page: { type: "string" } }, required: ["article_id", "page"] },
};
const T_stats: AnthropicTool = {
  name: "get_share_stats",
  description: "Read recent Facebook share stats (counts of posted/failed/pending + a few recent posts). Read-only — no approval needed.",
  input_schema: { type: "object", properties: {} },
};
const T_setEarnings: AnthropicTool = {
  name: "set_page_earnings",
  description:
    "Propose recording daily EARNINGS for monitored Facebook Pages (Page Control). GATED — it returns a pending action with a PREVIEW the owner must Approve; it does NOT save anything until then. Resolve the owner's pasted / natural-language numbers into one entry per (page, day, amount). Call this ONCE with all the entries. The tool fuzzy-matches each page name and flags overwrites of existing values; if some names don't match it lists them — relay that and ask the owner to clarify, never invent a page or guess silently.",
  input_schema: {
    type: "object",
    properties: {
      entries: {
        type: "array",
        description: "One object per page + day + amount.",
        items: {
          type: "object",
          properties: {
            pageName: { type: "string", description: "The page name as the owner wrote it (it is fuzzy-matched to a monitored page)." },
            date: { type: "string", description: "The day — prefer YYYY-MM-DD in Asia/Phnom_Penh. 'Jun 1' / 'June 1' / '6/1' / '2026-06-01' / a bare day (= current month) are also accepted." },
            amount: { type: "number", description: "Earnings for that page on that day in USD (a number ≥ 0, up to 2 decimals). Strip any $ or commas." },
          },
          required: ["pageName", "date", "amount"],
        },
      },
    },
    required: ["entries"],
  },
};

/** The tools exposed to the model for this turn, filtered by enabled capabilities. */
export function buildTools(s: AgentSettings): AnthropicTool[] {
  const tools: AnthropicTool[] = [T_list, T_get];
  if (s.capabilities.newsSearch) tools.push(T_news);
  if (s.capabilities.drafting) tools.push(T_createDraft);
  if (s.capabilities.editing) tools.push(T_updateDraft, T_updatePublished);
  if (s.capabilities.publishing) tools.push(T_publish);
  if (s.capabilities.sharing) tools.push(T_share, T_stats);
  if (s.capabilities.pageEarnings) tools.push(T_setEarnings);
  return tools;
}

export async function executeTool(name: string, input: Record<string, unknown>, ctx: ToolCtx): Promise<ToolResult> {
  switch (name) {
    case "list_articles": return listArticles(input);
    case "get_article": return getArticle(input);
    case "search_news": return searchNews(input);
    case "create_draft": return createDraft(input, ctx.model);
    case "update_draft": return updateDraft(input);
    case "publish_article": return proposePublish(input, ctx.settings);
    case "update_published_article": return proposeUpdatePublished(input, ctx.settings);
    case "share_to_facebook": return proposeShare(input, ctx.settings);
    case "get_share_stats": return shareStats();
    case "set_page_earnings": return proposeSetEarnings(input, ctx.settings);
    default: return { content: `Unknown tool: ${name}`, summary: `Unknown tool ${name}`, isError: true };
  }
}

// ── Gating helper: propose (await approval) or execute now (approval off) ──────
async function gate(
  type: AgentActionType,
  summary: string,
  detail: string | undefined,
  params: Record<string, unknown>,
  settings: AgentSettings,
): Promise<ToolResult> {
  // publish + share are HARD-required; update-live respects the toggle.
  const required = type === "update_published_article" ? settings.requireApproval.editLive : true;
  if (required) {
    const action = await addAction({ type, status: "pending", summary, detail, params });
    // Notify the owner's installed phone(s) — best-effort, never blocks the turn.
    await sendApprovalPush(action).catch(() => {});
    return {
      content: `Proposed for the owner's approval: "${summary}". This is NOT done yet — it executes only when the owner clicks Approve. Do NOT claim it happened.`,
      summary: `Proposed: ${summary}`,
      proposedAction: action,
    };
  }
  const action = await addAction({ type, status: "pending", summary, detail, params });
  const res = await executeAgentAction(action);
  await updateAction(action.id, { status: res.ok ? "done" : "failed", result: res.result, error: res.error, decidedAt: new Date().toISOString() });
  return {
    content: res.ok ? `Done: ${res.result}` : `Failed: ${res.error}`,
    summary: `${res.ok ? "Executed" : "Failed"}: ${summary}`,
    isError: !res.ok,
  };
}

// ── Read / draft tools (Phase 1) ──────────────────────────────────────────────
async function listArticles(input: Record<string, unknown>): Promise<ToolResult> {
  const status = input.status === "draft" || input.status === "published" ? input.status : undefined;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const rows = await prisma.article.findMany({
    where: { ...(status ? { status } : {}), ...(query ? { title: { contains: query, mode: "insensitive" } } : {}) },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, status: true, excerpt: true, updatedAt: true, category: { select: { name: true } } },
  });
  const articles = rows.map((r) => ({ id: r.id, title: r.title, status: r.status, category: r.category?.name ?? null, excerpt: r.excerpt, updated: r.updatedAt.toISOString() }));
  const label = status ?? "all";
  return { content: JSON.stringify({ count: articles.length, articles }), summary: `Listed ${articles.length} ${label} article${articles.length === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}` };
}

async function getArticle(input: Record<string, unknown>): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing id.", summary: "get_article (missing id)", isError: true };
  const a = await prisma.article.findUnique({ where: { id }, select: { id: true, title: true, status: true, excerpt: true, content: true, slug: true, category: { select: { name: true } } } });
  if (!a) return { content: "Article not found.", summary: "get_article: not found", isError: true };
  const content = a.content.length > 6000 ? `${a.content.slice(0, 6000)}\n…(truncated)` : a.content;
  return { content: JSON.stringify({ ...a, category: a.category?.name ?? null, content }), summary: `Read “${a.title}”` };
}

async function searchNews(input: Record<string, unknown>): Promise<ToolResult> {
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  const enabled = NEWS_SOURCE_IDS.filter(isSourceConfigured);
  if (enabled.length === 0) return { content: "No news sources are configured (no API keys).", summary: "search_news: no sources configured", isError: true };
  const result = await aggregateTrending({ enabled, query: { category: category || "general", query: keyword, lang: "en", country: "us", page: 1 } });
  const items = result.items.slice(0, 8).map((i) => ({ title: i.title, source: i.source, url: i.url, publishedAt: i.publishedAt, description: i.description ? i.description.slice(0, 220) : "" }));
  const label = keyword ? `“${keyword}”` : category || "general";
  return { content: JSON.stringify({ count: items.length, cached: result.cached, items }), summary: `Searched news: ${label}${result.cached ? " (cached)" : ""} — ${items.length} hit${items.length === 1 ? "" : "s"}` };
}

async function createDraft(input: Record<string, unknown>, model?: string): Promise<ToolResult> {
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  if (!topic) return { content: "A topic is required.", summary: "create_draft (missing topic)", isError: true };
  const sourceUrl = typeof input.source_url === "string" && /^https?:\/\//i.test(input.source_url) ? input.source_url : "";
  const sourceTitle = typeof input.source_title === "string" ? input.source_title.trim() : "";
  const categoryName = typeof input.category === "string" ? input.category.trim() : "";

  const ai = await generateAiAssist({ headline: topic, topic: categoryName || undefined, model });
  const title = (ai.headlines[0] || topic).slice(0, 200);
  let content = ai.draft;
  if (sourceUrl) {
    let host = sourceUrl;
    try { host = new URL(sourceUrl).hostname.replace(/^www\./, ""); } catch { /* keep */ }
    content += `\n\n---\n\n*Source: [${sourceTitle || host}](${sourceUrl})*`;
  }
  let categoryId: string | null = null;
  if (categoryName) {
    const cat = await prisma.category.findFirst({ where: { OR: [{ name: { equals: categoryName, mode: "insensitive" } }, { slug: slugify(categoryName) }] }, select: { id: true } });
    categoryId = cat?.id ?? null;
  }
  const slug = await uniqueArticleSlug(title);
  const siteId = await getActiveSiteId();
  const created = await prisma.article.create({ data: { title, slug, excerpt: ai.excerpt, content, status: "draft", categoryId, siteId }, select: { id: true } });

  // Auto-attach a relevant, license-clean featured image from the free sources
  // (headline keywords + category). Best-effort: any failure keeps the branded-
  // card fallback and never blocks the draft.
  let image = false;
  try {
    const cover = await pickFeaturedImage(title, categoryName || undefined);
    if (cover) {
      await prisma.article.update({
        where: { id: created.id },
        data: { coverImage: cover.url, coverCredit: cover.credit, coverCreditUrl: cover.creditUrl, coverImageSource: cover.source },
      });
      image = true;
    }
  } catch {
    /* keep the branded-card fallback */
  }

  return { content: JSON.stringify({ id: created.id, title, status: "draft", excerpt: ai.excerpt, image, editUrl: `/admin/articles/${created.id}/edit` }), summary: `Drafted “${title}”${image ? " + image" : ""}` };
}

async function updateDraft(input: Record<string, unknown>): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing id.", summary: "update_draft (missing id)", isError: true };
  const a = await prisma.article.findUnique({ where: { id }, select: { id: true, status: true, title: true } });
  if (!a) return { content: "Article not found.", summary: "update_draft: not found", isError: true };
  if (a.status !== "draft") return { content: "This article is published — use update_published_article (which needs approval).", summary: "update_draft blocked (published)", isError: true };
  const data: { title?: string; slug?: string; excerpt?: string; content?: string } = {};
  if (typeof input.title === "string" && input.title.trim()) { data.title = input.title.trim().slice(0, 200); data.slug = await uniqueArticleSlug(data.title, id); }
  if (typeof input.excerpt === "string" && input.excerpt.trim()) data.excerpt = input.excerpt.trim();
  if (typeof input.content === "string" && input.content.trim()) data.content = input.content;
  if (Object.keys(data).length === 0) return { content: "No changes provided.", summary: "update_draft (no changes)", isError: true };
  await prisma.article.update({ where: { id }, data });
  return { content: JSON.stringify({ id, updated: Object.keys(data) }), summary: `Updated draft “${data.title ?? a.title}”` };
}

// ── Gated tools (Phase 2) ─────────────────────────────────────────────────────
async function proposePublish(input: Record<string, unknown>, settings: AgentSettings): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing article id.", summary: "publish_article (missing id)", isError: true };
  const a = await prisma.article.findUnique({ where: { id }, select: { id: true, title: true, status: true } });
  if (!a) return { content: "Article not found.", summary: "publish_article: not found", isError: true };
  if (a.status === "published") return { content: `“${a.title}” is already published.`, summary: "publish_article: already live", isError: true };

  // Optional scheduled time (Phnom Penh wall clock the model resolved).
  let scheduledAt: string | undefined;
  let whenLabel = "";
  const whenRaw = typeof input.when === "string" ? input.when.trim() : "";
  if (whenRaw) {
    const iso = localInputToUtcISO(whenRaw.replace(" ", "T").slice(0, 16));
    if (iso && new Date(iso).getTime() > Date.now() + 30_000) {
      scheduledAt = iso;
      whenLabel = formatSchedule(iso);
    }
  }

  const summary = scheduledAt ? `Schedule: ${a.title}` : `Publish: ${a.title}`;
  const detail = scheduledAt ? `Publishes ${whenLabel} (Phnom Penh) — adjust the time below if needed` : "Publishes immediately on approval";
  const params = scheduledAt ? { articleId: a.id, scheduledAt } : { articleId: a.id };
  const res = await gate("publish_article", summary, detail, params, settings);
  // Help the model phrase its reply correctly (proposed, not done).
  if (res.proposedAction && scheduledAt) {
    res.content = `Proposed scheduling "${a.title}" for ${whenLabel} (Phnom Penh). This is NOT scheduled yet — it applies only when the owner approves the card (they can change the time). Do NOT claim it's scheduled.`;
  }
  return res;
}

async function proposeUpdatePublished(input: Record<string, unknown>, settings: AgentSettings): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing article id.", summary: "update_published_article (missing id)", isError: true };
  const a = await prisma.article.findUnique({ where: { id }, select: { id: true, title: true, status: true } });
  if (!a) return { content: "Article not found.", summary: "update_published_article: not found", isError: true };
  if (a.status !== "published") return { content: "That article isn't published — use update_draft for drafts.", summary: "update_published_article: not live", isError: true };
  const changes: Record<string, unknown> = { articleId: a.id };
  const fields: string[] = [];
  if (typeof input.title === "string" && input.title.trim()) { changes.title = input.title.trim(); fields.push("title"); }
  if (typeof input.excerpt === "string" && input.excerpt.trim()) { changes.excerpt = input.excerpt.trim(); fields.push("excerpt"); }
  if (typeof input.content === "string" && input.content.trim()) { changes.content = input.content; fields.push("body"); }
  if (fields.length === 0) return { content: "No changes provided.", summary: "update_published_article (no changes)", isError: true };
  return gate("update_published_article", `Edit live article: ${a.title}`, `Changes: ${fields.join(", ")}`, changes, settings);
}

async function proposeShare(input: Record<string, unknown>, settings: AgentSettings): Promise<ToolResult> {
  const articleId = typeof input.article_id === "string" ? input.article_id : "";
  const pageArg = typeof input.page === "string" ? input.page.trim() : "";
  if (!articleId || !pageArg) return { content: "Need an article_id and a page.", summary: "share_to_facebook (missing args)", isError: true };
  const a = await prisma.article.findUnique({ where: { id: articleId }, select: { id: true, title: true, status: true } });
  if (!a) return { content: "Article not found.", summary: "share_to_facebook: article not found", isError: true };
  if (a.status !== "published") return { content: "Only published articles can be shared — publish it first (which needs approval).", summary: "share_to_facebook: article not published", isError: true };
  const page = await prisma.facebookPage.findFirst({
    where: { OR: [{ id: pageArg }, { pageName: { equals: pageArg, mode: "insensitive" } }, { pageName: { contains: pageArg, mode: "insensitive" } }] },
    select: { id: true, pageName: true, status: true },
  });
  if (!page) return { content: `No connected Page matches “${pageArg}”.`, summary: "share_to_facebook: page not found", isError: true };
  const note = page.status !== "Connected" ? " (page token may be expired)" : "";
  return gate("share_to_facebook", `Share to ${page.pageName}: ${a.title}`, `Article → Facebook Page${note}`, { articleId: a.id, pageDbId: page.id }, settings);
}

async function proposeSetEarnings(input: Record<string, unknown>, settings: AgentSettings): Promise<ToolResult> {
  const entries = Array.isArray(input.entries) ? (input.entries as EarningEntryInput[]) : [];
  if (entries.length === 0) {
    return { content: "No earnings entries were provided. Ask the owner for the page name(s), date(s), and amount(s).", summary: "set_page_earnings (no entries)", isError: true };
  }

  const preview = await buildEarningsPreview(entries);
  const stored = toStoredRows(preview.rows);
  const c = preview.counts;

  // Rows that need the owner to clarify (NEVER silently guessed).
  const needsInput = preview.rows.filter((r) => r.status === "unmatched" || r.status === "ambiguous" || r.status === "invalid");
  const needLines = needsInput.slice(0, 20).map((r) => {
    if (r.status === "ambiguous") return `• “${r.inputPageName}” — could be: ${(r.candidates ?? []).map((x) => x.pageName).join(", ")}`;
    if (r.status === "unmatched") return `• “${r.inputPageName}” — no monitored page matched`;
    return `• “${r.inputPageName}” ${r.inputDate} — ${r.reason ?? "couldn't read this row"}`;
  });

  if (stored.length === 0) {
    return {
      content: `Nothing could be matched, so no save is proposed. These rows need the owner's input — ask them to clarify or pick a page (do NOT guess):\n${needLines.join("\n")}`,
      summary: `set_page_earnings: ${needsInput.length} row(s) need clarification`,
      isError: true,
    };
  }

  const pageCount = new Set(stored.map((r) => r.monitoredPageId)).size;
  const summary = `Set earnings: ${stored.length} value${stored.length === 1 ? "" : "s"} · ${pageCount} page${pageCount === 1 ? "" : "s"}`;
  const detailBits = [`${c.save} new${c.overwrite ? ` · ${c.overwrite} overwrite${c.overwrite === 1 ? "" : "s"}` : ""}`];
  if (needsInput.length) detailBits.push(`${needsInput.length} need${needsInput.length === 1 ? "s" : ""} your input`);
  if (preview.truncated) detailBits.push(`capped to ${MAX_EARNINGS_BATCH} rows`);
  const detail = detailBits.join(" · ");

  // Compact skipped list for the approval card to render (+ the model to relay).
  const skipped = needsInput.slice(0, 40).map((r) => ({
    inputPageName: r.inputPageName,
    inputDate: r.inputDate,
    inputAmount: r.inputAmount,
    status: r.status,
    reason: r.reason,
    candidates: r.candidates?.map((x) => ({ pageName: x.pageName })),
  }));

  const params = { rows: stored, skipped, counts: c, truncated: preview.truncated };
  const res = await gate("set_page_earnings", summary, detail, params, settings);
  if (res.proposedAction) {
    const note = needsInput.length
      ? `\n\nNOT included (need the owner's input — ask them to clarify or pick, don't guess):\n${needLines.join("\n")}`
      : "";
    res.content = `Proposed an earnings update for the owner to approve: ${stored.length} value(s) (${c.save} new${c.overwrite ? `, ${c.overwrite} overwrite` : ""}), across ${pageCount} page(s). It is NOT saved yet — it writes only when the owner clicks Approve on the preview. Do NOT claim it's saved.${note}`;
  }
  return res;
}

async function shareStats(): Promise<ToolResult> {
  const grouped = await prisma.scheduledPost.groupBy({ by: ["status"], _count: { _all: true } });
  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;
  const recent = await prisma.scheduledPost.findMany({
    where: { status: "posted", graphPostId: { not: null } },
    orderBy: { postedAt: "desc" },
    take: 5,
    include: { article: { select: { title: true } }, facebookPage: { select: { pageName: true } } },
  });
  const recentOut = recent.map((r) => ({ article: r.article.title, page: r.facebookPage?.pageName ?? "(page)", when: r.postedAt?.toISOString() ?? null, permalink: r.graphPostId ? permalinkForPost(r.graphPostId) : null }));
  return {
    content: JSON.stringify({ counts, recent: recentOut }),
    summary: `Share stats: ${counts.posted ?? 0} posted · ${counts.failed ?? 0} failed · ${counts.pending ?? 0} pending`,
  };
}
