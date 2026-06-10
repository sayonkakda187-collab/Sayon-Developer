import "server-only";

import { prisma } from "@/lib/db";
import { slugify, uniqueArticleSlug } from "@/lib/slug";
import { getActiveSiteId } from "@/lib/sites";
import { aggregateTrending, isSourceConfigured } from "@/lib/news/aggregate";
import { NEWS_SOURCE_IDS } from "@/lib/news/sources";
import { generateAiAssist } from "@/lib/aiAssist";
import type { AnthropicTool } from "./anthropic";

// Phase 1 tools: read articles + news, and create/edit DRAFTS. None of these
// touch the public site (no publish, no live-edit, no Facebook) — those are
// gated, approval-only actions added in Phase 2.

export type ToolResult = {
  /** JSON/text fed back to the model as the tool_result. */
  content: string;
  /** Short human log line shown in the chat ("🔧 …"). */
  summary: string;
  isError?: boolean;
};

export const PHASE1_TOOLS: AnthropicTool[] = [
  {
    name: "list_articles",
    description:
      "List the site's articles (newest first). Filter by status ('draft', 'published', or 'all') and an optional case-insensitive title search. Returns id, title, status, category, excerpt, updated time.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["draft", "published", "all"], description: "Default 'all'." },
        query: { type: "string", description: "Optional title search." },
      },
    },
  },
  {
    name: "get_article",
    description: "Get one article's full details by id (title, status, excerpt, body, category, slug).",
    input_schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
  },
  {
    name: "search_news",
    description:
      "Search trending real-world news through the site's news providers (results are cached; the free tiers have small daily quotas, so search sparingly). Provide a category OR a keyword. Returns headlines with source + url to research and attribute.",
    input_schema: {
      type: "object",
      properties: {
        category: { type: "string", description: "general, world, business, technology, sports, etc." },
        keyword: { type: "string", description: "Free-text topic to search for." },
      },
    },
  },
  {
    name: "create_draft",
    description:
      "Write a NEW ORIGINAL article in the site's own words about a topic or a found news item, and save it as a DRAFT (never published). ALWAYS pass source_url when basing it on a news item, so a source link is attributed. Returns the new draft id + edit URL.",
    input_schema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "The headline/topic to write about." },
        source_url: { type: "string", description: "URL of the news item it's based on (for attribution)." },
        source_title: { type: "string", description: "Name of the source outlet." },
        category: { type: "string", description: "One of the site's categories (optional)." },
      },
      required: ["topic"],
    },
  },
  {
    name: "update_draft",
    description:
      "Edit an existing DRAFT's title, excerpt (SEO meta), or body (markdown). Only drafts can be edited — editing a published/live article is NOT allowed in this phase. Returns what changed.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        excerpt: { type: "string", description: "SEO meta / summary." },
        content: { type: "string", description: "Full replacement markdown body." },
      },
      required: ["id"],
    },
  },
];

/** Dispatch a single tool call. `model` is reused for the create_draft AI call. */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  model?: string,
): Promise<ToolResult> {
  switch (name) {
    case "list_articles":
      return listArticles(input);
    case "get_article":
      return getArticle(input);
    case "search_news":
      return searchNews(input);
    case "create_draft":
      return createDraft(input, model);
    case "update_draft":
      return updateDraft(input);
    default:
      return { content: `Unknown tool: ${name}`, summary: `Unknown tool ${name}`, isError: true };
  }
}

async function listArticles(input: Record<string, unknown>): Promise<ToolResult> {
  const status = input.status === "draft" || input.status === "published" ? input.status : undefined;
  const query = typeof input.query === "string" ? input.query.trim() : "";
  const rows = await prisma.article.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(query ? { title: { contains: query, mode: "insensitive" } } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: { id: true, title: true, status: true, excerpt: true, updatedAt: true, category: { select: { name: true } } },
  });
  const articles = rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    category: r.category?.name ?? null,
    excerpt: r.excerpt,
    updated: r.updatedAt.toISOString(),
  }));
  const label = status ?? "all";
  return {
    content: JSON.stringify({ count: articles.length, articles }),
    summary: `Listed ${articles.length} ${label} article${articles.length === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}`,
  };
}

async function getArticle(input: Record<string, unknown>): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing id.", summary: "get_article (missing id)", isError: true };
  const a = await prisma.article.findUnique({
    where: { id },
    select: { id: true, title: true, status: true, excerpt: true, content: true, slug: true, category: { select: { name: true } } },
  });
  if (!a) return { content: "Article not found.", summary: "get_article: not found", isError: true };
  // Cap the body so a long article can't blow the token budget.
  const content = a.content.length > 6000 ? `${a.content.slice(0, 6000)}\n…(truncated)` : a.content;
  return {
    content: JSON.stringify({ ...a, category: a.category?.name ?? null, content }),
    summary: `Read “${a.title}”`,
  };
}

async function searchNews(input: Record<string, unknown>): Promise<ToolResult> {
  const category = typeof input.category === "string" ? input.category.trim() : "";
  const keyword = typeof input.keyword === "string" ? input.keyword.trim() : "";
  const enabled = NEWS_SOURCE_IDS.filter(isSourceConfigured);
  if (enabled.length === 0) {
    return { content: "No news sources are configured (no API keys set). Tell the owner to add a key on the Trending page.", summary: "search_news: no sources configured", isError: true };
  }
  const result = await aggregateTrending({
    enabled,
    query: { category: category || "general", query: keyword, lang: "en", country: "us", page: 1 },
  });
  const items = result.items.slice(0, 8).map((i) => ({
    title: i.title,
    source: i.source,
    url: i.url,
    publishedAt: i.publishedAt,
    description: i.description ? i.description.slice(0, 220) : "",
  }));
  const label = keyword ? `“${keyword}”` : category || "general";
  return {
    content: JSON.stringify({ count: items.length, cached: result.cached, items }),
    summary: `Searched news: ${label}${result.cached ? " (cached)" : ""} — ${items.length} hit${items.length === 1 ? "" : "s"}`,
  };
}

async function createDraft(input: Record<string, unknown>, model?: string): Promise<ToolResult> {
  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  if (!topic) return { content: "A topic is required.", summary: "create_draft (missing topic)", isError: true };
  const sourceUrl = typeof input.source_url === "string" && /^https?:\/\//i.test(input.source_url) ? input.source_url : "";
  const sourceTitle = typeof input.source_title === "string" ? input.source_title.trim() : "";
  const categoryName = typeof input.category === "string" ? input.category.trim() : "";

  // ORIGINAL draft via the existing headline-only pipeline (no scraped source text).
  const ai = await generateAiAssist({ headline: topic, topic: categoryName || undefined, model });
  const title = (ai.headlines[0] || topic).slice(0, 200);

  let content = ai.draft;
  if (sourceUrl) {
    let host = sourceUrl;
    try {
      host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    } catch {
      /* keep raw */
    }
    content += `\n\n---\n\n*Source: [${sourceTitle || host}](${sourceUrl})*`;
  }

  let categoryId: string | null = null;
  if (categoryName) {
    const cat = await prisma.category.findFirst({
      where: { OR: [{ name: { equals: categoryName, mode: "insensitive" } }, { slug: slugify(categoryName) }] },
      select: { id: true },
    });
    categoryId = cat?.id ?? null;
  }

  const slug = await uniqueArticleSlug(title);
  const siteId = await getActiveSiteId();
  const created = await prisma.article.create({
    data: { title, slug, excerpt: ai.excerpt, content, status: "draft", categoryId, siteId },
    select: { id: true },
  });
  return {
    content: JSON.stringify({ id: created.id, title, status: "draft", excerpt: ai.excerpt, editUrl: `/admin/articles/${created.id}/edit` }),
    summary: `Drafted “${title}”`,
  };
}

async function updateDraft(input: Record<string, unknown>): Promise<ToolResult> {
  const id = typeof input.id === "string" ? input.id : "";
  if (!id) return { content: "Missing id.", summary: "update_draft (missing id)", isError: true };
  const a = await prisma.article.findUnique({ where: { id }, select: { id: true, status: true, title: true } });
  if (!a) return { content: "Article not found.", summary: "update_draft: not found", isError: true };
  if (a.status !== "draft") {
    return {
      content: "This article is already published. Editing a live article requires an approval action, which isn't available in this phase.",
      summary: "update_draft blocked (article is published)",
      isError: true,
    };
  }

  const data: { title?: string; slug?: string; excerpt?: string; content?: string } = {};
  if (typeof input.title === "string" && input.title.trim()) {
    data.title = input.title.trim().slice(0, 200);
    data.slug = await uniqueArticleSlug(data.title, id);
  }
  if (typeof input.excerpt === "string" && input.excerpt.trim()) data.excerpt = input.excerpt.trim();
  if (typeof input.content === "string" && input.content.trim()) data.content = input.content;
  if (Object.keys(data).length === 0) {
    return { content: "No changes were provided.", summary: "update_draft (no changes)", isError: true };
  }

  await prisma.article.update({ where: { id }, data });
  return {
    content: JSON.stringify({ id, updated: Object.keys(data) }),
    summary: `Updated draft “${data.title ?? a.title}” (${Object.keys(data).join(", ")})`,
  };
}
