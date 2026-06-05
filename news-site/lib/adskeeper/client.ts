import "server-only";

import { getAdskeeperCreds, type AdskeeperCreds } from "./settings";
import type { AdskeeperEarnings, EarningsRange, EarningsResult } from "./types";

// AdsKeeper publisher REST API client (MGID platform). All calls are server-side;
// secrets are decrypted by getAdskeeperCreds() and sent only to AdsKeeper — never
// to the browser, never logged.
//
// Auth: the account login + password are exchanged at the auth function for a
// short-lived 32-char token (cached in-process, auto re-auth on expiry/401). The
// token is sent as `Authorization: Bearer <token>`. Accounts with a ready
// dashboard token can skip the login step (token + Client ID).
//
// Reporting: GET {base}/goodhits/clients/{idAuth}/statistics-reports with a date
// range + dimensions(date,website) + metrics. Responses are cached 30 min so the
// dashboard doesn't hammer the API; the Refresh button forces a fresh pull.

const API_BASE = (process.env.ADSKEEPER_API_BASE || "https://api.adskeeper.com/v1").replace(/\/+$/, "");

const RANGE_LABEL: Record<EarningsRange, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
};

export class AdskeeperError extends Error {
  readonly expired: boolean;
  constructor(message: string, expired = false) {
    super(message);
    this.name = "AdskeeperError";
    this.expired = expired;
  }
}

// ── defensive helpers (tolerant of exact API field names) ────────────────────
function num(v: unknown): number {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : 0;
  return Number.isFinite(n) ? n : 0;
}
function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] != null) return row[k];
    const found = Object.keys(row).find((rk) => rk.toLowerCase() === k.toLowerCase());
    if (found && row[found] != null) return row[found];
  }
  return undefined;
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 15000): Promise<{ status: number; ok: boolean; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (e) {
    throw new AdskeeperError(
      e instanceof Error && e.name === "AbortError"
        ? "AdsKeeper did not respond in time. Try again."
        : "Could not reach AdsKeeper. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }
  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON handled by callers via status */
  }
  return { status: res.status, ok: res.ok, json };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  AUTH FUNCTION — one wire-up point  ⚠️
 * Confirmed from the MGID/AdsKeeper docs: the auth function takes the account
 * login + password and returns JSON { token: <32 chars>, idAuth: <accountId> };
 * the token expires and must be re-requested. The exact PATH + request field
 * names were the only part not readable verbatim (the help center edge-blocks
 * bots), so they default to the documented form and are env-overridable:
 *   ADSKEEPER_AUTH_PATH    – default "auth/login"
 *   ADSKEEPER_AUTH_METHOD  – default "POST"
 * The response is parsed defensively (token/access_token, idAuth/id/clientId).
 * ──────────────────────────────────────────────────────────────────────────── */
const AUTH_PATH = (process.env.ADSKEEPER_AUTH_PATH || "auth/login").replace(/^\/+/, "");
const AUTH_METHOD = (process.env.ADSKEEPER_AUTH_METHOD || "POST").toUpperCase();

async function authenticate(login: string, password: string): Promise<{ token: string; idAuth: string | null }> {
  const isGet = AUTH_METHOD === "GET";
  // GET form passes credentials as query params; POST form as a JSON body. Both
  // login/email + username keys are sent to cover the field-name variants.
  const qs = isGet ? `?${new URLSearchParams({ login, email: login, username: login, password }).toString()}` : "";
  const { status, json } = await fetchJson(`${API_BASE}/${AUTH_PATH}${qs}`, {
    method: AUTH_METHOD,
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: isGet ? undefined : JSON.stringify({ login, email: login, username: login, password }),
  });

  if (status === 401 || status === 403) {
    throw new AdskeeperError("AdsKeeper login failed — check your login and password in Settings.", true);
  }
  if (status === 404) {
    throw new AdskeeperError("AdsKeeper auth endpoint not found — set ADSKEEPER_AUTH_PATH to the documented path.");
  }
  const root = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const nested = (root.data && typeof root.data === "object" ? root.data : {}) as Record<string, unknown>;
  const token = pick(root, ["token", "access_token", "authToken", "apiToken"]) ?? pick(nested, ["token", "access_token"]);
  const idAuth = pick(root, ["idAuth", "id", "clientId", "accountId", "client_id"]) ?? pick(nested, ["idAuth", "id", "clientId"]);
  if (!token) {
    throw new AdskeeperError("AdsKeeper login did not return a token — verify the auth endpoint/credentials.");
  }
  return { token: String(token), idAuth: idAuth != null ? String(idAuth) : null };
}

// ── token cache (re-auth on expiry) ──────────────────────────────────────────
type TokenEntry = { credKey: string; token: string; idAuth: string | null; at: number };
let tokenCache: TokenEntry | null = null;
const TOKEN_TTL_MS = 45 * 60 * 1000;

function credKeyOf(c: AdskeeperCreds): string {
  return `${c.login ?? ""}|${(c.password ?? "").length}|${c.apiKey ? "k" : ""}`;
}

/** Resolve a usable { token, idAuth }. Uses login→token (cached) when login creds
 *  exist; otherwise a ready API token + Client ID. `force` re-auths. */
async function resolveAuth(creds: AdskeeperCreds, force = false): Promise<{ token: string; idAuth: string | null }> {
  if (creds.login && creds.password) {
    const credKey = credKeyOf(creds);
    if (!force && tokenCache && tokenCache.credKey === credKey && Date.now() - tokenCache.at < TOKEN_TTL_MS) {
      return { token: tokenCache.token, idAuth: tokenCache.idAuth ?? creds.clientId };
    }
    const got = await authenticate(creds.login, creds.password);
    tokenCache = { credKey, token: got.token, idAuth: got.idAuth, at: Date.now() };
    return { token: got.token, idAuth: got.idAuth ?? creds.clientId };
  }
  if (creds.apiKey) {
    return { token: creds.apiKey, idAuth: creds.clientId };
  }
  throw new AdskeeperError("AdsKeeper is not configured.");
}

// ── date ranges (UTC, yyyy-mm-dd) ────────────────────────────────────────────
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function rangeDates(range: EarningsRange): { startDate: string; endDate: string } {
  const now = new Date();
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  if (range === "last7") start.setUTCDate(end.getUTCDate() - 6);
  else if (range === "last30") start.setUTCDate(end.getUTCDate() - 29);
  else if (range === "thisMonth") start.setUTCDate(1);
  // "today" → start == end
  return { startDate: ymd(start), endDate: ymd(end) };
}

const REPORT_PATH = process.env.ADSKEEPER_REPORT_PATH || "goodhits/clients/{idAuth}/statistics-reports";

async function fetchReport(range: EarningsRange): Promise<AdskeeperEarnings> {
  const creds = await getAdskeeperCreds();
  let { token, idAuth } = await resolveAuth(creds);
  if (!idAuth) {
    throw new AdskeeperError("AdsKeeper Client ID (idAuth) is required — add it in Settings, or use login + password auth.");
  }

  const { startDate, endDate } = rangeDates(range);
  const params = new URLSearchParams({
    startDate,
    endDate,
    dateInterval: "custom",
    dimensions: "date,website",
    metrics: "pageViews,clicks,ctr,revenue",
    limit: "1000",
  });
  const buildUrl = (id: string) =>
    `${API_BASE}/${REPORT_PATH.replace(/\{idAuth\}/g, encodeURIComponent(id)).replace(/^\/+/, "")}?${params.toString()}`;

  let { status, ok, json } = await fetchJson(buildUrl(idAuth), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });

  // Token expired → re-auth once (only possible with login creds) and retry.
  if ((status === 401 || status === 403) && creds.login && creds.password) {
    ({ token, idAuth } = await resolveAuth(creds, true));
    ({ status, ok, json } = await fetchJson(buildUrl(idAuth ?? ""), {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    }));
  }

  if (status === 401 || status === 403) {
    throw new AdskeeperError("AdsKeeper token expired or invalid — reconnect in Settings.", true);
  }
  if (status === 429) {
    throw new AdskeeperError("AdsKeeper rate limit reached — wait a few minutes and try again.");
  }
  if (!ok) {
    const msg = typeof json === "object" && json
      ? String(pick(json as Record<string, unknown>, ["error", "message", "errorMessage"]) ?? "")
      : "";
    throw new AdskeeperError(
      `AdsKeeper report failed (HTTP ${status})${msg ? `: ${msg}` : ""}. Verify the endpoint/credentials in Settings.`,
    );
  }
  return mapReport(range, json);
}

/** Aggregate report rows → totals + daily series + per-site breakdown. Tolerant
 *  of the response envelope and exact metric field names. */
function mapReport(range: EarningsRange, json: unknown): AdskeeperEarnings {
  const root = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const rows: Record<string, unknown>[] = Array.isArray(json)
    ? (json as Record<string, unknown>[])
    : Array.isArray(root.data)
      ? (root.data as Record<string, unknown>[])
      : Array.isArray(root.rows)
        ? (root.rows as Record<string, unknown>[])
        : Array.isArray(root.items)
          ? (root.items as Record<string, unknown>[])
          : Array.isArray(root.report)
            ? (root.report as Record<string, unknown>[])
            : Array.isArray(root.statistics)
              ? (root.statistics as Record<string, unknown>[])
              : [];

  const byDate = new Map<string, number>();
  const bySite = new Map<string, { name: string; revenue: number; impressions: number; clicks: number }>();
  let revenue = 0;
  let impressions = 0;
  let clicks = 0;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = num(pick(row, ["revenue", "income", "earnings", "earned", "amount", "adRevenue"]));
    const imp = num(pick(row, ["impressions", "imps", "pageViews", "views", "shows", "viewsWithVisibility"]));
    const clk = num(pick(row, ["clicks", "click"]));
    revenue += r;
    impressions += imp;
    clicks += clk;

    const date = String(pick(row, ["date", "day", "statDate", "period"]) ?? "").slice(0, 10);
    if (date) byDate.set(date, (byDate.get(date) ?? 0) + r);

    const site = String(pick(row, ["website", "site", "siteName", "domain", "widget", "widgetName"]) ?? "").trim();
    if (site) {
      const cur = bySite.get(site) ?? { name: site, revenue: 0, impressions: 0, clicks: 0 };
      cur.revenue += r;
      cur.impressions += imp;
      cur.clicks += clk;
      bySite.set(site, cur);
    }
  }

  const balanceRaw = pick(root, ["balance", "availableBalance", "totalBalance", "earningsTotal", "payout"]);
  const balance = balanceRaw != null ? num(balanceRaw) : null;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
  const epc = clicks > 0 ? revenue / clicks : 0;

  const series = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, rev]) => ({ date, revenue: rev }));
  const sites = [...bySite.values()].sort((a, b) => b.revenue - a.revenue);

  return {
    range,
    rangeLabel: RANGE_LABEL[range],
    currency: process.env.ADSKEEPER_CURRENCY || "USD",
    totals: { revenue, impressions, clicks, ctr, ecpm, epc },
    series,
    sites,
    balance,
    payoutTarget: 100,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

// ── earnings cache (30 min) — avoids hammering AdsKeeper on every load ────────
type CacheEntry = { at: number; data: AdskeeperEarnings };
const CACHE = new Map<EarningsRange, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

/** Clear cached earnings + token (call after credentials change). */
export function clearEarningsCache(): void {
  CACHE.clear();
  tokenCache = null;
}

/** Cached earnings for a range. `force` bypasses the cache (Refresh button). */
export async function getEarnings(range: EarningsRange, opts?: { force?: boolean }): Promise<EarningsResult> {
  const { apiKey, login, password } = await getAdskeeperCreds();
  if (!apiKey && !(login && password)) return { configured: false };

  const hit = CACHE.get(range);
  if (!opts?.force && hit && Date.now() - hit.at < TTL_MS) {
    return { ok: true, data: { ...hit.data, cached: true } };
  }
  try {
    const data = await fetchReport(range);
    CACHE.set(range, { at: Date.now(), data });
    return { ok: true, data };
  } catch (e) {
    if (hit) return { ok: true, data: { ...hit.data, cached: true } }; // serve stale on transient error
    if (e instanceof AdskeeperError) return { ok: false, error: e.message, expired: e.expired };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t load AdsKeeper earnings." };
  }
}
