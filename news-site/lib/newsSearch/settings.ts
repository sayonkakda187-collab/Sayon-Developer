import "server-only";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Server-only settings store for the News Search feature. API keys are saved in
// the AppSetting table ENCRYPTED at rest (AES-256-GCM) and only ever decrypted
// here on the server — never returned to the browser. Each key also has an env
// fallback so it can be set in Vercel instead.

export type NewsSearchProviderId = "serpapi" | "newsapi";

export type ProviderMeta = {
  id: NewsSearchProviderId;
  label: string;
  site: string;
  envVar: string;
  settingKey: string; // AppSetting.key for the saved key
  paidNote: string;
};

export const NEWS_SEARCH_PROVIDERS: ProviderMeta[] = [
  {
    id: "serpapi",
    label: "SerpApi (Google News)",
    site: "serpapi.com",
    envVar: "SERPAPI_KEY",
    settingKey: "serpapi_key",
    paidNote: "Paid — ~100 free searches trial, then a paid plan is required.",
  },
  {
    id: "newsapi",
    label: "NewsAPI.org",
    site: "newsapi.org",
    envVar: "NEWSAPI_KEY",
    settingKey: "newsapi_key",
    paidNote: "Free tier is DEVELOPMENT-ONLY (not allowed on a live site) — production needs the paid plan.",
  },
];

const PROVIDER_SETTING_KEY = "news_search_provider";
const DEFAULT_PROVIDER: NewsSearchProviderId = "serpapi";

function isProvider(v: unknown): v is NewsSearchProviderId {
  return v === "serpapi" || v === "newsapi";
}

/** The currently-active provider (DB setting → default). */
export async function getActiveProvider(): Promise<NewsSearchProviderId> {
  const row = await prisma.appSetting.findUnique({ where: { key: PROVIDER_SETTING_KEY } });
  return isProvider(row?.value) ? (row!.value as NewsSearchProviderId) : DEFAULT_PROVIDER;
}

export async function setActiveProvider(id: NewsSearchProviderId): Promise<void> {
  if (!isProvider(id)) throw new Error("Invalid provider.");
  await prisma.appSetting.upsert({
    where: { key: PROVIDER_SETTING_KEY },
    update: { value: id, encrypted: false },
    create: { key: PROVIDER_SETTING_KEY, value: id, encrypted: false },
  });
}

/** Resolve a provider's API key: DB-saved (decrypted) first, then env fallback.
 *  Returns null when neither is set. NEVER expose the result to the client. */
export async function resolveProviderKey(id: NewsSearchProviderId): Promise<string | null> {
  const meta = NEWS_SEARCH_PROVIDERS.find((p) => p.id === id);
  if (!meta) return null;
  const row = await prisma.appSetting.findUnique({ where: { key: meta.settingKey } });
  if (row?.value) {
    try {
      return row.encrypted ? decryptSecret(row.value) : row.value;
    } catch {
      // Corrupt/old ciphertext (e.g. key rotated) — fall through to env.
    }
  }
  const fromEnv = process.env[meta.envVar];
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : null;
}

/** Save (encrypt) a provider key. Empty string clears the saved key. */
export async function saveProviderKey(id: NewsSearchProviderId, rawKey: string): Promise<void> {
  const meta = NEWS_SEARCH_PROVIDERS.find((p) => p.id === id);
  if (!meta) throw new Error("Invalid provider.");
  const key = rawKey.trim();
  if (!key) {
    await prisma.appSetting.deleteMany({ where: { key: meta.settingKey } });
    return;
  }
  const value = encryptSecret(key);
  await prisma.appSetting.upsert({
    where: { key: meta.settingKey },
    update: { value, encrypted: true },
    create: { key: meta.settingKey, value, encrypted: true },
  });
}

export type ProviderStatus = {
  id: NewsSearchProviderId;
  label: string;
  site: string;
  envVar: string;
  paidNote: string;
  /** "db" = saved key in DB, "env" = from env var, "none" = not set. */
  source: "db" | "env" | "none";
  /** A non-reversible masked hint (e.g. "••••… set"), never the key itself. */
  configured: boolean;
};

/** Per-provider configured status for the Settings UI (no key values leak). */
export async function getProviderStatuses(): Promise<ProviderStatus[]> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: NEWS_SEARCH_PROVIDERS.map((p) => p.settingKey) } },
    select: { key: true },
  });
  const savedKeys = new Set(rows.map((r) => r.key));
  return NEWS_SEARCH_PROVIDERS.map((p) => {
    const inDb = savedKeys.has(p.settingKey);
    const inEnv = Boolean(process.env[p.envVar]?.trim());
    const source: ProviderStatus["source"] = inDb ? "db" : inEnv ? "env" : "none";
    return {
      id: p.id,
      label: p.label,
      site: p.site,
      envVar: p.envVar,
      paidNote: p.paidNote,
      source,
      configured: inDb || inEnv,
    };
  });
}
