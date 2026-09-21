"use server";

import { requireAdmin } from "@/lib/auth";
import {
  createPost, deletePost, getPost, listCategories, listPosts, listTags,
  testConnection, updatePost, wordpressStatus,
} from "@/lib/wordpress/client";
import type {
  WpConfigStatus, WpPage, WpPost, WpPostDetail, WpPostInput, WpResult,
  WpStatus, WpTerm, WpUser,
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
};

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
  return createPost(checked.data as WpPostInput);
}

export async function updateWordPressPost(id: unknown, form: PostForm): Promise<WpResult<WpPost>> {
  await requireAdmin();
  const postId = asPostId(id);
  if (!postId) return invalid("That is not a valid post id.");
  const checked = validate(form, { partial: true });
  if (!checked.ok) return checked;
  if (Object.keys(checked.data).length === 0) return invalid("Nothing to update.");
  return updatePost(postId, checked.data);
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
