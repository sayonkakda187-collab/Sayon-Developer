/**
 * Facebook Graph API wrapper — OFFICIAL API ONLY.
 *
 * Every function here makes plain HTTPS calls to graph.facebook.com using a
 * Page access token. There is no scraping, headless browser, or login
 * simulation anywhere in this module (or this codebase). All calls are made
 * server-side; tokens are decrypted by the caller and never sent to the browser.
 *
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 */

// Pin a Graph API version (override via env if you upgrade). Facebook versions
// are stable for ~2 years; pinning avoids surprise breaking changes.
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v21.0";
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** Shape of a Graph API error envelope (the bits we care about). */
type GraphError = {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
};

/** A categorized failure from a Graph call — `expired` drives status updates. */
export class FacebookApiError extends Error {
  /** True when the token is invalid/expired/revoked (Graph codes 190/102/463…). */
  readonly expired: boolean;
  /** True when Facebook is rate-limiting us (codes 4/17/32/341/613 or HTTP 429). */
  readonly rateLimited: boolean;
  readonly code?: number;
  readonly subcode?: number;

  constructor(
    message: string,
    opts: { expired?: boolean; rateLimited?: boolean; code?: number; subcode?: number } = {},
  ) {
    super(message);
    this.name = "FacebookApiError";
    this.expired = opts.expired ?? false;
    this.rateLimited = opts.rateLimited ?? false;
    this.code = opts.code;
    this.subcode = opts.subcode;
  }
}

/** Graph error codes that mean "this token can no longer be used." */
const TOKEN_INVALID_CODES = new Set([190, 102, 463, 467, 2500]);

/** Graph error codes that mean "you're being throttled / temporarily blocked." */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);

function toFriendlyError(
  err: GraphError | undefined,
  fallback: string,
  httpStatus?: number,
): FacebookApiError {
  const code = err?.code;
  const expired = code != null && TOKEN_INVALID_CODES.has(code);
  const rateLimited = httpStatus === 429 || (code != null && RATE_LIMIT_CODES.has(code));
  const base = err?.message?.trim() || fallback;
  const message = expired
    ? `${base} (the Page access token is invalid or expired — reconnect the page).`
    : rateLimited
      ? `${base} (Facebook rate limit reached — wait a few minutes before trying again).`
      : base;
  return new FacebookApiError(message, { expired, rateLimited, code, subcode: err?.error_subcode });
}

/** Parse a Graph response, throwing a categorized error on failure. */
async function parseGraph<T>(res: Response, fallback: string): Promise<T> {
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    // Non-JSON body (rare) — fall through to a generic error.
  }
  if (!res.ok || (json as { error?: GraphError })?.error) {
    const err = (json as { error?: GraphError })?.error;
    throw toFriendlyError(err, `${fallback} (HTTP ${res.status}).`, res.status);
  }
  return json as T;
}

// A short timeout so a hung Graph call can't wedge a request/cron run.
async function graphFetch(url: string, init: RequestInit, timeoutMs = 15000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new FacebookApiError("Facebook did not respond in time. Try again.");
    }
    throw new FacebookApiError("Could not reach Facebook. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Validate a Page access token and confirm it controls the given page id.
 * Calls GET /{pageId}?fields=id,name and checks the returned id matches.
 * Returns the page's current name on success; throws FacebookApiError otherwise.
 */
export async function validatePageToken(
  pageId: string,
  accessToken: string,
): Promise<{ id: string; name: string }> {
  const url = `${GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=id,name&access_token=${encodeURIComponent(accessToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{ id?: string; name?: string }>(res, "Could not validate the page");
  if (!data.id) {
    throw new FacebookApiError("Facebook did not return a page id for this token.");
  }
  if (data.id !== pageId) {
    throw new FacebookApiError(
      `This token controls page ${data.id}, not ${pageId}. Check the Page ID.`,
    );
  }
  return { id: data.id, name: data.name || pageId };
}

/**
 * Publish a post to a Page feed. Uses the official POST /{pageId}/feed endpoint
 * with `message` + `link` (Facebook renders the link's Open Graph preview, which
 * pulls the article's cover image and title from our page metadata).
 *
 * Returns the created post id (e.g. "{pageId}_{postId}") for building a
 * facebook.com permalink and for idempotency tracking.
 */
export async function postToPage(args: {
  pageId: string;
  accessToken: string;
  message: string;
  link?: string;
}): Promise<{ postId: string }> {
  const body = new URLSearchParams();
  body.set("message", args.message);
  if (args.link) body.set("link", args.link);
  body.set("access_token", args.accessToken);

  const res = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(args.pageId)}/feed`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await parseGraph<{ id?: string }>(res, "Facebook rejected the post");
  if (!data.id) {
    throw new FacebookApiError("Facebook accepted the request but returned no post id.");
  }
  return { postId: data.id };
}

/**
 * Exchange a short-lived USER token for a long-lived one (~60 days), then the
 * caller can read the page tokens from /me/accounts (those page tokens are
 * effectively non-expiring once derived from a long-lived user token).
 *
 * Requires FACEBOOK_APP_ID + FACEBOOK_APP_SECRET. Optional helper — if you paste
 * long-lived Page tokens directly in the UI you don't need this path at all.
 */
export async function exchangeForLongLivedUserToken(
  shortLivedToken: string,
  creds?: { appId?: string | null; appSecret?: string | null },
): Promise<{ accessToken: string; expiresInSeconds?: number }> {
  const appId = creds?.appId || process.env.FACEBOOK_APP_ID;
  const appSecret = creds?.appSecret || process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) {
    throw new FacebookApiError(
      "Long-lived token exchange needs your Facebook App ID and App Secret — add them in the Connect dialog (or set FACEBOOK_APP_ID / FACEBOOK_APP_SECRET).",
    );
  }
  const url =
    `${GRAPH_BASE}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(appId)}` +
    `&client_secret=${encodeURIComponent(appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(shortLivedToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{ access_token?: string; expires_in?: number }>(
    res,
    "Token exchange failed",
  );
  if (!data.access_token) {
    throw new FacebookApiError("Facebook did not return a long-lived token.");
  }
  return { accessToken: data.access_token, expiresInSeconds: data.expires_in };
}

/**
 * List the Pages a USER access token manages, each with its PAGE access token.
 * GET /me/accounts. Page tokens derived from a long-lived user token are
 * effectively non-expiring for posting. SERVER-SIDE ONLY — never return the page
 * access tokens to the browser.
 */
export async function getUserPages(
  userToken: string,
): Promise<{ id: string; name: string; accessToken: string }[]> {
  const url =
    `${GRAPH_BASE}/me/accounts?fields=id,name,access_token&limit=100` +
    `&access_token=${encodeURIComponent(userToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{ data?: { id?: string; name?: string; access_token?: string }[] }>(
    res,
    "Could not list your Pages",
  );
  const pages = (data.data ?? [])
    .filter((p) => p.id && p.access_token)
    .map((p) => ({ id: p.id as string, name: p.name || (p.id as string), accessToken: p.access_token as string }));
  if (pages.length === 0) {
    throw new FacebookApiError(
      "No Pages found for this token — make sure it has the pages_show_list scope and you manage at least one Page.",
    );
  }
  return pages;
}

/** Build a facebook.com permalink from a returned post id ("{page}_{post}"). */
export function permalinkForPost(postId: string): string {
  const [page, post] = postId.split("_");
  if (page && post) return `https://www.facebook.com/${page}/posts/${post}`;
  return `https://www.facebook.com/${postId}`;
}

/** Per-post results read back after a share. Engagement is always attempted;
 *  reach/impressions need the `read_insights` permission, so they degrade to null
 *  (with `insightsUnavailable: true`) rather than failing the whole call. */
export type PostStats = {
  permalink?: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  impressions: number | null;
  reach: number | null;
  insightsUnavailable: boolean;
};

/**
 * Read a posted item's results: engagement (reactions / comments / shares +
 * permalink) in one call, then reach/impressions from the post-insights edge in a
 * second, best-effort call. Insights require the `read_insights` permission on the
 * Page token — when it's missing/denied we keep the engagement numbers and just
 * mark reach unavailable. `postId` is the "{page}_{post}" id we stored on posting.
 */
export async function getPostStats(postId: string, accessToken: string): Promise<PostStats> {
  const fields = "permalink_url,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)";
  const url =
    `${GRAPH_BASE}/${encodeURIComponent(postId)}?fields=${encodeURIComponent(fields)}` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{
    permalink_url?: string;
    shares?: { count?: number };
    reactions?: { summary?: { total_count?: number } };
    comments?: { summary?: { total_count?: number } };
  }>(res, "Could not load post results");

  const stats: PostStats = {
    permalink: data.permalink_url,
    reactions: data.reactions?.summary?.total_count ?? null,
    comments: data.comments?.summary?.total_count ?? null,
    shares: data.shares?.count ?? 0,
    impressions: null,
    reach: null,
    insightsUnavailable: false,
  };

  // Reach / impressions — separate edge, needs read_insights. Tolerate failure.
  try {
    const iUrl =
      `${GRAPH_BASE}/${encodeURIComponent(postId)}/insights/post_impressions,post_impressions_unique` +
      `?access_token=${encodeURIComponent(accessToken)}`;
    const iRes = await graphFetch(iUrl, { method: "GET", cache: "no-store" });
    const iData = await parseGraph<{ data?: { name?: string; values?: { value?: number }[] }[] }>(
      iRes,
      "Could not load reach",
    );
    for (const m of iData.data ?? []) {
      const v = m.values?.[0]?.value ?? null;
      if (m.name === "post_impressions") stats.impressions = typeof v === "number" ? v : null;
      else if (m.name === "post_impressions_unique") stats.reach = typeof v === "number" ? v : null;
    }
  } catch {
    stats.insightsUnavailable = true;
  }

  return stats;
}
