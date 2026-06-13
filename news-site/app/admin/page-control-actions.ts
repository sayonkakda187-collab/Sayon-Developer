"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { encryptSecret } from "@/lib/crypto";
import {
  FacebookApiError,
  exchangeForLongLivedUserToken,
  getUserPages,
  validatePageToken,
  fetchPagePicture,
  fetchPageFields,
} from "@/lib/facebook";
import {
  getPageControlAppCreds,
  savePageControlAppCreds,
  savePageControlUserToken,
  getPageControlUserToken,
} from "@/lib/pageControlSettings";

// Page Control's OWN connect flow — mirrors the Facebook farm's "Auto" connect
// (App ID/Secret + user token → /me/accounts → pick Pages) but writes to the
// SEPARATE MonitoredPage store with its OWN `pc_*` credentials. Watch-only: the
// requested scopes are read-only (pages_show_list, pages_read_engagement,
// read_insights) — no posting scopes. All tokens are validated + stored encrypted
// server-side; they never reach the browser.

type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };
function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/** Best-effort avatar + follower count for the dashboard (never blocks connect). */
async function enrich(pageId: string, token: string): Promise<{ avatarUrl: string | null; followers: number | null }> {
  let avatarUrl: string | null = null;
  let followers: number | null = null;
  try {
    const pic = await fetchPagePicture(pageId, token, 96);
    avatarUrl = pic.isSilhouette ? null : pic.url;
  } catch {
    /* keep null */
  }
  try {
    const fields = await fetchPageFields(pageId, token, ["followers_count", "fan_count"]);
    followers = fields.followers_count ?? fields.fan_count ?? null;
  } catch {
    /* keep null */
  }
  return { avatarUrl, followers };
}

/**
 * Step 1. Save the Page Control App credentials (Secret encrypted), exchange the
 * pasted short-lived USER token for a long-lived one, store that (encrypted) for
 * the connect step, and return the Pages this account manages — id + name only,
 * flagged with whether they're already monitored. Page tokens never reach the
 * browser.
 */
export async function pageControlFetchPages(input: {
  appId?: string;
  appSecret?: string;
  userToken: string;
}): Promise<ActionResult<{ pages: { id: string; name: string; alreadyAdded: boolean }[] }>> {
  await requireAdmin();
  const userToken = input.userToken?.trim();
  if (!userToken) return fail("Paste your Facebook user access token first.");
  try {
    if (input.appId?.trim() && input.appSecret?.trim()) {
      await savePageControlAppCreds({ appId: input.appId.trim(), appSecret: input.appSecret.trim() });
    }
    const creds = await getPageControlAppCreds();
    if (!creds.appId || !creds.appSecret) {
      return fail("Enter your App ID and App Secret (App Dashboard → Settings → Basic).");
    }
    const longLived = await exchangeForLongLivedUserToken(userToken, creds);
    await savePageControlUserToken(longLived.accessToken, longLived.expiresInSeconds);
    const pages = await getUserPages(longLived.accessToken);
    const existing = await prisma.monitoredPage.findMany({ select: { pageId: true } });
    const known = new Set(existing.map((p) => p.pageId));
    return {
      ok: true,
      data: { pages: pages.map((p) => ({ id: p.id, name: p.name, alreadyAdded: known.has(p.id) })) },
    };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Couldn’t fetch your Pages from Facebook.");
  }
}

/**
 * Step 2. Re-read the stored long-lived user token, and for EACH selected Page
 * find its Page token from /me/accounts, validate it, and upsert it ENCRYPTED as a
 * MonitoredPage (with a best-effort avatar + follower count). Multi-select — the
 * user hand-picks which Pages to watch. Page tokens never touch the browser.
 */
export async function pageControlConnectPages(input: {
  pageIds: string[];
}): Promise<ActionResult<{ added: number }>> {
  await requireAdmin();
  const ids = Array.isArray(input.pageIds) ? input.pageIds.filter((x) => typeof x === "string" && x.trim()) : [];
  if (ids.length === 0) return fail("Pick at least one Page to monitor.");
  try {
    const userToken = await getPageControlUserToken();
    if (!userToken) return fail("Your Page Control connection expired — fetch your Pages again.");
    const pages = await getUserPages(userToken);
    const byId = new Map(pages.map((p) => [p.id, p]));

    let added = 0;
    for (const pageId of ids) {
      const page = byId.get(pageId);
      if (!page) continue; // page no longer on the account — skip silently
      const { name } = await validatePageToken(page.id, page.accessToken);
      const meta = await enrich(page.id, page.accessToken);
      await prisma.monitoredPage.upsert({
        where: { pageId: page.id },
        update: {
          pageName: name,
          accessToken: encryptSecret(page.accessToken),
          status: "Connected",
          lastSyncedAt: new Date(),
          avatarUrl: meta.avatarUrl,
          avatarFetchedAt: new Date(),
          followers: meta.followers ?? undefined,
        },
        create: {
          pageId: page.id,
          pageName: name,
          accessToken: encryptSecret(page.accessToken),
          status: "Connected",
          lastSyncedAt: new Date(),
          avatarUrl: meta.avatarUrl,
          avatarFetchedAt: new Date(),
          followers: meta.followers ?? undefined,
        },
      });
      added++;
    }
    revalidatePath("/admin/page-control");
    return { ok: true, data: { added } };
  } catch (e) {
    if (e instanceof FacebookApiError) return fail(e.message);
    return fail(e instanceof Error ? e.message : "Couldn’t add the selected Pages.");
  }
}

/**
 * Re-derive ONE monitored page's token from the stored long-lived user token
 * (after re-granting scopes / fixing an expired token), validate it, and update
 * the record back to Connected. If the user token itself expired, the caller is
 * told to reconnect via the Connect dialog.
 */
export async function pageControlReconnectPage(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    const mp = await prisma.monitoredPage.findUnique({ where: { id }, select: { pageId: true } });
    if (!mp) return fail("That monitored page no longer exists.");
    const userToken = await getPageControlUserToken();
    if (!userToken) return fail("Your Page Control connection expired — open Connect and paste a fresh user token.");
    const pages = await getUserPages(userToken);
    const page = pages.find((p) => p.id === mp.pageId);
    if (!page) return fail("That Page wasn’t found on the connected account — open Connect with the right account.");
    const { name } = await validatePageToken(page.id, page.accessToken);
    const meta = await enrich(page.id, page.accessToken);
    await prisma.monitoredPage.update({
      where: { id },
      data: {
        pageName: name,
        accessToken: encryptSecret(page.accessToken),
        status: "Connected",
        lastSyncedAt: new Date(),
        avatarUrl: meta.avatarUrl,
        avatarFetchedAt: new Date(),
        followers: meta.followers ?? undefined,
      },
    });
    revalidatePath("/admin/page-control");
    revalidatePath(`/admin/page-control/${id}`);
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof FacebookApiError) return fail(e.message);
    return fail(e instanceof Error ? e.message : "Couldn’t reconnect this page.");
  }
}

/** Stop monitoring a page — deletes the MonitoredPage (and its cached posts via
 *  cascade). Has NO effect on the farm. */
export async function removeMonitoredPage(id: string): Promise<ActionResult> {
  await requireAdmin();
  try {
    await prisma.monitoredPage.delete({ where: { id } });
    revalidatePath("/admin/page-control");
    return { ok: true, data: undefined };
  } catch {
    return fail("Couldn’t remove this page.");
  }
}
