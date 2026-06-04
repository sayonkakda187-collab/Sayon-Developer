import "server-only";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Server-only store for AdsKeeper publisher API credentials. The API key/token is
// saved ENCRYPTED at rest (AES-256-GCM) in AppSetting and only decrypted here on
// the server — NEVER returned to the browser. The optional Client/Publisher ID is
// non-secret (plain). Both have an env fallback (ADSKEEPER_API_KEY /
// ADSKEEPER_CLIENT_ID) so they can be set in Vercel instead.

const API_KEY_SETTING = "adskeeper_api_key";
const CLIENT_ID_SETTING = "adskeeper_client_id";
export const ADSKEEPER_API_KEY_ENV = "ADSKEEPER_API_KEY";
export const ADSKEEPER_CLIENT_ID_ENV = "ADSKEEPER_CLIENT_ID";

export type AdskeeperCreds = { apiKey: string | null; clientId: string | null };

/** Resolve credentials: DB-saved (decrypted) first, then env fallback. Returns
 *  nulls when neither is set. NEVER expose the result to the client. */
export async function getAdskeeperCreds(): Promise<AdskeeperCreds> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [API_KEY_SETTING, CLIENT_ID_SETTING] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  let apiKey: string | null = null;
  const keyRow = byKey.get(API_KEY_SETTING);
  if (keyRow?.value) {
    try {
      apiKey = keyRow.encrypted ? decryptSecret(keyRow.value) : keyRow.value;
    } catch {
      apiKey = null; // corrupt/rotated key → fall through to env
    }
  }
  let clientId = byKey.get(CLIENT_ID_SETTING)?.value || null;

  apiKey = apiKey || process.env[ADSKEEPER_API_KEY_ENV]?.trim() || null;
  clientId = clientId || process.env[ADSKEEPER_CLIENT_ID_ENV]?.trim() || null;
  return { apiKey, clientId };
}

/** Save (encrypt) the API key. Empty string clears it. */
export async function saveAdskeeperApiKey(raw: string): Promise<void> {
  const key = raw.trim();
  if (!key) {
    await prisma.appSetting.deleteMany({ where: { key: API_KEY_SETTING } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key: API_KEY_SETTING },
    update: { value: encryptSecret(key), encrypted: true },
    create: { key: API_KEY_SETTING, value: encryptSecret(key), encrypted: true },
  });
}

/** Save the (non-secret) Client/Publisher ID. Empty string clears it. */
export async function saveAdskeeperClientId(raw: string): Promise<void> {
  const id = raw.trim();
  if (!id) {
    await prisma.appSetting.deleteMany({ where: { key: CLIENT_ID_SETTING } });
    return;
  }
  await prisma.appSetting.upsert({
    where: { key: CLIENT_ID_SETTING },
    update: { value: id, encrypted: false },
    create: { key: CLIENT_ID_SETTING, value: id, encrypted: false },
  });
}

export type AdskeeperStatus = {
  keySource: "db" | "env" | "none";
  clientIdSource: "db" | "env" | "none";
  configured: boolean;
  apiKeyEnv: string;
  clientIdEnv: string;
};

/** Configured status for the Settings UI (no key values ever leak). */
export async function getAdskeeperStatus(): Promise<AdskeeperStatus> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [API_KEY_SETTING, CLIENT_ID_SETTING] } },
    select: { key: true },
  });
  const saved = new Set(rows.map((r) => r.key));
  const keySource = saved.has(API_KEY_SETTING)
    ? "db"
    : process.env[ADSKEEPER_API_KEY_ENV]?.trim()
      ? "env"
      : "none";
  const clientIdSource = saved.has(CLIENT_ID_SETTING)
    ? "db"
    : process.env[ADSKEEPER_CLIENT_ID_ENV]?.trim()
      ? "env"
      : "none";
  return {
    keySource,
    clientIdSource,
    configured: keySource !== "none",
    apiKeyEnv: ADSKEEPER_API_KEY_ENV,
    clientIdEnv: ADSKEEPER_CLIENT_ID_ENV,
  };
}
