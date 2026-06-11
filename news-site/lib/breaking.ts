import "server-only";

import { prisma } from "@/lib/db";

// Site-wide breaking-news banner config, stored as a single JSON AppSetting row
// (non-secret, plain). Read by the public /api/breaking route (CDN-cached ~60s)
// and by the admin settings card. Kept out of page rendering so toggling it never
// uncaches whole pages.

export type Breaking = { enabled: boolean; text: string; link: string };

const KEY = "breaking_banner";
const EMPTY: Breaking = { enabled: false, text: "", link: "" };

export async function getBreaking(): Promise<Breaking> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } });
  if (!row?.value) return EMPTY;
  try {
    const o = JSON.parse(row.value) as Partial<Breaking>;
    return {
      enabled: Boolean(o.enabled),
      text: typeof o.text === "string" ? o.text : "",
      link: typeof o.link === "string" ? o.link : "",
    };
  } catch {
    return EMPTY;
  }
}

export async function setBreaking(b: Breaking): Promise<void> {
  const value = JSON.stringify({
    enabled: Boolean(b.enabled),
    text: b.text.slice(0, 200),
    link: b.link.slice(0, 500),
  });
  await prisma.appSetting.upsert({
    where: { key: KEY },
    update: { value, encrypted: false },
    create: { key: KEY, value, encrypted: false },
  });
}
