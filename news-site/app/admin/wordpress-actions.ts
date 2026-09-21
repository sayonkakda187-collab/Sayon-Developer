"use server";

import { requireAdmin } from "@/lib/auth";
import {
  createPost, deletePost, getMedia, getPost, listCategories, listPosts, listTags,
  testConnection, updatePost, wordpressStatus,
} from "@/lib/wordpress/client";
import { markdownToHtml } from "@/lib/wordpress/markdown";
import { draftToEditorFields, trendingToItems } from "@/lib/wordpress/compose";
import { buildWpCaption } from "@/lib/wordpress/share";
import { generateAiAssist, isAiConfigured, AiAssistError } from "@/lib/aiAssist";
import { aggregateTrending, sourceConfigMap } from "@/lib/news/aggregate";
import { NEWS_SOURCES } from "@/lib/news/sources";
import { isValidModel } from "@/lib/aiModels";
import type {
  WpAiDraft, WpComposeStatus, WpConfigStatus, WpContentFormat, WpPage, WpPost,
  WpPostDetail, WpPostInput, WpResult, WpShareInfo, WpStatus, WpTerm, WpTrendingItem, WpUser,
} from "@/lib/wordpress/types";

/**
 * Admin-only entry points for the WordPress integration.
 *
 * Every export re-checks `requireAdmin()` — a server action is a public HTTP
 * endpoint, so the page having been rendered for an admin is not authorisation
 * for the action itself.
 *
 * Input is validated HERE rather than trusted from the form. The browser can
 * post anything to a server action, and `status` in particular goes straight
 * into WordPress: allowing an arbitrary string through would let a crafted
 * request publish when the form said draft.
 */

const STATUSES: WpStatus[] = ["publish", "draft", "pending", "private"];
const MAX_TITLE = 300;
const MAX_CONTENT = 500_000;

function invalid(message: string): WpResult<never> {
  return { ok: false, kind: "invalid", message };
}

function asStatus(v: unknown): WpStatus | null {
  return typeof v === "string" && (STATUSES as string[]).includes(v) ? (v as WpStatus) : null;
}

/** Positive integers only — WordPress term and media IDs are never 0 or negative. */
function asIds(v: unknown): number[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const out: number[] = [];
  for (const raw of v) {
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) return null;
    out.push(n);
  }
  return Array.from(new Set(out));
}

function asPostId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type PostForm = {
  title?: unknown; content?: unknown; status?: unknown; excerpt?: unknown;
  slug?: unknown; categories?: unknown; tags?: unknown; featuredMedia?: unknown;
  /** "markdown" converts `content` before sending; anything else is sent as HTML. */
  format?: unknown;
};

function asFormat(v: unknown): WpContentFormat {
  return v === "markdown" ? "markdown" : "html";
}

/**
 * Converts the content field when the editor was in Markdown mode.
 *
 * Done HERE rather than in the browser for two reasons: the conversion pipeline
 * stays out of the client bundle, and the format is re-derived from the
 * submitted value instead of trusting the client to have converted correctly.
 */
async function renderContent(
  data: Partial<WpPostInput>, format: WpContentFormat,
): Promise<Partial<WpPostInput>> {
  if (format !== "markdown" || data.content === undefined) return data;
  return { ...data, content: await markdownToHtml(data.content) };
}

function validate(form: PostForm, { partial = false } = {}): WpResult<Partial<WpPostInput>> {
  const out: Partial<WpPostInput> = {};

  if (form.title !== undefined || !partial) {
    const title = typeof form.title === "string" ? form.title.trim() : "";
    if (!title) return invalid("A title is required.");
    if (title.length > MAX_TITLE) return invalid(`The title is too long (${title.length}/${MAX_TITLE}).`);
    out.title = title;
  }
  if (form.content !== undefined || !partial) {
    const content = typeof form.content === "string" ? form.content : "";
    if (content.length > MAX_CONTENT) return invalid("The content is too long to send in one request.");
    out.content = content;
  }
  if (form.status !== undefined || !partial) {
    const status = asStatus(form.status);
    if (!status) return invalid(`Status must be one of: ${STATUSES.join(", ")}.`);
    out.status = status;
  }
  if (form.excerpt !== undefined) out.excerpt = String(form.excerpt ?? "");
  if (form.slug !== undefined) out.slug = String(form.slug ?? "").trim();

  if (form.categories !== undefined) {
    const ids = asIds(form.categories);
    if (!ids) return invalid("Categories must be WordPress category IDs.");
    out.categories = ids;
  }
  if (form.tags !== undefined) {
    const ids = asIds(form.tags);
    if (!ids) return invalid("Tags must be WordPress tag IDs.");
    out.tags = ids;
  }
  if (form.featuredMedia !== undefined) {
    if (form.featuredMedia === null || form.featuredMedia === "") out.featuredMedia = null;
    else {
      const n = Number(form.featuredMedia);
      if (!Number.isInteger(n) || n < 0) return invalid("Featured media must be a WordPress media ID.");
      out.featuredMedia = n === 0 ? null : n;
    }
  }
  return { ok: true, data: out };
}

/** Whether the env vars are set. Returns the site URL, never the credentials. */
export async function getWordPressStatus(): Promise<WpConfigStatus> {
  await requireAdmin();
  return wordpressStatus();
}

/** Checks the credentials against WordPress and reports the account + its caps. */
export async function testWordPressConnection(): Promise<WpResult<WpUser>> {
  await requireAdmin();
  return testConnection();
}

export async function fetchWordPressPosts(opts: {
  status?: string; page?: number; perPage?: number; search?: string;
} = {}): Promise<WpResult<WpPage<WpPost>>> {
  await requireAdmin();
  const status = opts.status === "any" ? "any" : asStatus(opts.status) ?? "any";
  return listPosts({
    status,
    page: Number(opts.page) || 1,
    perPage: Number(opts.perPage) || 10,
    search: typeof opts.search === "string" ? opts.search : undefined,
  });
}

export async function fetchWordPressPost(id: unknown): Promise<WpResult<WpPostDetail>> {
  await requireAdmin();
  const postId = asPostId(id);
  if (!postId) return invalid("That is not a valid post id.");
  return getPost(postId);
}

export async function createWordPressPost(form: PostForm): Promise<WpResult<WpPost>> {
  await requireAdmin();
  const checked = validate(form);
  if (!checked.ok) return checked;
  const body = await renderContent(checked.data, asFormat(form.format));
  return createPost(body as WpPostInput);
}

export async function updateWordPressPost(id: unknown, form: PostForm): Promise<WpResult<WpPost>> {
  await requireAdmin();
  const postId = asPostId(id);
  if (!postId) return invalid("That is not a valid post id.");
  const checked = validate(form, { partial: true });
  if (!checked.ok) return checked;
  if (Object.keys(checked.data).length === 0) return invalid("Nothing to update.");
  const body = await renderContent(checked.data, asFormat(form.format));
  return updatePost(postId, body);
}

/** Trashes by default. `force` deletes permanently and cannot be undone. */
export async function deleteWordPressPost(id: unknown, force = false): Promise<WpResult<{ id: number; trashed: boolean }>> {
  await requireAdmin();
  const postId = asPostId(id);
  if (!postId) return invalid("That is not a valid post id.");
  return deletePost(postId, { force: force === true });
}

export async function fetchWordPressTaxonomies(): Promise<
  WpResult<{ categories: WpTerm[]; tags: WpTerm[] }>
> {
  await requireAdmin();
  const [cats, tags] = await Promise.all([listCategories(), listTags()]);
  // One failing taxonomy should not blank the whole form; report it instead.
  if (!cats.ok) return cats;
  if (!tags.ok) return tags;
  return { ok: true, data: { categories: cats.data, tags: tags.data } };
}

/**
 * Renders Markdown to the HTML that WordPress would receive, for the editor's
 * preview. Admin-only like everything else here; it touches no credentials and
 * makes no request to WordPress.
 */
export async function previewWordPressMarkdown(markdown: unknown): Promise<WpResult<string>> {
  await requireAdmin();
  if (typeof markdown !== "string") return invalid("Nothing to preview.");
  if (markdown.length > MAX_CONTENT) return invalid("That content is too long to preview.");
  return { ok: true, data: await markdownToHtml(markdown) };
}

// ── composing a post: trending headlines + AI drafting ───────────────────────
//
// These reuse the pipelines that already power /admin/trending and the article
// editor's AI Assist — the same keys, the same prompts, the same originality
// guardrails. Nothing new talks to an external service; this only makes the two
// reachable from the WordPress panel so a story can go from headline to
// published post without leaving it.

/** Which of the two pipelines have keys. Neither value is a key. */
export async function getWordPressComposeStatus(): Promise<WpComposeStatus> {
  await requireAdmin();
  const configured = sourceConfigMap();
  return {
    aiConfigured: isAiConfigured(),
    newsConfigured: NEWS_SOURCES.some((s) => configured[s.id]),
  };
}

export async function fetchWordPressTrending(opts: {
  category?: unknown; query?: unknown; page?: unknown;
} = {}): Promise<WpResult<WpTrendingItem[]>> {
  await requireAdmin();

  const configured = sourceConfigMap();
  const enabled = NEWS_SOURCES.filter((s) => configured[s.id]).map((s) => s.id);
  if (enabled.length === 0) {
    return {
      ok: false, kind: "not_configured",
      message:
        "No news source is set up. Add at least one free key (GNEWS_API_KEY, " +
        "NEWSDATA_API_KEY, THENEWSAPI_KEY or CURRENTSAPI_KEY) and redeploy.",
    };
  }

  const page = Math.max(1, Math.floor(Number(opts.page) || 1));
  try {
    const result = await aggregateTrending({
      enabled,
      query: {
        query: typeof opts.query === "string" ? opts.query.trim() : "",
        category: typeof opts.category === "string" && opts.category ? opts.category : "general",
        lang: "en", country: "us", page,
      },
    });
    const items = trendingToItems(result.items);
    if (items.length === 0) {
      // Every source can be configured and still return nothing — a rate limit,
      // an outage, or simply no match. Say which, rather than an empty list.
      const failed = result.sources.filter((s) => !s.ok);
      return {
        ok: false, kind: "invalid",
        message: failed.length
          ? `No headlines came back. ${failed.map((f) => `${f.label}: ${f.note ?? "failed"}`).join("; ")}`
          : "No headlines matched. Try another category or search term.",
      };
    }
    return { ok: true, data: items };
  } catch (e) {
    return {
      ok: false, kind: "network",
      message: e instanceof Error ? e.message : "Could not reach the news sources.",
    };
  }
}

/**
 * Drafts an article with the SAME pipeline the article editor uses, including
 * its originality guardrails: the model is given only the headline and topic,
 * never scraped source text, and is instructed to write from general knowledge.
 */
export async function draftWordPressArticle(input: {
  headline?: unknown; topic?: unknown; model?: unknown;
}): Promise<WpResult<WpAiDraft>> {
  await requireAdmin();

  const headline = typeof input.headline === "string" ? input.headline.trim() : "";
  if (!headline) return invalid("Give the AI a headline or topic to write about.");
  if (headline.length > 300) return invalid("That headline is too long.");
  if (!isAiConfigured()) {
    return {
      ok: false, kind: "not_configured",
      message: "AI drafting needs ANTHROPIC_API_KEY set in your environment, then a redeploy.",
    };
  }

  const topic = typeof input.topic === "string" ? input.topic.trim() : "";
  const model = isValidModel(input.model) ? input.model : undefined;

  try {
    const result = await generateAiAssist({ headline, topic, model });
    const fields = draftToEditorFields(result, headline);
    if (!fields.content) return invalid("The AI returned an empty draft. Try again.");
    return { ok: true, data: fields };
  } catch (e) {
    if (e instanceof AiAssistError) {
      // Reuse the same kinds the WordPress errors use so the UI needs one path.
      const kind = e.code === "auth" ? "unauthorized"
        : e.code === "quota" ? "rate_limited"
        : e.code === "network" ? "network" : "invalid";
      return { ok: false, kind, message: e.message };
    }
    return { ok: false, kind: "invalid", message: e instanceof Error ? e.message : "Drafting failed." };
  }
}

/**
 * Everything the share panel needs for one published post.
 *
 * Only PUBLISHED posts have a working public link, so a draft is refused with
 * a hint rather than handing back a URL that 404s for every reader — the same
 * rule the article Share panel applies.
 *
 * The featured image is looked up BEST-EFFORT: a post's `featured_media` is
 * just a number, and turning it into a URL is a second request that can fail on
 * its own (a deleted attachment, an account without access to it). When it
 * does, the panel simply shows no cover — losing the thumbnail should never
 * cost you the link and caption you actually came for.
 */
export async function getWordPressShareInfo(postId: unknown): Promise<WpResult<WpShareInfo>> {
  await requireAdmin();
  const id = Number(postId);
  if (!Number.isInteger(id) || id <= 0) return invalid("Which post? A valid post id is required.");

  const res = await getPost(id);
  if (!res.ok) return res;
  const post = res.data;

  if (post.status !== "publish") {
    return invalid(
      post.status === "private"
        ? "This post is private, so it has no public link to share yet."
        : `This post is a ${post.status}. Publish it first to get its public link.`,
    );
  }
  if (!post.link) return invalid("WordPress did not return a public link for this post.");

  let image: string | null = null;
  if (post.featuredMedia) {
    const media = await getMedia(post.featuredMedia);
    if (media.ok && media.data.url) image = media.data.url;
  }

  return {
    ok: true,
    data: {
      id: post.id,
      title: post.title,
      url: post.link,
      image,
      caption: buildWpCaption(post.title, post.excerptRaw, post.link),
    },
  };
}
