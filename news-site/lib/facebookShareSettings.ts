import "server-only";

import { prisma } from "@/lib/db";
import {
  type FbShareSettings,
  DEFAULT_FB_SHARE_SETTINGS,
  normalizeFbShareSettings,
} from "@/lib/facebookShareTemplates";

// Global Facebook share-mode settings (default mode + photo caption/comment
// templates), stored as one JSON AppSetting row (non-secret).

const KEY = "fb_share_settings";

export async function getFbShareSettings(): Promise<FbShareSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return DEFAULT_FB_SHARE_SETTINGS;
  try {
    return normalizeFbShareSettings(JSON.parse(row.value) as Partial<FbShareSettings>);
  } catch {
    return DEFAULT_FB_SHARE_SETTINGS;
  }
}

export async function saveFbShareSettings(s: FbShareSettings): Promise<void> {
  const value = JSON.stringify(normalizeFbShareSettings(s));
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value, encrypted: false },
    create: { key: KEY, value, encrypted: false },
  });
}
