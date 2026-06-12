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
const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION || "v25.0";
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
  /** True when the token lacks a required permission (e.g. pages_manage_engagement). */
  readonly permission: boolean;
  readonly code?: number;
  readonly subcode?: number;

  constructor(
    message: string,
    opts: { expired?: boolean; rateLimited?: boolean; permission?: boolean; code?: number; subcode?: number } = {},
  ) {
    super(message);
    this.name = "FacebookApiError";
    this.expired = opts.expired ?? false;
    this.rateLimited = opts.rateLimited ?? false;
    this.permission = opts.permission ?? false;
    this.code = opts.code;
    this.subcode = opts.subcode;
  }
}

/** Graph error codes that mean "this token can no longer be used." */
const TOKEN_INVALID_CODES = new Set([190, 102, 463, 467, 2500]);

/** Graph error codes that mean "you're being throttled / temporarily blocked." */
const RATE_LIMIT_CODES = new Set([4, 17, 32, 341, 613]);

/** Graph error codes that mean "this token lacks a required permission." */
const PERMISSION_CODES = new Set([10, 200, 3, 299]);

function toFriendlyError(
  err: GraphError | undefined,
  fallback: string,
  httpStatus?: number,
): FacebookApiError {
  const code = err?.code;
  const expired = code != null && TOKEN_INVALID_CODES.has(code);
  const rateLimited = httpStatus === 429 || (code != null && RATE_LIMIT_CODES.has(code));
  const msgLc = (err?.message || "").toLowerCase();
  const permission =
    !expired &&
    ((code != null && PERMISSION_CODES.has(code)) || msgLc.includes("pages_manage_engagement") || msgLc.includes("permission"));
  const base = err?.message?.trim() || fallback;
  const message = expired
    ? `${base} (the Page access token is invalid or expired — reconnect the page).`
    : rateLimited
      ? `${base} (Facebook rate limit reached — wait a few minutes before trying again).`
      : permission
        ? `${base} (the Page token is missing the "pages_manage_engagement" permission needed to comment as the Page — reconnect the page with that scope granted).`
        : base;
  return new FacebookApiError(message, { expired, rateLimited, permission, code, subcode: err?.error_subcode });
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
 * Publish a PHOTO post to a Page from an image URL (official POST /{pageId}/photos
 * with `url` + `caption`). Facebook fetches the image and creates a native photo
 * post (not a link preview). Returns the FEED post id (`post_id`, "{page}_{post}")
 * for permalink / comments / stats — falling back to the photo id if needed.
 */
export async function postPhotoToPage(args: {
  pageId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
}): Promise<{ postId: string; photoId?: string }> {
  const body = new URLSearchParams();
  body.set("url", args.imageUrl);
  body.set("caption", args.caption);
  body.set("published", "true");
  body.set("access_token", args.accessToken);

  const res = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(args.pageId)}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await parseGraph<{ id?: string; post_id?: string }>(res, "Facebook rejected the photo post");
  const postId = data.post_id || data.id;
  if (!postId) {
    throw new FacebookApiError("Facebook accepted the photo but returned no post id.");
  }
  return { postId, photoId: data.id };
}

/**
 * Add a comment to a post AS THE PAGE (official POST /{postId}/comments).
 * Requires the `pages_manage_engagement` permission on the Page token — a missing
 * permission surfaces as FacebookApiError with `.permission === true`.
 */
export async function commentOnPost(args: {
  postId: string;
  accessToken: string;
  message: string;
}): Promise<{ commentId: string }> {
  const body = new URLSearchParams();
  body.set("message", args.message);
  body.set("access_token", args.accessToken);

  const res = await graphFetch(`${GRAPH_BASE}/${encodeURIComponent(args.postId)}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const data = await parseGraph<{ id?: string }>(res, "Facebook rejected the comment");
  if (!data.id) {
    throw new FacebookApiError("Facebook accepted the comment but returned no comment id.");
  }
  return { commentId: data.id };
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

/** A Page's profile picture from the Graph API `/{pageId}/picture` edge. */
export type PagePicture = { url: string | null; isSilhouette: boolean };

/**
 * Resolve a Page's profile picture URL server-side (GET /{pageId}/picture with
 * `redirect=false`, so we get the JSON `{ data: { url, is_silhouette } }` instead
 * of a 302). `square` + width/height gives a crisp square crop for round avatars.
 * Returns the public CDN `url` (no token in it) — store it and serve it directly;
 * the access token never leaves the server. `isSilhouette` means the Page has no
 * real picture (FB's grey default) → callers store null so the UI shows initials.
 */
export async function fetchPagePicture(
  pageId: string,
  accessToken: string,
  size = 96,
): Promise<PagePicture> {
  const px = Math.min(320, Math.max(24, Math.round(size)));
  const url =
    `${GRAPH_BASE}/${encodeURIComponent(pageId)}/picture` +
    `?type=square&width=${px}&height=${px}&redirect=false&access_token=${encodeURIComponent(accessToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{ data?: { url?: string; is_silhouette?: boolean } }>(
    res,
    "Could not load the page picture",
  );
  return { url: data.data?.url ?? null, isSilhouette: Boolean(data.data?.is_silhouette) };
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

/**
 * Best-effort per-post reach + impressions from the post-insights edge (needs the
 * `read_insights` permission). Returns nulls + `available: false` on any failure
 * (missing scope / retired metric / network) so a posts list never breaks over
 * one post. Used to enrich the Page Control posts list without re-reading the
 * engagement counts (those come inline with the list).
 */
export async function getPostReach(
  postId: string,
  accessToken: string,
): Promise<{ reach: number | null; impressions: number | null; available: boolean }> {
  try {
    const url =
      `${GRAPH_BASE}/${encodeURIComponent(postId)}/insights/post_impressions,post_impressions_unique` +
      `?access_token=${encodeURIComponent(accessToken)}`;
    const res = await graphFetch(url, { method: "GET", cache: "no-store" });
    const data = await parseGraph<{ data?: { name?: string; values?: { value?: number }[] }[] }>(res, "Could not load reach");
    let reach: number | null = null;
    let impressions: number | null = null;
    for (const m of data.data ?? []) {
      const v = m.values?.[0]?.value ?? null;
      if (m.name === "post_impressions") impressions = typeof v === "number" ? v : null;
      else if (m.name === "post_impressions_unique") reach = typeof v === "number" ? v : null;
    }
    return { reach, impressions, available: true };
  } catch {
    return { reach: null, impressions: null, available: false };
  }
}

/** One REAL published post on a Page (Page Control → Content). `reach` is filled
 *  best-effort from the insights edge (null when `read_insights` is unavailable). */
export type PagePost = {
  id: string; // "{page}_{post}"
  message: string | null;
  createdTime: string | null; // ISO 8601
  permalink: string;
  thumbnail: string | null; // full_picture CDN url (null when the post has no image)
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
};

/** A page of real posts + the cursor for the next page (null = no more posts). */
export type PagePostsPage = { posts: PagePost[]; after: string | null };

/**
 * List a Page's REAL published posts via the OFFICIAL Graph API
 * (GET /{pageId}/published_posts) with cursor paging. Returns each post's caption,
 * created time, permalink, a thumbnail (full_picture), and inline engagement
 * (reactions / comments / shares summary counts). Reach is left null here and
 * enriched separately/best-effort via getPostReach (it needs read_insights and a
 * single retired metric must never fail the whole list). `pages_read_engagement`
 * is required; a missing scope / invalid token throws FacebookApiError so the
 * caller can show the "needs reconnect" state. SERVER-SIDE ONLY (Page token).
 */
export async function getPagePosts(
  pageId: string,
  accessToken: string,
  opts: { after?: string | null; limit?: number } = {},
): Promise<PagePostsPage> {
  const limit = Math.min(25, Math.max(1, Math.round(opts.limit ?? 15)));
  // Conservative, well-supported field set on v25.0 — deep attachment media is
  // intentionally omitted (it can error a whole post); full_picture is reliable.
  const fields = "id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)";
  const params = new URLSearchParams();
  params.set("fields", fields);
  params.set("limit", String(limit));
  if (opts.after) params.set("after", opts.after);
  params.set("access_token", accessToken);

  const url = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/published_posts?${params.toString()}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{
    data?: {
      id?: string;
      message?: string;
      created_time?: string;
      permalink_url?: string;
      full_picture?: string;
      shares?: { count?: number };
      reactions?: { summary?: { total_count?: number } };
      comments?: { summary?: { total_count?: number } };
    }[];
    paging?: { next?: string; cursors?: { after?: string } };
  }>(res, "Could not load this Page's posts");

  const posts: PagePost[] = (data.data ?? [])
    .filter((p) => p.id)
    .map((p) => ({
      id: p.id as string,
      message: p.message?.trim() || null,
      createdTime: p.created_time ?? null,
      permalink: p.permalink_url || permalinkForPost(p.id as string),
      thumbnail: p.full_picture || null,
      reactions: p.reactions?.summary?.total_count ?? null,
      comments: p.comments?.summary?.total_count ?? null,
      shares: p.shares?.count ?? 0,
      reach: null,
    }));

  // Only advertise a cursor when Facebook says there's a next page, so the client
  // knows when to stop "Load more".
  const after = data.paging?.next ? data.paging?.cursors?.after ?? null : null;
  return { posts, after };
}

// ── Page Insights (Pages performance overview + trends) ──────────────────────
//
// Meta has retired many Page metrics (e.g. page_impressions* / page_fans were
// removed Nov 15 2025; more reach/viewer metrics retire mid-2026, replaced by
// "Views"/"Media Views"). Rather than hard-code a metric that may vanish, the
// caller passes a list of CANDIDATE metrics and we SELF-HEAL: if the API rejects
// one (#100) we drop it and retry, remembering the dead metric for the process so
// we never ask for it again. A page returns whatever is still supported, and a
// missing metric degrades to "—" instead of crashing the whole table.

/** Metrics the Graph API has rejected this process — never request them again. */
const BAD_PAGE_METRICS = new Set<string>();

/** One data point from a Page-insights series (`end_time` present for day series). */
export type InsightValue = { value: number; endTime?: string };

/**
 * Read scalar Page fields (e.g. followers_count, fan_count) in one call:
 * GET /{pageId}?fields=a,b. Returns each field as a number (or undefined when the
 * field is absent / non-numeric). Token/permission errors throw FacebookApiError
 * so the caller can flag the Page as "needs reconnect".
 */
export async function fetchPageFields(
  pageId: string,
  accessToken: string,
  fields: string[],
): Promise<Record<string, number | undefined>> {
  const url =
    `${GRAPH_BASE}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(fields.join(","))}` +
    `&access_token=${encodeURIComponent(accessToken)}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<Record<string, unknown>>(res, "Could not load page details");
  const out: Record<string, number | undefined> = {};
  for (const f of fields) {
    const v = data[f];
    out[f] = typeof v === "number" ? v : undefined;
  }
  return out;
}

/** Low-level GET /{pageId}/insights?metric=…&period=… (one raw request). */
async function graphInsights(
  pageId: string,
  accessToken: string,
  metrics: string[],
  period: string,
  since?: number,
  until?: number,
): Promise<{ name: string; values: InsightValue[] }[]> {
  const params = new URLSearchParams();
  params.set("metric", metrics.join(","));
  params.set("period", period);
  if (since != null) params.set("since", String(since));
  if (until != null) params.set("until", String(until));
  params.set("access_token", accessToken);
  const url = `${GRAPH_BASE}/${encodeURIComponent(pageId)}/insights?${params.toString()}`;
  const res = await graphFetch(url, { method: "GET", cache: "no-store" });
  const data = await parseGraph<{
    data?: { name?: string; values?: { value?: unknown; end_time?: string }[] }[];
  }>(res, "Could not load insights");
  return (data.data ?? []).map((m) => ({
    name: m.name || "",
    values: (m.values ?? []).map((v) => ({
      // Only single-value metrics are requested here, so `value` is a number;
      // a breakdown object (rare, unrequested) degrades to 0.
      value: typeof v.value === "number" ? v.value : 0,
      endTime: v.end_time,
    })),
  }));
}

/** Find which requested metric a #100 error message names (so we can drop it). */
function badMetricFrom(message: string, metrics: string[]): string | null {
  const lc = message.toLowerCase();
  for (const m of metrics) {
    if (lc.includes(m.toLowerCase())) return m;
  }
  return null;
}

type InsightArgs = {
  pageId: string;
  accessToken: string;
  metrics: string[];
  period: string;
  since?: number;
  until?: number;
};

/** Last resort when a #100 doesn't name the culprit: probe each metric alone so a
 *  single bad one can't take down the metrics that still work. */
async function probeInsightsIndividually(args: InsightArgs, metrics: string[]): Promise<Record<string, InsightValue[]>> {
  const out: Record<string, InsightValue[]> = {};
  for (const m of metrics) {
    try {
      const series = await graphInsights(args.pageId, args.accessToken, [m], args.period, args.since, args.until);
      for (const s of series) out[s.name] = s.values;
    } catch (e) {
      if (e instanceof FacebookApiError && (e.expired || e.permission)) throw e;
      if (e instanceof FacebookApiError && e.code === 100) {
        BAD_PAGE_METRICS.add(m);
        continue;
      }
      throw e;
    }
  }
  return out;
}

/**
 * Fetch Page insights with SELF-HEALING metric handling. Filters out metrics
 * already known-bad, requests the rest in one call, and on a #100 "unsupported
 * metric" error drops the named metric and retries (or probes individually when
 * the culprit isn't named). Token-invalid / permission errors are re-thrown so the
 * caller can show a "needs reconnect" badge; everything else degrades to whatever
 * metrics did resolve. Returns a map of metric name → its value series.
 */
export async function fetchPageInsights(args: InsightArgs): Promise<Record<string, InsightValue[]>> {
  let metrics = args.metrics.filter((m) => !BAD_PAGE_METRICS.has(m));
  const out: Record<string, InsightValue[]> = {};

  while (metrics.length > 0) {
    try {
      const series = await graphInsights(args.pageId, args.accessToken, metrics, args.period, args.since, args.until);
      for (const s of series) out[s.name] = s.values;
      return out;
    } catch (e) {
      if (e instanceof FacebookApiError && !e.expired && !e.permission && e.code === 100) {
        const bad = badMetricFrom(e.message, metrics);
        if (bad) {
          BAD_PAGE_METRICS.add(bad);
          metrics = metrics.filter((m) => m !== bad);
          continue; // retry without the rejected metric
        }
        // Couldn't tell which metric — probe each on its own and merge.
        const probed = await probeInsightsIndividually(args, metrics);
        return { ...out, ...probed };
      }
      throw e;
    }
  }
  return out;
}
