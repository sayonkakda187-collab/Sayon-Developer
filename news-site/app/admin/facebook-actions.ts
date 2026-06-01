"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import {
  FacebookApiError,
  exchangeForLongLivedUserToken,
  validatePageToken,
} from "@/lib/facebook";
import { publishArticleToPage, articleUrl, buildMessage, type PublishResult } from "@/lib/facebookPublish";
import { isRunnerConfigured, runnerStatus, runnerPost, RunnerError } from "@/lib/fbRunner";

/** Standard action result for client toasts. `data` is present on success when
 *  the action returns a payload (typed via the generic), omitted otherwise. */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
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
): Promise<PublishResult> {
  const base = { pageDbId: page.id, pageName: page.pageName };
  // The runner switches pages by navigating to the page's public URL.
  const pageUrl = `https://www.facebook.com/${encodeURIComponent(page.pageId)}`;
  const message = `${buildMessage(article)}\n${articleUrl(article.slug)}`;
  try {
    await runnerPost({ pageUrl, pageName: page.pageName, message });
    return { ...base, ok: true };
  } catch (e) {
    const msg =
      e instanceof RunnerError
        ? e.code === "not_logged_in"
          ? "Browser runner isn’t logged in to Facebook — open its login first."
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

  const results: PublishResult[] = [];
  for (const page of pages) {
    const result = useRunner
      ? await publishViaRunner(article, page)
      : await publishArticleToPage(article, page);
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
  }

  revalidatePath("/admin/facebook");
  revalidatePath(`/admin/articles/${article.id}/edit`);
  return { ok: true, data: results };
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
