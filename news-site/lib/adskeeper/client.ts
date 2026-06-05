import "server-only";

import { getAdskeeperCreds, type AdskeeperCreds } from "./settings";
import type { AdskeeperEarnings, EarningsRange, EarningsResult, AuthProbe } from "./types";

// AdsKeeper publisher REST API client (MGID platform). All calls are server-side;
// secrets are decrypted by getAdskeeperCreds() and sent only to AdsKeeper — never
// to the browser, never logged.
//
// Auth: account login + password are exchanged at the auth function for a
// short-lived 32-char token (cached in-process, auto re-auth on expiry/401). The
// exact auth path is NOT published, so we try a few sensible candidates and lock
// onto the one that returns a token (overridable via ADSKEEPER_AUTH_PATH). A ready
// dashboard token + Client ID is also accepted.
//
// Reporting (documented, verbatim):
//   GET /v1/publishers/{authId}/widget-custom-report
//     ?dateInterval=<today|lastSeven|last30Days|thisMonth|…>
//     &dimensions=<date|domain|…>
//     &metrics=impressions,clicks,ctr,wage,eCpm,cpc   (wage == revenue)
//     &perPage=1000&timeZone=<tz>
// We call it twice per range: dimensions=date (daily chart + totals) and
// dimensions=domain (per-website breakdown). Results cached 30 min.

const API_BASE = (process.env.ADSKEEPER_API_BASE || "https://api.adskeeper.com/v1").replace(/\/+$/, "");
const REPORT_PATH = process.env.ADSKEEPER_REPORT_PATH || "publishers/{authId}/widget-custom-report";
const TIMEZONE = process.env.ADSKEEPER_TIMEZONE || "Asia/Phnom_Penh";
const METRICS = "impressions,clicks,ctr,wage,eCpm,cpc";

const RANGE_LABEL: Record<EarningsRange, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
};

// Map our UI ranges → documented AdsKeeper dateInterval values.
const RANGE_INTERVAL: Record<EarningsRange, string> = {
  today: "today",
  last7: "lastSeven",
  last30: "last30Days",
  thisMonth: "thisMonth",
};

export class AdskeeperError extends Error {
  readonly expired: boolean;
  readonly tried?: string[];
  constructor(message: string, opts?: { expired?: boolean; tried?: string[] }) {
    super(message);
    this.name = "AdskeeperError";
    this.expired = opts?.expired ?? false;
    this.tried = opts?.tried;
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
function rootOf(json: unknown): Record<string, unknown> {
  return json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
}
function rowsOf(json: unknown): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  const r = rootOf(json);
  for (const k of ["data", "rows", "items", "report", "statistics", "result", "records"]) {
    if (Array.isArray(r[k])) return r[k] as Record<string, unknown>[];
  }
  // Some MGID responses key rows by id under `data` → take the values.
  if (r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
    const vals = Object.values(r.data as Record<string, unknown>);
    if (vals.length && typeof vals[0] === "object") return vals as Record<string, unknown>[];
  }
  return [];
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
    /* non-JSON → callers use status */
  }
  return { status: res.status, ok: res.ok, json };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * AUTH FUNCTION — the only undocumented part. The help center says a 32-char
 * token is obtained via a "special API function" but doesn't publish its URL, so
 * we try a small set of candidates and lock onto whichever returns a token. Set
 * ADSKEEPER_AUTH_PATH (+ ADSKEEPER_AUTH_METHOD) to pin it once AdsKeeper support
 * confirms the exact endpoint. The response is parsed defensively for
 * { token, idAuth/authId }.
 * ──────────────────────────────────────────────────────────────────────────── */
const AUTH_CANDIDATES: { path: string; method: "POST" | "GET" }[] = [
  { path: "auth", method: "POST" },
  { path: "token", method: "POST" },
  { path: "auth/login", method: "POST" },
  { path: "login", method: "POST" },
  { path: "publishers/auth", method: "POST" },
  { path: "auth", method: "GET" },
];

async function tryAuthOnce(
  c: { path: string; method: string },
  login: string,
  password: string,
): Promise<{ status: number; token: string | null; idAuth: string | null }> {
  const isGet = c.method.toUpperCase() === "GET";
  const fields: Record<string, string> = { email: login, login, username: login, password };
  const qs = isGet ? `?${new URLSearchParams(fields).toString()}` : "";
  const { status, json } = await fetchJson(`${API_BASE}/${c.path.replace(/^\/+/, "")}${qs}`, {
    method: c.method.toUpperCase(),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: isGet ? undefined : JSON.stringify(fields),
  });
  const root = rootOf(json);
  const nested = rootOf(root.data);
  const token = pick(root, ["token", "access_token", "authToken", "apiToken"]) ?? pick(nested, ["token", "access_token"]);
  const idAuth = pick(root, ["idAuth", "authId", "id", "clientId", "accountId", "client_id"]) ?? pick(nested, ["idAuth", "authId", "id"]);
  return { status, token: token != null ? String(token) : null, idAuth: idAuth != null ? String(idAuth) : null };
}

async function authenticate(login: string, password: string): Promise<{ token: string; idAuth: string | null; authPath: string }> {
  const explicit = process.env.ADSKEEPER_AUTH_PATH?.trim();
  const candidates: { path: string; method: "POST" | "GET" }[] = explicit
    ? [{ path: explicit, method: (process.env.ADSKEEPER_AUTH_METHOD || "POST").toUpperCase() === "GET" ? "GET" : "POST" }]
    : AUTH_CANDIDATES;

  const tried: string[] = [];
  let sawExists = false;
  for (const c of candidates) {
    const label = `${c.method} /${c.path.replace(/^\/+/, "")}`;
    tried.push(label);
    const { status, token, idAuth } = await tryAuthOnce(c, login, password);
    if (status === 200 && token) return { token, idAuth, authPath: label };
    // 4xx (other than 404/405) ⇒ the endpoint exists but creds/params were off.
    if ([400, 401, 403, 409, 422].includes(status)) sawExists = true;
  }
  if (explicit) {
    throw new AdskeeperError(`AdsKeeper auth failed at ${tried[0]} — check your login/password (or fix ADSKEEPER_AUTH_PATH).`, { expired: true, tried });
  }
  if (sawExists) {
    throw new AdskeeperError(
      `AdsKeeper login was rejected (tried ${tried.join(", ")}). Verify your login/password, or set ADSKEEPER_AUTH_PATH to the exact endpoint.`,
      { expired: true, tried },
    );
  }
  throw new AdskeeperError(
    `Couldn't locate the AdsKeeper auth endpoint (tried ${tried.join(", ")}). Ask AdsKeeper support for the publisher auth URL, then set ADSKEEPER_AUTH_PATH / ADSKEEPER_AUTH_METHOD.`,
    { tried },
  );
}

// ── token cache (re-auth on expiry) ──────────────────────────────────────────
type TokenEntry = { credKey: string; token: string; idAuth: string | null; at: number };
let tokenCache: TokenEntry | null = null;
const TOKEN_TTL_MS = 45 * 60 * 1000;

function credKeyOf(c: AdskeeperCreds): string {
  return `${c.login ?? ""}|${(c.password ?? "").length}|${c.apiKey ? "k" : ""}`;
}

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
  if (creds.apiKey) return { token: creds.apiKey, idAuth: creds.clientId };
  throw new AdskeeperError("AdsKeeper is not configured.");
}

// ── reporting ────────────────────────────────────────────────────────────────
function reportUrl(authId: string, dimension: string, interval: string): string {
  const params = new URLSearchParams({
    dateInterval: interval,
    dimensions: dimension,
    metrics: METRICS,
    perPage: "1000",
    timeZone: TIMEZONE,
  });
  const path = REPORT_PATH.replace(/\{authId\}/g, encodeURIComponent(authId)).replace(/^\/+/, "");
  return `${API_BASE}/${path}?${params.toString()}`;
}

function ensureOk(res: { status: number; ok: boolean; json: unknown }): void {
  if (res.status === 401 || res.status === 403) {
    throw new AdskeeperError("AdsKeeper token expired or invalid — reconnect in Settings.", { expired: true });
  }
  if (res.status === 429) {
    throw new AdskeeperError("AdsKeeper rate limit reached — wait a few minutes and try again.");
  }
  if (!res.ok) {
    const msg = res.json && typeof res.json === "object"
      ? String(pick(res.json as Record<string, unknown>, ["error", "message", "errorMessage", "detail"]) ?? "")
      : "";
    throw new AdskeeperError(`AdsKeeper report failed (HTTP ${res.status})${msg ? `: ${msg}` : ""}. Verify the endpoint/credentials in Settings.`);
  }
}

async function fetchReport(range: EarningsRange): Promise<AdskeeperEarnings> {
  const creds = await getAdskeeperCreds();
  let { token, idAuth } = await resolveAuth(creds);
  if (!idAuth) {
    throw new AdskeeperError("AdsKeeper Client ID (idAuth) is required — add it in Settings, or use login + password.");
  }
  const interval = RANGE_INTERVAL[range];
  const get = (dimension: string, tok: string) =>
    fetchJson(reportUrl(idAuth as string, dimension, interval), {
      method: "GET",
      headers: { Authorization: `Bearer ${tok}`, Accept: "application/json" },
    });

  // Date-grouped report → daily chart + totals.
  let dateRes = await get("date", token);
  if ((dateRes.status === 401 || dateRes.status === 403) && creds.login && creds.password) {
    ({ token, idAuth } = await resolveAuth(creds, true)); // token expired → re-auth once
    dateRes = await get("date", token);
  }
  ensureOk(dateRes);

  // Domain-grouped report → per-website breakdown (optional; tolerate failure).
  let siteRows: Record<string, unknown>[] = [];
  try {
    const siteRes = await get("domain", token);
    if (siteRes.ok) siteRows = rowsOf(siteRes.json);
  } catch {
    /* breakdown is optional */
  }

  return buildEarnings(range, rowsOf(dateRes.json), siteRows, dateRes.json);
}

/** Assemble totals + daily series + per-site from the two reports. `wage` is the
 *  revenue metric; CTR/eCPM/CPC are recomputed from summed totals for accuracy. */
function buildEarnings(
  range: EarningsRange,
  dateRows: Record<string, unknown>[],
  siteRows: Record<string, unknown>[],
  dateJson: unknown,
): AdskeeperEarnings {
  let revenue = 0;
  let impressions = 0;
  let clicks = 0;
  const series: { date: string; revenue: number }[] = [];

  for (const row of dateRows) {
    if (!row || typeof row !== "object") continue;
    const w = num(pick(row, ["wage", "revenue", "income", "earnings", "earned"]));
    const imp = num(pick(row, ["impressions", "imps", "pageViews", "views"]));
    const clk = num(pick(row, ["clicks", "click"]));
    revenue += w;
    impressions += imp;
    clicks += clk;
    const date = String(pick(row, ["date", "day", "statDate"]) ?? "").slice(0, 10);
    if (date) series.push({ date, revenue: w });
  }
  series.sort((a, b) => a.date.localeCompare(b.date));

  const sites = siteRows
    .map((row) => ({
      name: String(pick(row, ["domain", "website", "widgetName", "site", "widget"]) ?? "").trim(),
      revenue: num(pick(row, ["wage", "revenue", "income", "earnings"])),
      impressions: num(pick(row, ["impressions", "imps", "pageViews"])),
      clicks: num(pick(row, ["clicks", "click"])),
    }))
    .filter((s) => s.name)
    .sort((a, b) => b.revenue - a.revenue);

  // Fallback: if the date report was empty but sites exist, total from sites.
  if (revenue === 0 && impressions === 0 && clicks === 0 && sites.length) {
    for (const s of sites) {
      revenue += s.revenue;
      impressions += s.impressions;
      clicks += s.clicks;
    }
  }

  const balanceRaw = pick(rootOf(dateJson), ["balance", "availableBalance", "totalBalance", "earningsTotal", "payout"]);
  const balance = balanceRaw != null ? num(balanceRaw) : null;

  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const ecpm = impressions > 0 ? (revenue / impressions) * 1000 : 0;
  const cpc = clicks > 0 ? revenue / clicks : 0;

  return {
    range,
    rangeLabel: RANGE_LABEL[range],
    currency: process.env.ADSKEEPER_CURRENCY || "USD",
    totals: { revenue, impressions, clicks, ctr, ecpm, cpc },
    series,
    sites,
    balance,
    payoutTarget: 100,
    fetchedAt: new Date().toISOString(),
    cached: false,
  };
}

// ── connection probe (powers the Settings "Test connection" button) ──────────
/** Try to authenticate (or validate a token) and report which auth path worked —
 *  without ever returning the token. */
export async function probeAuth(): Promise<AuthProbe> {
  const creds = await getAdskeeperCreds();
  if (creds.login && creds.password) {
    try {
      const got = await authenticate(creds.login, creds.password);
      tokenCache = { credKey: credKeyOf(creds), token: got.token, idAuth: got.idAuth, at: Date.now() };
      return { ok: true, mode: "login", authPath: got.authPath, authId: got.idAuth ?? creds.clientId };
    } catch (e) {
      const err = e instanceof AdskeeperError ? e : null;
      return { ok: false, mode: "login", error: err?.message ?? "AdsKeeper login failed.", tried: err?.tried };
    }
  }
  if (creds.apiKey) {
    if (!creds.clientId) return { ok: false, mode: "token", error: "Add your Client ID (idAuth) to use a ready token." };
    try {
      await fetchReport("today");
      return { ok: true, mode: "token", authId: creds.clientId };
    } catch (e) {
      return { ok: false, mode: "token", error: e instanceof Error ? e.message : "Token validation failed." };
    }
  }
  return { ok: false, mode: "none", error: "AdsKeeper is not configured." };
}

// ── earnings cache (30 min) ──────────────────────────────────────────────────
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
