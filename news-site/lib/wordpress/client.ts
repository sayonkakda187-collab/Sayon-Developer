import "server-only";

import type {
  WpConfigStatus, WpFailure, WpPage, WpPost, WpPostDetail, WpPostInput,
  WpMedia, WpResult, WpStatus, WpTerm, WpUser,
} from "./types";
import { describeError, normalizeBaseUrl, plain } from "./format";

export { describeError, normalizeBaseUrl } from "./format";

/**
 * WordPress REST client, using Application Passwords over HTTP Basic auth.
 *
 * `server-only` is load-bearing: the module reads WP_USERNAME and
 * WP_APPLICATION_PASSWORD, so importing it from a client component must fail the
 * build rather than ship credentials to a browser. Nothing here ever returns the
 * username or password — not in a value, not in an error message.
 *
 * Env:
 *   WP_URL                    https://example.com   (with or without /wp-json)
 *   WP_USERNAME               the account's LOGIN name, not its display name
 *   WP_APPLICATION_PASSWORD   from Users → Profile → Application Passwords
 */

const TIMEOUT_MS = 15_000;
/** Uploads carry a file body, so they get longer than a JSON round trip. */
const UPLOAD_TIMEOUT_MS = 45_000;
const DEFAULT_PER_PAGE = 10;

// ── configuration ────────────────────────────────────────────────────────────

type Config = { baseUrl: string; username: string; password: string };

function readConfig(): Config | null {
  const baseUrl = normalizeBaseUrl(process.env.WP_URL ?? "");
  const username = (process.env.WP_USERNAME ?? "").trim();
  const password = (process.env.WP_APPLICATION_PASSWORD ?? "").trim();
  if (!baseUrl || !username || !password) return null;
  return { baseUrl, username, password };
}

/** Whether the integration can run, and which env vars are missing if not.
 *  Safe to return to the browser: it exposes the site URL, never the login. */
export function wordpressStatus(): WpConfigStatus {
  const baseUrl = normalizeBaseUrl(process.env.WP_URL ?? "");
  const missing: string[] = [];
  if (!baseUrl) missing.push("WP_URL");
  if (!(process.env.WP_USERNAME ?? "").trim()) missing.push("WP_USERNAME");
  if (!(process.env.WP_APPLICATION_PASSWORD ?? "").trim()) missing.push("WP_APPLICATION_PASSWORD");
  return { configured: missing.length === 0, missing, baseUrl };
}

function authHeader(c: Config): string {
  // WordPress displays application passwords in spaced groups and strips the
  // spaces before comparing, so either form authenticates. Sent as given.
  return `Basic ${Buffer.from(`${c.username}:${c.password}`, "utf8").toString("base64")}`;
}

// ── transport ────────────────────────────────────────────────────────────────

const NOT_CONFIGURED: WpFailure = {
  ok: false,
  kind: "not_configured",
  message:
    "WordPress is not connected. Set WP_URL, WP_USERNAME and WP_APPLICATION_PASSWORD, then redeploy.",
};

type FetchOptions = {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  params?: Record<string, string | number | undefined>;
};

async function wpFetch<T>(
  path: string,
  opts: FetchOptions = {},
): Promise<WpResult<{ data: T; headers: Headers }>> {
  const config = readConfig();
  if (!config) return NOT_CONFIGURED;

  const url = new URL(`${config.baseUrl}/wp-json/wp/v2${path}`);
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: opts.method ?? "GET",
      headers: {
        Authorization: authHeader(config),
        Accept: "application/json",
        ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      kind: "network",
      message: aborted
        ? `WordPress did not respond within ${TIMEOUT_MS / 1000}s at ${config.baseUrl}.`
        : `Could not reach ${config.baseUrl}. Check WP_URL and that the site is online.`,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  // A security plugin, WAF or login wall answers with an HTML page rather than
  // the REST error shape. Saying "unexpected token <" helps nobody.
  if (!contentType.includes("json")) {
    if (response.ok) {
      return {
        ok: false, kind: "not_json", status: response.status,
        message:
          `WordPress returned ${contentType || "a non-JSON response"} instead of JSON. That is ` +
          `usually a security plugin, WAF or caching layer intercepting /wp-json.`,
      };
    }
    return describeError(response.status, null, config.baseUrl);
  }

  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    return {
      ok: false, kind: "not_json", status: response.status,
      message: "WordPress sent a malformed JSON response.",
    };
  }

  if (!response.ok) {
    return describeError(response.status, parsed as { code?: string; message?: string }, config.baseUrl);
  }
  return { ok: true, data: { data: parsed as T, headers: response.headers } };
}

// ── mapping ──────────────────────────────────────────────────────────────────

type RawPost = {
  id: number;
  status: string;
  link: string;
  date_gmt: string | null;
  modified_gmt: string | null;
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  title?: { rendered?: string; raw?: string };
  content?: { rendered?: string; raw?: string };
  excerpt?: { rendered?: string; raw?: string };
  slug?: string;
};

function toPost(r: RawPost): WpPost {
  return {
    id: r.id,
    title: plain(r.title?.raw ?? r.title?.rendered ?? "") || "(no title)",
    status: r.status,
    link: r.link,
    date: r.date_gmt ? `${r.date_gmt}Z` : null,
    modified: r.modified_gmt ? `${r.modified_gmt}Z` : null,
    categories: r.categories ?? [],
    tags: r.tags ?? [],
    featuredMedia: r.featured_media && r.featured_media > 0 ? r.featured_media : null,
  };
}

function toBody(input: Partial<WpPostInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) body.title = input.title;
  if (input.content !== undefined) body.content = input.content;
  if (input.status !== undefined) body.status = input.status;
  if (input.excerpt !== undefined) body.excerpt = input.excerpt;
  if (input.slug !== undefined) body.slug = input.slug;
  if (input.categories !== undefined) body.categories = input.categories;
  if (input.tags !== undefined) body.tags = input.tags;
  // 0 is how WordPress represents "no featured image"; null would be rejected.
  if (input.featuredMedia !== undefined) body.featured_media = input.featuredMedia ?? 0;
  return body;
}

// ── operations ───────────────────────────────────────────────────────────────

/** Verifies the credentials and reports who they belong to and what they may do. */
export async function testConnection(): Promise<WpResult<WpUser>> {
  const res = await wpFetch<{ id: number; name: string; slug: string; capabilities?: Record<string, boolean> }>(
    "/users/me", { params: { context: "edit" } },
  );
  if (!res.ok) return res;
  const u = res.data.data;
  return {
    ok: true,
    data: {
      id: u.id, name: u.name, slug: u.slug,
      capabilities: Object.entries(u.capabilities ?? {}).filter(([, on]) => on).map(([k]) => k),
    },
  };
}

export async function listPosts(opts: {
  status?: WpStatus | "any";
  page?: number;
  perPage?: number;
  search?: string;
} = {}): Promise<WpResult<WpPage<WpPost>>> {
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const perPage = Math.min(100, Math.max(1, Math.floor(opts.perPage ?? DEFAULT_PER_PAGE)));
  const res = await wpFetch<RawPost[]>("/posts", {
    params: {
      // context=edit so drafts and private posts are included and titles come
      // back raw; it also means the call fails loudly if the user lacks edit
      // rights, rather than silently returning only published posts.
      context: "edit",
      status: opts.status && opts.status !== "any" ? opts.status : "publish,draft,pending,private",
      page, per_page: perPage,
      search: opts.search?.trim() || undefined,
      orderby: "modified", order: "desc",
    },
  });
  if (!res.ok) return res;
  const { data, headers } = res.data;
  return {
    ok: true,
    data: {
      items: (data ?? []).map(toPost),
      page, perPage,
      total: Number(headers.get("x-wp-total") ?? data?.length ?? 0),
      totalPages: Number(headers.get("x-wp-totalpages") ?? 1),
    },
  };
}

/** One post with its RAW title and content, for loading into the editor. */
export async function getPost(id: number): Promise<WpResult<WpPostDetail>> {
  const res = await wpFetch<RawPost>(`/posts/${id}`, { params: { context: "edit" } });
  if (!res.ok) return res;
  const r = res.data.data;
  return {
    ok: true,
    data: {
      ...toPost(r),
      title: r.title?.raw ?? plain(r.title?.rendered ?? ""),
      contentRaw: r.content?.raw ?? "",
      excerptRaw: r.excerpt?.raw ?? "",
      slug: r.slug ?? "",
    },
  };
}

export async function createPost(input: WpPostInput): Promise<WpResult<WpPost>> {
  const res = await wpFetch<RawPost>("/posts", { method: "POST", body: toBody(input) });
  return res.ok ? { ok: true, data: toPost(res.data.data) } : res;
}

export async function updatePost(id: number, patch: Partial<WpPostInput>): Promise<WpResult<WpPost>> {
  // WordPress accepts POST for updates on every version that has the REST API;
  // PUT/PATCH work too but are more often blocked by hosts and WAFs.
  const res = await wpFetch<RawPost>(`/posts/${id}`, { method: "POST", body: toBody(patch) });
  return res.ok ? { ok: true, data: toPost(res.data.data) } : res;
}

/**
 * Trashes a post by default. WordPress only deletes permanently with
 * `force=true`, and that is irreversible, so it has to be asked for.
 */
export async function deletePost(id: number, opts: { force?: boolean } = {}): Promise<WpResult<{ id: number; trashed: boolean }>> {
  const res = await wpFetch<{ deleted?: boolean; previous?: RawPost; id?: number }>(
    `/posts/${id}`, { method: "DELETE", params: opts.force ? { force: "true" } : undefined },
  );
  if (!res.ok) return res;
  return { ok: true, data: { id, trashed: !opts.force } };
}

async function listTerms(kind: "categories" | "tags"): Promise<WpResult<WpTerm[]>> {
  const res = await wpFetch<{ id: number; name: string; count: number }[]>(`/${kind}`, {
    params: { per_page: 100, orderby: "count", order: "desc" },
  });
  if (!res.ok) return res;
  return { ok: true, data: (res.data.data ?? []).map((t) => ({ id: t.id, name: plain(t.name), count: t.count })) };
}

export const listCategories = () => listTerms("categories");
export const listTags = () => listTerms("tags");

// ── media ────────────────────────────────────────────────────────────────────

/**
 * Uploads an image to the WordPress media library and returns its attachment.
 *
 * This is what makes a featured image possible: `featured_media` takes a
 * WordPress ATTACHMENT ID, so the bytes have to live in WordPress. Uploading to
 * Vercel Blob (as the local article editor does) would produce a URL WordPress
 * has no id for.
 *
 * Sent as a RAW body with `Content-Disposition`, which is the documented shape
 * for this endpoint and the one most widely accepted — multipart also works on
 * core but is more often mangled by security plugins and reverse proxies.
 */
export async function uploadMedia(input: {
  data: ArrayBuffer | Uint8Array;
  filename: string;
  contentType: string;
}): Promise<WpResult<WpMedia>> {
  const config = readConfig();
  if (!config) return NOT_CONFIGURED;

  // Keep the extension but strip anything that could break the header or be
  // read as a path. WordPress derives the attachment slug from this.
  const safeName =
    input.filename.replace(/[^\w.-]+/g, "-").replace(/^[-.]+/, "").slice(0, 120) || "upload.jpg";

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: authHeader(config),
        Accept: "application/json",
        "Content-Type": input.contentType,
        "Content-Disposition": `attachment; filename="${safeName}"`,
      },
      body: input.data as BodyInit,
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false, kind: "network",
      message: aborted
        ? `The upload did not finish within ${UPLOAD_TIMEOUT_MS / 1000}s. Try a smaller image.`
        : `Could not reach ${config.baseUrl} to upload the image.`,
    };
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  const contentTypeHeader = response.headers.get("content-type") ?? "";
  if (!contentTypeHeader.includes("json")) {
    return {
      ok: false, kind: "not_json", status: response.status,
      message:
        `WordPress answered the upload with ${contentTypeHeader || "a non-JSON response"}. ` +
        `That is usually a security plugin, an upload size limit at the server, or mod_security.`,
    };
  }

  let parsed: unknown = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {
    return { ok: false, kind: "not_json", status: response.status, message: "WordPress sent a malformed upload response." };
  }

  if (!response.ok) {
    const failure = describeError(response.status, parsed as { code?: string; message?: string }, config.baseUrl);
    // The generic 403 advice is about posts; for uploads the missing capability
    // is upload_files, which Contributor does not have.
    if (failure.status === 403) {
      return { ...failure, message: `WordPress refused the upload (403). The account needs the upload_files capability — Author or above; a Contributor cannot upload media.` };
    }
    return failure;
  }

  const m = parsed as {
    id: number; source_url?: string; mime_type?: string;
    title?: { rendered?: string }; media_details?: { width?: number; height?: number };
  };
  return {
    ok: true,
    data: {
      id: m.id,
      url: m.source_url ?? "",
      title: plain(m.title?.rendered ?? safeName),
      mimeType: m.mime_type ?? input.contentType,
      width: m.media_details?.width ?? null,
      height: m.media_details?.height ?? null,
    },
  };
}

/**
 * One media item, by attachment id — used to turn a post's `featured_media`
 * number into a URL the share panel can show.
 *
 * `context: "edit"` is deliberately NOT sent: reading an attachment only needs
 * the default context, and asking for edit would make this fail for an account
 * that can publish but not edit that particular attachment.
 */
export async function getMedia(id: number): Promise<WpResult<WpMedia>> {
  const res = await wpFetch<{
    id: number; source_url?: string; mime_type?: string;
    title?: { rendered?: string }; media_details?: { width?: number; height?: number };
  }>(`/media/${id}`);
  if (!res.ok) return res;
  const m = res.data.data;
  return {
    ok: true,
    data: {
      id: m.id,
      url: m.source_url ?? "",
      title: plain(m.title?.rendered ?? ""),
      mimeType: m.mime_type ?? "",
      width: m.media_details?.width ?? null,
      height: m.media_details?.height ?? null,
    },
  };
}
