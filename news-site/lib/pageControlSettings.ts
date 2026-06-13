import "server-only";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Page Control's OWN Facebook connection credentials, stored under dedicated
// `pc_*` AppSetting keys — completely separate from the posting farm's
// `facebook_*` keys, so Page Control can watch a DIFFERENT Facebook account
// without touching the farm. The App Secret + long-lived user token are ENCRYPTED
// at rest and only ever decrypted server-side. App ID/Secret fall back to the
// shared env vars (the App is just the API client; the USER TOKEN identifies the
// account) — but the user token itself is Page-Control-specific (no env fallback).

const APP_ID_KEY = "pc_fb_app_id";
const APP_SECRET_KEY = "pc_fb_app_secret";
const USER_TOKEN_KEY = "pc_fb_user_token";
const USER_TOKEN_EXPIRES_KEY = "pc_fb_user_token_expires_at";

export async function getPageControlAppCreds(): Promise<{ appId: string | null; appSecret: string | null }> {
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [APP_ID_KEY, APP_SECRET_KEY] } } });
  const byKey = new Map(rows.map((r) => [r.key, r]));
  let appId = byKey.get(APP_ID_KEY)?.value || null;
  let appSecret: string | null = null;
  const secretRow = byKey.get(APP_SECRET_KEY);
  if (secretRow?.value) {
    try {
      appSecret = secretRow.encrypted ? decryptSecret(secretRow.value) : secretRow.value;
    } catch {
      appSecret = null; // corrupt/rotated key → fall through to env
    }
  }
  appId = appId || process.env.FACEBOOK_APP_ID || null;
  appSecret = appSecret || process.env.FACEBOOK_APP_SECRET || null;
  return { appId, appSecret };
}

export async function savePageControlAppCreds(input: { appId: string; appSecret: string }): Promise<void> {
  const appId = input.appId.trim();
  const appSecret = input.appSecret.trim();
  if (!appId || !appSecret) throw new Error("App ID and App Secret are both required.");
  await prisma.appSetting.upsert({
    where: { key: APP_ID_KEY },
    update: { value: appId, encrypted: false },
    create: { key: APP_ID_KEY, value: appId, encrypted: false },
  });
  await prisma.appSetting.upsert({
    where: { key: APP_SECRET_KEY },
    update: { value: encryptSecret(appSecret), encrypted: true },
    create: { key: APP_SECRET_KEY, value: encryptSecret(appSecret), encrypted: true },
  });
}

export async function savePageControlUserToken(token: string, expiresInSeconds?: number): Promise<void> {
  await prisma.appSetting.upsert({
    where: { key: USER_TOKEN_KEY },
    update: { value: encryptSecret(token), encrypted: true },
    create: { key: USER_TOKEN_KEY, value: encryptSecret(token), encrypted: true },
  });
  const expiresAt =
    expiresInSeconds && expiresInSeconds > 0 ? new Date(Date.now() + expiresInSeconds * 1000).toISOString() : "";
  await prisma.appSetting.upsert({
    where: { key: USER_TOKEN_EXPIRES_KEY },
    update: { value: expiresAt, encrypted: false },
    create: { key: USER_TOKEN_EXPIRES_KEY, value: expiresAt, encrypted: false },
  });
}

export async function getPageControlUserToken(): Promise<string | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: USER_TOKEN_KEY } });
  if (!row?.value) return null;
  try {
    return row.encrypted ? decryptSecret(row.value) : row.value;
  } catch {
    return null;
  }
}

/** Non-secret connection status for the UI (values never leak to the browser). */
export async function getPageControlConnectStatus(): Promise<{
  appConfigured: boolean;
  userTokenSaved: boolean;
  userTokenExpiresAt: string | null;
}> {
  const { appId, appSecret } = await getPageControlAppCreds();
  const rows = await prisma.appSetting.findMany({ where: { key: { in: [USER_TOKEN_KEY, USER_TOKEN_EXPIRES_KEY] } } });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const expires = byKey.get(USER_TOKEN_EXPIRES_KEY);
  return {
    appConfigured: Boolean(appId && appSecret),
    userTokenSaved: byKey.has(USER_TOKEN_KEY),
    userTokenExpiresAt: expires ? expires : null,
  };
}
