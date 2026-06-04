"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { setDefaultAiModel } from "@/lib/aiSettings";
import { isValidModel } from "@/lib/aiModels";
import {
  saveProviderKey,
  setActiveProvider,
  NEWS_SEARCH_PROVIDERS,
  type NewsSearchProviderId,
} from "@/lib/newsSearch/settings";
import { saveAdskeeperApiKey, saveAdskeeperClientId } from "@/lib/adskeeper/settings";
import { clearEarningsCache } from "@/lib/adskeeper/client";

// Server actions for the API Settings page. Each re-checks requireAdmin. Keys
// arrive over POST, are encrypted at rest, and are NEVER returned to the client.

function isProviderId(v: unknown): v is NewsSearchProviderId {
  return NEWS_SEARCH_PROVIDERS.some((p) => p.id === v);
}

export async function saveNewsApiKey(
  provider: string,
  rawKey: string,
): Promise<{ ok: true; cleared: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  if (!isProviderId(provider)) return { ok: false, error: "Unknown provider." };
  try {
    await saveProviderKey(provider, rawKey);
    revalidatePath("/admin/settings");
    return { ok: true, cleared: rawKey.trim().length === 0 };
  } catch (e) {
    // Most likely: ENCRYPTION_KEY/AUTH_SECRET missing in production.
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save the key." };
  }
}

export async function chooseNewsProvider(
  provider: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  if (!isProviderId(provider)) return { ok: false, error: "Unknown provider." };
  await setActiveProvider(provider);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/trending");
  return { ok: true };
}

// ── AdsKeeper API credentials ────────────────────────────────────────────────

export async function saveAdskeeperKey(
  rawKey: string,
): Promise<{ ok: true; cleared: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await saveAdskeeperApiKey(rawKey);
    clearEarningsCache(); // new key takes effect immediately
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return { ok: true, cleared: rawKey.trim().length === 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save the AdsKeeper key." };
  }
}

export async function saveAdskeeperClient(
  rawId: string,
): Promise<{ ok: true; cleared: boolean } | { ok: false; error: string }> {
  await requireAdmin();
  try {
    await saveAdskeeperClientId(rawId);
    clearEarningsCache();
    revalidatePath("/admin/settings");
    revalidatePath("/admin");
    return { ok: true, cleared: rawId.trim().length === 0 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save the Client ID." };
  }
}

// ── Admin profile picture (avatar) ───────────────────────────────────────────

// Only accept our own upload outputs: a Vercel Blob URL or the local /uploads
// fallback. Prevents storing an arbitrary external URL on the user row.
const BLOB_HOST_RE = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

/** Set or clear (null) the signed-in admin's avatar. The image is uploaded via
 *  /api/admin/upload first; here we only persist the resulting URL. */
export async function updateAdminAvatar(
  url: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await getSessionUser();
  if (!user) return { ok: false, error: "Not signed in." };

  let value: string | null = null;
  if (url) {
    const u = url.trim();
    if (!BLOB_HOST_RE.test(u) && !u.startsWith("/uploads/")) {
      return { ok: false, error: "Invalid image URL." };
    }
    value = u;
  }

  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: value } });
  revalidatePath("/admin", "layout"); // refresh the avatar across the admin shell
  return { ok: true };
}

// ── Default AI Assistant model ───────────────────────────────────────────────

/** Set the account-wide default AI model (the AI Assist panels' default). */
export async function updateDefaultAiModel(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!isValidModel(id)) return { ok: false, error: "Unknown model." };
  try {
    await setDefaultAiModel(id);
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t save the model." };
  }
}
