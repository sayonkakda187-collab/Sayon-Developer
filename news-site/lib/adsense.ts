import "server-only";

import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/db";

// Master on/off flag for the reserved Google AdSense slot layout (separate from
// the AdsKeeper/MGID system in lib/ads.ts — that one stays exactly as it is).
// Default OFF: when off, the AdSenseSlot components render NOTHING (no gaps).
// Controlled by EITHER an env flag OR an admin AppSetting toggle, whichever is
// truthy. No real <ins class="adsbygoogle"> markup ships until AdSense approval —
// this is layout/structure prep only.

export const ADSENSE_SETTING_KEY = "adsense_slots_enabled";

async function readAdsenseSetting(): Promise<boolean> {
  const row = await prisma.appSetting.findUnique({ where: { key: ADSENSE_SETTING_KEY } });
  return row?.value === "true";
}

// Cache the DB read briefly so rendering many slots across a page is ~one query,
// and an admin toggle takes effect within ~a minute (no redeploy needed).
const cachedSetting = unstable_cache(readAdsenseSetting, ["adsense-slots-enabled"], {
  revalidate: 60,
});

/** Whether the reserved AdSense slots should render (reserving min-height). */
export async function adsenseEnabled(): Promise<boolean> {
  if (process.env.ADSENSE_ENABLED === "true" || process.env.NEXT_PUBLIC_ADSENSE_ENABLED === "true") {
    return true;
  }
  try {
    return await cachedSetting();
  } catch {
    return false; // never let a DB hiccup turn ads on or crash a page
  }
}
