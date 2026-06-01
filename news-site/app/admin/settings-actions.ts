"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import {
  saveProviderKey,
  setActiveProvider,
  NEWS_SEARCH_PROVIDERS,
  type NewsSearchProviderId,
} from "@/lib/newsSearch/settings";

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
