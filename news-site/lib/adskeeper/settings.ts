import "server-only";

import { prisma } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// Server-only store for AdsKeeper publisher API credentials. AdsKeeper uses the
// MGID REST platform: you authenticate with your account LOGIN + PASSWORD against
// the auth function, which returns a short-lived 32-char token (see ./client).
// Some accounts can instead paste a ready API TOKEN + Client/Publisher ID.
//
// Secrets (password, API token) are saved ENCRYPTED at rest (AES-256-GCM) in
// AppSetting and only decrypted here on the server — NEVER returned to the
// browser. Login + Client ID are non-secret (plain). Everything has an env
// fallback so it can live in Vercel instead. A saved DB value beats env.

const API_KEY_SETTING = "adskeeper_api_key"; // ready API token (encrypted)
const LOGIN_SETTING = "adskeeper_login"; // account login / email (plain)
const PASSWORD_SETTING = "adskeeper_password"; // account password (encrypted)
const CLIENT_ID_SETTING = "adskeeper_client_id"; // idAuth / client id (plain)

export const ADSKEEPER_ENV = {
  apiKey: "ADSKEEPER_API_KEY",
  login: "ADSKEEPER_LOGIN",
  password: "ADSKEEPER_PASSWORD",
  clientId: "ADSKEEPER_CLIENT_ID",
} as const;

export type AdskeeperCreds = {
  apiKey: string | null; // ready token (skips the login step)
  login: string | null;
  password: string | null;
  clientId: string | null; // idAuth (required for the stats path when using a token)
};

function decrypt(row: { value: string; encrypted: boolean } | null): string | null {
  if (!row?.value) return null;
  try {
    return row.encrypted ? decryptSecret(row.value) : row.value;
  } catch {
    return null; // corrupt/rotated ciphertext → treat as unset
  }
}

/** Resolve all credentials: DB-saved (decrypted) first, then env fallback.
 *  NEVER expose the result to the client. */
export async function getAdskeeperCreds(): Promise<AdskeeperCreds> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [API_KEY_SETTING, LOGIN_SETTING, PASSWORD_SETTING, CLIENT_ID_SETTING] } },
  });
  const byKey = new Map(rows.map((r) => [r.key, r]));

  const apiKey = decrypt(byKey.get(API_KEY_SETTING) ?? null) || process.env[ADSKEEPER_ENV.apiKey]?.trim() || null;
  const login = (byKey.get(LOGIN_SETTING)?.value || null) || process.env[ADSKEEPER_ENV.login]?.trim() || null;
  const password = decrypt(byKey.get(PASSWORD_SETTING) ?? null) || process.env[ADSKEEPER_ENV.password]?.trim() || null;
  const clientId = (byKey.get(CLIENT_ID_SETTING)?.value || null) || process.env[ADSKEEPER_ENV.clientId]?.trim() || null;

  return { apiKey, login, password, clientId };
}

/** Save (encrypt) a ready API token. Empty string clears it. */
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

/** Save the account login + password used by the auth function. The password is
 *  encrypted. Passing a blank password keeps any already-saved one (so the login
 *  can be edited without retyping). Blank login AND password clears both. */
export async function saveAdskeeperLoginCreds(rawLogin: string, rawPassword: string): Promise<void> {
  const login = rawLogin.trim();
  const password = rawPassword.trim();

  if (!login && !password) {
    await prisma.appSetting.deleteMany({ where: { key: { in: [LOGIN_SETTING, PASSWORD_SETTING] } } });
    return;
  }
  if (login) {
    await prisma.appSetting.upsert({
      where: { key: LOGIN_SETTING },
      update: { value: login, encrypted: false },
      create: { key: LOGIN_SETTING, value: login, encrypted: false },
    });
  }
  if (password) {
    await prisma.appSetting.upsert({
      where: { key: PASSWORD_SETTING },
      update: { value: encryptSecret(password), encrypted: true },
      create: { key: PASSWORD_SETTING, value: encryptSecret(password), encrypted: true },
    });
  }
}

/** Save the (non-secret) Client/Publisher ID (idAuth). Empty string clears it. */
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

type Source = "db" | "env" | "none";
export type AdskeeperStatus = {
  /** "login" = login+password set, "token" = API token set, "none" = unset. */
  authMode: "login" | "token" | "none";
  tokenSource: Source;
  loginSource: Source;
  passwordSource: Source;
  clientIdSource: Source;
  configured: boolean;
  env: typeof ADSKEEPER_ENV;
};

/** Configured status for the Settings UI (no secret values ever leak). */
export async function getAdskeeperStatus(): Promise<AdskeeperStatus> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [API_KEY_SETTING, LOGIN_SETTING, PASSWORD_SETTING, CLIENT_ID_SETTING] } },
    select: { key: true },
  });
  const saved = new Set(rows.map((r) => r.key));
  const src = (settingKey: string, envVar: string): Source =>
    saved.has(settingKey) ? "db" : process.env[envVar]?.trim() ? "env" : "none";

  const tokenSource = src(API_KEY_SETTING, ADSKEEPER_ENV.apiKey);
  const loginSource = src(LOGIN_SETTING, ADSKEEPER_ENV.login);
  const passwordSource = src(PASSWORD_SETTING, ADSKEEPER_ENV.password);
  const clientIdSource = src(CLIENT_ID_SETTING, ADSKEEPER_ENV.clientId);

  const hasLogin = loginSource !== "none" && passwordSource !== "none";
  const hasToken = tokenSource !== "none";
  const authMode = hasLogin ? "login" : hasToken ? "token" : "none";

  return {
    authMode,
    tokenSource,
    loginSource,
    passwordSource,
    clientIdSource,
    configured: authMode !== "none",
    env: ADSKEEPER_ENV,
  };
}
