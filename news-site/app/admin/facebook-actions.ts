"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  FacebookApiError,
  exchangeForLongLivedUserToken,
  validatePageToken,
  getUserPages,
} from "@/lib/facebook";
import {
  getFacebookAppCreds,
  saveFacebookAppCreds,
  saveFacebookUserToken,
  getFacebookUserToken,
} from "@/lib/facebookSettings";
import { publishArticleToPage, articleUrl, buildMessage, type PublishResult } from "@/lib/facebookPublish";
import {
  isRunnerConfigured,
  runnerStatus,
  runnerLogin,
  runnerExportSession,
  runnerValidateSession,
  runnerPost,
  runnerPages,
  RunnerError,
  type SessionState,
  type RunnerPage,
} from "@/lib/fbRunner";

/** Standard action result for client toasts. `data` is present on success when
 *  the action returns a payload (typed via the generic), omitted otherwise. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

// ── Published-article picker (Step 2 of the Share flow) ───────────────────────

export type ShareArticleItem = {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string | null;
  views: number;
  publishedAt: string | null;
};

/**
 * List PUBLISHED articles for the Facebook Share flow's article picker, with
 * title search + pagination. Drafts are excluded (only published articles have a
 * public URL for Facebook to scrape).
 */
export async function listPublishedArticlesForShare(input: {
  q?: string;
  page?: number;
  perPage?: number;
}): Promise<ActionResult<{ items: ShareArticleItem[]; total: number; page: number; perPage: number }>> {
  await requireAdmin();
  const perPage = Math.min(48, Math.max(1, Math.floor(input.perPage ?? 12)));
  const page = Math.max(1, Math.floor(input.page ?? 1));
  const q = (input.q ?? "").trim();
  const where = {
    status: "published",
    ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
  };
  try {
    const [rows, total] = await Promise.all([
      prisma.article.findMany({
        where,
        orderBy: { publishedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, views: true, publishedAt: true },
      }),
      prisma.article.count({ where }),
    ]);
    return {
      ok: true,
      data: {
        items: rows.map((a) => ({
          id: a.id,
          title: a.title,
          slug: a.slug,
          excerpt: a.excerpt,
          coverImage: a.coverImage,
          views: a.views,
          publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        })),
        total,
        page,
        perPage,
      },
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t load articles.");
  }
}

// ── Browser runner status (self-hosted persistent-browser posting) ───────────

/** Reachability + login state of the optional self-hosted browser runner, for
 *  the UI to decide whether to offer the "Browser runner" posting option. */
export async function getRunnerStatus(): Promise<{ configured: boolean; reachable: boolean; loggedIn: boolean }> {
  await requireAdmin();
  if (!isRunnerConfigured()) return { configured: false, reachable: false, loggedIn: false };
  const s = await runnerStatus();
  return { configured: true, ...s };
}

// ── Browser sessions (capture once, reuse to post) ───────────────────────────

/** Open the runner's browser for a manual login (step 1 of capturing a session). */
export async function startRunnerLogin(): Promise<ActionResult> {
  await requireAdmin();
  if (!isRunnerConfigured()) return fail("Browser runner isn’t configured.");
  try {
    await runnerLogin();
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e instanceof RunnerError ? e.message : "Couldn’t reach the browser runner.");
  }
}

/**
 * Capture the runner's current logged-in session and store it ENCRYPTED in the DB
 * (step 2). The session blob never touches the client — it's exported server-side
 * and encrypted with AES-256-GCM before the insert.
 */
export async function captureRunnerSession(label: string): Promise<ActionResult> {
  await requireAdmin();
  if (!isRunnerConfigured()) return fail("Browser runner isn’t configured.");
  const name = label.trim();
  if (!name) return fail("Give the session a label first.");
  try {
    const { state, accountName } = await runnerExportSession();
    await prisma.facebookSession.create({
      data: {
        label: name,
        accountName: accountName ?? null,
        encryptedState: encryptSecret(JSON.stringify(state)),
        status: "Active",
        lastValidatedAt: new Date(),
      },
    });
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof RunnerError) {
      return fail(
        e.code === "not_logged_in"
          ? "Finish logging in in the browser window first, then capture."
          : e.message,
      );
    }
    return fail("Couldn’t capture the session.");
  }
}

/** Re-check a saved session against the runner and update its status. */
export async function validateFacebookSession(
  id: string,
): Promise<ActionResult<{ loggedIn: boolean }>> {
  await requireAdmin();
  if (!isRunnerConfigured()) return fail("Browser runner isn’t configured.");
  const session = await prisma.facebookSession.findUnique({ where: { id } });
  if (!session) return fail("Session not found.");
  let state: SessionState;
  try {
    state = JSON.parse(decryptSecret(session.encryptedState)) as SessionState;
  } catch {
    await prisma.facebookSession.update({ where: { id }, data: { status: "Expired" } });
    return fail("Stored session couldn’t be decrypted.");
  }
  try {
    const r = await runnerValidateSession(state);
    await prisma.facebookSession.update({
      where: { id },
      data: {
        status: r.loggedIn ? "Active" : "Expired",
        lastValidatedAt: new Date(),
        accountName: r.accountName ?? session.accountName,
      },
    });
    revalidatePath("/admin/facebook");
    return { ok: true, data: { loggedIn: r.loggedIn } };
  } catch (e) {
    return fail(e instanceof RunnerError ? e.message : "Validation failed.");
  }
}

/** Delete a saved session (also wipes the encrypted blob). */
export async function deleteFacebookSession(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.facebookSession.delete({ where: { id } });
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t delete the session.");
  }
}

// ── Discover the Pages a logged-in browser session manages ───────────────────

/**
 * List the Pages the runner's logged-in account manages (best-effort scrape), so
 * the UI can show them as a multi-select for posting. Uses a saved (encrypted)
 * session when `sessionId` is given, else the runner's own on-disk session.
 */
export async function discoverRunnerPages(
  sessionId?: string,
): Promise<ActionResult<{ pages: RunnerPage[] }>> {
  await requireAdmin();
  if (!isRunnerConfigured()) return fail("Browser runner isn’t configured.");

  let state: SessionState | undefined;
  if (sessionId) {
    const session = await prisma.facebookSession.findUnique({ where: { id: sessionId } });
    if (!session) return fail("Selected session not found.");
    try {
      state = JSON.parse(decryptSecret(session.encryptedState)) as SessionState;
    } catch {
      await prisma.facebookSession.update({ where: { id: session.id }, data: { status: "Expired" } }).catch(() => {});
      return fail("Stored session couldn’t be decrypted. Re-capture it.");
    }
  }

  try {
    const pages = await runnerPages(state);
    return { ok: true, data: { pages } };
  } catch (e) {
    const msg =
      e instanceof RunnerError
        ? e.code === "not_logged_in" || e.code === "session_expired"
          ? "Session isn’t logged in — re-capture it, or open the runner login."
          : e.message
        : "Couldn’t load Pages from the browser runner.";
    return fail(msg);
  }
}

// ── Connect / save a page ────────────────────────────────────────────────────

/**
 * Validate a Page token against the Graph API and, if valid, save the page with
 * the token ENCRYPTED at rest. Optionally exchanges a short-lived user token for
 * a long-lived one first (when `exchange` is set and app creds are configured).
 * Upserts on pageId so re-connecting an expired page refreshes its token.
 */
export async function connectFacebookPage(input: {
  pageId: string;
  accessToken: string;
  categoryGroup: string;
  exchange?: boolean;
}): Promise<ActionResult> {
  await requireAdmin();

  const pageId = input.pageId.trim();
  const categoryGroup = input.categoryGroup.trim();
  let token = input.accessToken.trim();

  if (!pageId) return fail("Page ID is required.");
  if (!token) return fail("Access token is required.");
  if (!categoryGroup) return fail("Please choose a category group.");

  try {
    if (input.exchange) {
      const exchanged = await exchangeForLongLivedUserToken(token);
      token = exchanged.accessToken;
    }

    // Verify the token is real and controls this page (also gets current name).
    const { name } = await validatePageToken(pageId, token);

    await prisma.facebookPage.upsert({
      where: { pageId },
      update: {
        pageName: name,
        accessToken: encryptSecret(token),
        categoryGroup,
        status: "Connected",
        lastSyncedAt: new Date(),
      },
      create: {
        pageId,
        pageName: name,
        accessToken: encryptSecret(token),
        categoryGroup,
        status: "Connected",
        lastSyncedAt: new Date(),
      },
    });

    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof FacebookApiError) return fail(e.message);
    return fail("Could not connect the page. Please try again.");
  }
}

// ── Auto-connect: App ID/Secret + short-lived user token → long-lived →
//    GET /me/accounts → pick a Page → store its (encrypted) Page token ─────────

/**
 * Step 1. Saves the App credentials (App Secret encrypted), exchanges the pasted
 * short-lived USER token for a long-lived one, stores that (encrypted) for the
 * connect step, and returns the Pages this account manages — id + name ONLY
 * (page access tokens never reach the browser).
 */
export async function facebookFetchPages(input: {
  appId?: string;
  appSecret?: string;
  userToken: string;
}): Promise<ActionResult<{ pages: { id: string; name: string }[] }>> {
  await requireAdmin();
  const userToken = input.userToken?.trim();
  if (!userToken) return fail("Paste your Facebook user access token first.");
  try {
    if (input.appId?.trim() && input.appSecret?.trim()) {
      await saveFacebookAppCreds({ appId: input.appId.trim(), appSecret: input.appSecret.trim() });
    }
    const creds = await getFacebookAppCreds();
    if (!creds.appId || !creds.appSecret) {
      return fail("Enter your App ID and App Secret (App Dashboard → Settings → Basic).");
    }
    const longLived = await exchangeForLongLivedUserToken(userToken, creds);
    await saveFacebookUserToken(longLived.accessToken, longLived.expiresInSeconds);
    const pages = await getUserPages(longLived.accessToken);
    return { ok: true, data: { pages: pages.map((p) => ({ id: p.id, name: p.name })) } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t fetch your Pages from Facebook.");
  }
}

/**
 * Step 2. Re-reads the stored long-lived user token, finds the chosen Page's
 * PAGE token from /me/accounts, validates it, and stores it ENCRYPTED as a
 * FacebookPage. The page token never touches the browser.
 */
export async function facebookConnectPage(input: {
  pageId: string;
  categoryGroup: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const pageId = input.pageId.trim();
  const categoryGroup = input.categoryGroup.trim();
  if (!pageId) return fail("Pick a Page to connect.");
  if (!categoryGroup) return fail("Choose a category group.");
  try {
    const userToken = await getFacebookUserToken();
    if (!userToken) return fail("Your Facebook connection expired — fetch your Pages again.");
    const pages = await getUserPages(userToken);
    const page = pages.find((p) => p.id === pageId);
    if (!page) return fail("That Page wasn’t found on your account — fetch your Pages again.");
    const { name } = await validatePageToken(page.id, page.accessToken);
    await prisma.facebookPage.upsert({
      where: { pageId: page.id },
      update: {
        pageName: name,
        accessToken: encryptSecret(page.accessToken),
        categoryGroup,
        status: "Connected",
        lastSyncedAt: new Date(),
      },
      create: {
        pageId: page.id,
        pageName: name,
        accessToken: encryptSecret(page.accessToken),
        categoryGroup,
        status: "Connected",
        lastSyncedAt: new Date(),
      },
    });
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t connect the Page.");
  }
}

// ── Refresh ALL pages: re-fetch /me/accounts to re-sync + discover new ───────

/**
 * Re-fetch GET /me/accounts using the stored long-lived user token: refresh the
 * token + name of every already-connected Page, and auto-add any NEW Pages the
 * account now manages (filed under "Uncategorized" until you set a group). Lets a
 * Page you just created on Facebook show up here without re-pasting anything.
 */
export async function facebookRefreshPages(): Promise<ActionResult<{ refreshed: number; added: number }>> {
  await requireAdmin();
  try {
    const userToken = await getFacebookUserToken();
    if (!userToken) {
      return fail("Connect with the Auto flow first (App ID + Secret + user token) — then Refresh Pages can re-sync.");
    }
    const pages = await getUserPages(userToken);
    const existing = await prisma.facebookPage.findMany({ select: { pageId: true } });
    const known = new Set(existing.map((p) => p.pageId));
    let refreshed = 0;
    let added = 0;
    for (const p of pages) {
      const isNew = !known.has(p.id);
      await prisma.facebookPage.upsert({
        where: { pageId: p.id },
        update: {
          pageName: p.name,
          accessToken: encryptSecret(p.accessToken),
          status: "Connected",
          lastSyncedAt: new Date(),
        },
        create: {
          pageId: p.id,
          pageName: p.name,
          accessToken: encryptSecret(p.accessToken),
          categoryGroup: "Uncategorized",
          status: "Connected",
          lastSyncedAt: new Date(),
        },
      });
      if (isNew) added++;
      else refreshed++;
    }
    revalidatePath("/admin/facebook");
    return { ok: true, data: { refreshed, added } };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t refresh your Pages from Facebook.");
  }
}

// ── Refresh / validate an existing page's token ──────────────────────────────

/**
 * Re-validate a stored token against the Graph API and update status
 * accordingly (Connected ↔ Expired). Decryption happens inside the service via
 * the publish helper path; here we read + decrypt only to validate.
 */
export async function refreshFacebookPage(id: string): Promise<ActionResult> {
  await requireAdmin();

  const page = await prisma.facebookPage.findUnique({ where: { id } });
  if (!page) return fail("Page not found.");

  // Decrypt locally to validate. Kept out of a shared helper because validation
  // (unlike posting) doesn't need the full publish flow.
  let token: string;
  try {
    token = decryptSecret(page.accessToken);
  } catch {
    await prisma.facebookPage.update({ where: { id }, data: { status: "Expired" } });
    revalidatePath("/admin/facebook");
    return fail("Stored token could not be decrypted. Reconnect the page.");
  }

  try {
    const { name } = await validatePageToken(page.pageId, token);
    await prisma.facebookPage.update({
      where: { id },
      data: { status: "Connected", pageName: name, lastSyncedAt: new Date() },
    });
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch (e) {
    const expired = e instanceof FacebookApiError && e.expired;
    await prisma.facebookPage.update({
      where: { id },
      data: { status: expired ? "Expired" : page.status },
    });
    revalidatePath("/admin/facebook");
    return fail(e instanceof Error ? e.message : "Validation failed.");
  }
}

// ── Disconnect / delete a page ───────────────────────────────────────────────

export async function disconnectFacebookPage(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.facebookPage.delete({ where: { id } });
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch {
    return fail("Could not disconnect the page.");
  }
}

// ── Publish an article now to selected pages ─────────────────────────────────

/**
 * Post an article immediately to each selected page via the Graph API. Returns a
 * per-page result array so the UI can show which pages succeeded/failed. Also
 * records a ScheduledPost row per attempt (status posted/failed) for history.
 */
/**
 * Post one article to one page via the self-hosted browser runner. The runner
 * automates the logged-in Facebook UI (switches to the page + posts the message
 * with the article link appended). Returns the same PublishResult shape as the
 * Graph path so the UI is identical; maps runner errors to readable messages.
 */
async function publishViaRunner(
  article: { title: string; slug: string; excerpt: string | null },
  page: { id: string; pageId: string; pageName: string },
  state?: SessionState,
): Promise<PublishResult> {
  const base = { pageDbId: page.id, pageName: page.pageName };
  // The runner switches pages by navigating to the page's public URL.
  const pageUrl = `https://www.facebook.com/${encodeURIComponent(page.pageId)}`;
  const message = `${buildMessage(article)}\n${articleUrl(article.slug)}`;
  try {
    await runnerPost({ pageUrl, pageName: page.pageName, message, state });
    return { ...base, ok: true };
  } catch (e) {
    const msg =
      e instanceof RunnerError
        ? e.code === "not_logged_in" || e.code === "session_expired"
          ? "Saved session isn’t logged in — re-capture it, or open the runner login."
          : e.message
        : "Browser runner failed to post.";
    return { ...base, ok: false, error: msg };
  }
}

export async function publishArticleNow(input: {
  articleId: string;
  pageDbIds: string[];
  // "graph" (default, official API) or "runner" (self-hosted persistent browser).
  via?: "graph" | "runner";
  // When via="runner", optionally post using a saved (encrypted) browser session
  // instead of the runner's live login.
  sessionId?: string;
  // Optional edited caption for the post message (Graph path). Blank → default.
  caption?: string;
}): Promise<ActionResult<PublishResult[]>> {
  await requireAdmin();

  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, title: true, slug: true, excerpt: true },
  });
  if (!article) return fail("Article not found.");
  if (input.pageDbIds.length === 0) return fail("Select at least one page.");

  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: input.pageDbIds } },
  });
  if (pages.length === 0) return fail("No matching pages found.");

  // Route via the self-hosted browser runner when explicitly requested AND
  // configured; otherwise fall back to the Graph API (the default path).
  const useRunner = input.via === "runner" && isRunnerConfigured();
  if (input.via === "runner" && !isRunnerConfigured()) {
    return fail("Browser runner isn’t configured. Set FB_RUNNER_URL + FB_RUNNER_TOKEN, or use the Graph API option.");
  }

  // If a saved session is chosen, decrypt it once here (server-side only).
  let sessionState: SessionState | undefined;
  if (useRunner && input.sessionId) {
    const session = await prisma.facebookSession.findUnique({ where: { id: input.sessionId } });
    if (!session) return fail("Selected session not found.");
    try {
      sessionState = JSON.parse(decryptSecret(session.encryptedState)) as SessionState;
    } catch {
      await prisma.facebookSession.update({ where: { id: session.id }, data: { status: "Expired" } }).catch(() => {});
      return fail("Stored session couldn’t be decrypted. Re-capture it.");
    }
    await prisma.facebookSession
      .update({ where: { id: session.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  const results: PublishResult[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    const result = useRunner
      ? await publishViaRunner(article, page, sessionState)
      : await publishArticleToPage(article, page, input.caption);
    results.push(result);
    // Record history (best-effort; never let logging break the response).
    await prisma.scheduledPost
      .create({
        data: {
          articleId: article.id,
          facebookPageId: page.id,
          scheduledFor: new Date(),
          status: result.ok ? "posted" : "failed",
          postedAt: result.ok ? new Date() : null,
          error: result.ok ? null : result.error ?? null,
          graphPostId: result.graphPostId ?? null,
        },
      })
      .catch(() => {});
    // Gentle spacing between Graph calls so a multi-page burst doesn't trip
    // Facebook's rate limits (skipped after the last page / for the runner).
    if (!useRunner && i < pages.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  revalidatePath("/admin/facebook");
  revalidatePath(`/admin/articles/${article.id}/edit`);
  return { ok: true, data: results };
}

// ── Post to a Page by URL via the runner (no Graph token / connected page) ───

/** Normalize user input (username, @handle, or facebook URL) to a page URL. */
function normalizeFacebookUrl(input: string): string | null {
  let s = input.trim().replace(/^@/, "");
  if (!s) return null;
  // Pull out whatever follows facebook.com/ if a full URL/host was given.
  const m = s.match(/(?:https?:\/\/)?(?:www\.|m\.|web\.)?facebook\.com\/(.+)$/i);
  if (m) s = m[1];
  else if (/(?:https?:\/\/)?(?:www\.|m\.)?facebook\.com\/?$/i.test(s)) return null; // domain only
  if (/^https?:\/\//i.test(s)) return null; // some other site
  s = s.replace(/\/+$/, "");
  if (!s || /\s/.test(s)) return null;
  return `https://www.facebook.com/${s}`;
}

/**
 * Post an article to a Facebook Page identified ONLY by its URL/username, using a
 * saved browser session (or the runner's live login). No FacebookPage row or Graph
 * token required — the runner navigates to the page and posts. Not recorded in
 * per-page history (there's no connected page to attach it to).
 */
export async function publishArticleToPageUrl(input: {
  articleId: string;
  pageUrl: string;
  sessionId?: string;
}): Promise<ActionResult<{ pageName: string }>> {
  await requireAdmin();
  if (!isRunnerConfigured()) return fail("Browser runner isn’t configured.");

  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true, title: true, slug: true, excerpt: true },
  });
  if (!article) return fail("Article not found.");

  const pageUrl = normalizeFacebookUrl(input.pageUrl);
  if (!pageUrl) return fail("Enter a valid Facebook Page URL or @username.");

  let state: SessionState | undefined;
  if (input.sessionId) {
    const session = await prisma.facebookSession.findUnique({ where: { id: input.sessionId } });
    if (!session) return fail("Selected session not found.");
    try {
      state = JSON.parse(decryptSecret(session.encryptedState)) as SessionState;
    } catch {
      await prisma.facebookSession.update({ where: { id: session.id }, data: { status: "Expired" } }).catch(() => {});
      return fail("Stored session couldn’t be decrypted. Re-capture it.");
    }
    await prisma.facebookSession.update({ where: { id: session.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  const message = `${buildMessage(article)}\n${articleUrl(article.slug)}`;
  try {
    await runnerPost({ pageUrl, pageName: pageUrl, message, state });
    return { ok: true, data: { pageName: pageUrl } };
  } catch (e) {
    const msg =
      e instanceof RunnerError
        ? e.code === "not_logged_in" || e.code === "session_expired"
          ? "Session isn’t logged in — re-capture it, or open the runner login."
          : e.message
        : "Browser runner failed to post.";
    return fail(msg);
  }
}

// ── Schedule an article for later ────────────────────────────────────────────

/**
 * Create pending ScheduledPost rows (one per selected page) for a future time.
 * The Vercel Cron runner (/api/cron/facebook-post) picks these up when due.
 */
export async function scheduleArticlePosts(input: {
  articleId: string;
  pageDbIds: string[];
  scheduledFor: string; // ISO datetime from the picker
}): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();

  const when = new Date(input.scheduledFor);
  if (Number.isNaN(when.getTime())) return fail("Invalid date/time.");
  if (when.getTime() < Date.now() - 60_000) {
    return fail("Pick a time in the future.");
  }
  if (input.pageDbIds.length === 0) return fail("Select at least one page.");

  const article = await prisma.article.findUnique({
    where: { id: input.articleId },
    select: { id: true },
  });
  if (!article) return fail("Article not found.");

  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: input.pageDbIds } },
    select: { id: true },
  });
  if (pages.length === 0) return fail("No matching pages found.");

  await prisma.scheduledPost.createMany({
    data: pages.map((p) => ({
      articleId: article.id,
      facebookPageId: p.id,
      scheduledFor: when,
      status: "pending",
    })),
  });

  revalidatePath(`/admin/articles/${article.id}/edit`);
  revalidatePath("/admin/facebook");
  return { ok: true, data: { count: pages.length } };
}

// ── Cancel a pending scheduled post ──────────────────────────────────────────

export async function cancelScheduledPost(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    // Only pending posts can be cancelled (don't delete history of sent posts).
    const deleted = await prisma.scheduledPost.deleteMany({
      where: { id, status: "pending" },
    });
    if (deleted.count === 0) return fail("That post is no longer pending.");
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch {
    return fail("Could not cancel the scheduled post.");
  }
}

// ── Schedule shares from the two-step flow (server-side; fires via cron) ───────

export type ScheduledShareInput = { pageDbId: string; scheduledAt: string }; // ISO UTC

/**
 * Create pending ScheduledPost rows (one per page) at the given UTC times, with
 * an optional shared caption. The Vercel Cron runner (/api/cron/facebook-post)
 * posts each when due — works while the admin is closed. Same table the cron +
 * post history already use; each time must be in the future.
 */
export async function scheduleArticleShares(input: {
  articleId: string;
  caption?: string;
  schedules: ScheduledShareInput[];
}): Promise<ActionResult<{ count: number }>> {
  await requireAdmin();
  if (!input.schedules?.length) return fail("Pick at least one page.");

  const article = await prisma.article.findUnique({ where: { id: input.articleId }, select: { id: true } });
  if (!article) return fail("Article not found.");

  const pages = await prisma.facebookPage.findMany({
    where: { id: { in: input.schedules.map((s) => s.pageDbId) } },
    select: { id: true },
  });
  const known = new Set(pages.map((p) => p.id));

  const now = Date.now();
  const caption = input.caption?.trim() ? input.caption.trim() : null;
  const rows: { articleId: string; facebookPageId: string; scheduledFor: Date; caption: string | null; status: string }[] = [];
  for (const s of input.schedules) {
    if (!known.has(s.pageDbId)) return fail("One of the selected pages no longer exists.");
    const when = new Date(s.scheduledAt);
    if (Number.isNaN(when.getTime())) return fail("Invalid schedule time.");
    if (when.getTime() < now - 60_000) return fail("Pick a time in the future.");
    rows.push({ articleId: article.id, facebookPageId: s.pageDbId, scheduledFor: when, caption, status: "pending" });
  }

  await prisma.scheduledPost.createMany({ data: rows });
  revalidatePath("/admin/facebook");
  return { ok: true, data: { count: rows.length } };
}

/** Edit a still-pending scheduled post (time and/or caption). */
export async function updateScheduledShare(input: {
  id: string;
  scheduledAt?: string;
  caption?: string;
}): Promise<ActionResult> {
  await requireAdmin();
  const existing = await prisma.scheduledPost.findUnique({ where: { id: input.id }, select: { status: true } });
  if (!existing) return fail("Scheduled post not found.");
  if (existing.status !== "pending") return fail("Only pending posts can be edited.");

  const data: { scheduledFor?: Date; caption?: string | null } = {};
  if (input.scheduledAt != null) {
    const when = new Date(input.scheduledAt);
    if (Number.isNaN(when.getTime())) return fail("Invalid schedule time.");
    if (when.getTime() < Date.now() - 60_000) return fail("Pick a time in the future.");
    data.scheduledFor = when;
  }
  if (input.caption != null) data.caption = input.caption.trim() ? input.caption.trim() : null;
  if (Object.keys(data).length === 0) return fail("Nothing to update.");

  // Guard against editing a row the cron just claimed (pending → posting).
  const res = await prisma.scheduledPost.updateMany({ where: { id: input.id, status: "pending" }, data });
  if (res.count === 0) return fail("That post is no longer pending.");
  revalidatePath("/admin/facebook");
  return { ok: true, data: undefined };
}

/** Cancel a pending scheduled post — keeps it in the list as "canceled". */
export async function cancelScheduledShare(id: string): Promise<ActionResult> {
  await requireAdmin();
  const res = await prisma.scheduledPost.updateMany({
    where: { id, status: "pending" },
    data: { status: "canceled" },
  });
  if (res.count === 0) return fail("That post is no longer pending.");
  revalidatePath("/admin/facebook");
  return { ok: true, data: undefined };
}

/** Delete a scheduled post row entirely (anything except one mid-send). */
export async function deleteScheduledShare(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const res = await prisma.scheduledPost.deleteMany({ where: { id, status: { not: "posting" } } });
    if (res.count === 0) return fail("Can’t delete a post that’s currently sending.");
    revalidatePath("/admin/facebook");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t delete the scheduled post.");
  }
}
