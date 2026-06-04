import "server-only";

import { getAdskeeperCreds } from "./settings";
import type { AdskeeperEarnings, EarningsRange, EarningsResult } from "./types";

// AdsKeeper publisher REST API client. All calls are server-side; the API key is
// decrypted by getAdskeeperCreds() and sent only to AdsKeeper — never to the
// browser, never logged. Responses are cached in-process (30 min) so repeated
// dashboard loads don't hammer the API; the Refresh button forces a fresh call.

const RANGE_LABEL: Record<EarningsRange, string> = {
  today: "Today",
  last7: "Last 7 days",
  last30: "Last 30 days",
  thisMonth: "This month",
};

// AdsKeeper/MGID dateInterval vocabulary (confirmed from the docs).
const RANGE_INTERVAL: Record<EarningsRange, string> = {
  today: "today",
  last7: "last7Days",
  last30: "last30Days",
  thisMonth: "thisMonth",
};

export class AdskeeperError extends Error {
  readonly expired: boolean;
  constructor(message: string, expired = false) {
    super(message);
    this.name = "AdskeeperError";
    this.expired = expired;
  }
}

// ── tiny defensive helpers (tolerant of exact API field names) ───────────────
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

/* ─────────────────────────────────────────────────────────────────────────────
 * ⚠️  WIRE-UP POINT — VERIFY THESE AGAINST YOUR ADSKEEPER DOCS  ⚠️
 *
 * Confirmed from the AdsKeeper/MGID publisher API docs:
 *   • Base: https://api.adskeeper.com/v1/{module}/{controller}/{action}
 *   • Auth: a 32-char token sent as  Authorization: Bearer {token}
 *   • JSON by default; a website-custom-report style report taking dateInterval
 *     (e.g. last30Days), dimensions (date, website) and metrics (revenue, clicks,
 *     impressions, …). 401/403 = bad token.
 *
 * The exact report PATH and metric FIELD NAMES are the only unknowns. They are
 * isolated here and overridable via env (no redeploy of logic needed):
 *   ADSKEEPER_API_BASE     – default https://api.adskeeper.com/v1
 *   ADSKEEPER_REPORT_PATH  – default below; "{clientId}" is substituted if set
 * mapReport() already accepts several common field-name variants, so once the
 * path is right the metrics should populate. Everything else (UI, caching,
 * states) is independent of this block.
 * ────────────────────────────────────────────────────────────────────────── */
const API_BASE = (process.env.ADSKEEPER_API_BASE || "https://api.adskeeper.com/v1").replace(/\/+$/, "");
const REPORT_PATH = process.env.ADSKEEPER_REPORT_PATH || "publishers/dashboard/website-custom-report";

async function fetchReport(range: EarningsRange): Promise<AdskeeperEarnings> {
  const { apiKey, clientId } = await getAdskeeperCreds();
  if (!apiKey) throw new AdskeeperError("AdsKeeper API key is not configured.");

  const path = REPORT_PATH.replace(/\{clientId\}/g, clientId ? encodeURIComponent(clientId) : "").replace(/^\/+/, "");
  const params = new URLSearchParams({
    dateInterval: RANGE_INTERVAL[range],
    dimensions: "date,website",
    metrics: "revenue,impressions,clicks,ctr,epc",
    format: "json",
  });
  if (clientId) params.set("clientId", clientId);
  const url = `${API_BASE}/${path}?${params.toString()}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw new AdskeeperError(
      e instanceof Error && e.name === "AbortError"
        ? "AdsKeeper did not respond in time. Try again."
        : "Could not reach AdsKeeper. Check your connection and try again.",
    );
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    throw new AdskeeperError("AdsKeeper token expired or invalid — reconnect in Settings.", true);
  }
  if (res.status === 429) {
    throw new AdskeeperError("AdsKeeper rate limit reached — wait a few minutes and try again.");
  }
  if (!res.ok) {
    throw new AdskeeperError(`AdsKeeper request failed (HTTP ${res.status}). Verify the endpoint/credentials in Settings.`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new AdskeeperError("AdsKeeper returned a non-JSON response — verify the endpoint path.");
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
    const r = num(pick(row, ["revenue", "income", "earnings", "earned", "amount", "spent"]));
    const imp = num(pick(row, ["impressions", "imps", "shows", "views", "pageViews"]));
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

  // Optional balance toward payout, if the envelope exposes one.
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

// ── in-process cache (30 min) — avoids hammering AdsKeeper on every load ──────
type CacheEntry = { at: number; data: AdskeeperEarnings };
const CACHE = new Map<EarningsRange, CacheEntry>();
const TTL_MS = 30 * 60 * 1000;

/** Clear the cache (call after credentials change so new keys take effect). */
export function clearEarningsCache(): void {
  CACHE.clear();
}

/** Cached earnings for a range. `force` bypasses the cache (Refresh button). */
export async function getEarnings(range: EarningsRange, opts?: { force?: boolean }): Promise<EarningsResult> {
  const { apiKey } = await getAdskeeperCreds();
  if (!apiKey) return { configured: false };

  const hit = CACHE.get(range);
  if (!opts?.force && hit && Date.now() - hit.at < TTL_MS) {
    return { ok: true, data: { ...hit.data, cached: true } };
  }
  try {
    const data = await fetchReport(range);
    CACHE.set(range, { at: Date.now(), data });
    return { ok: true, data };
  } catch (e) {
    // On a transient error, serve slightly-stale cache if we have it.
    if (hit) return { ok: true, data: { ...hit.data, cached: true } };
    if (e instanceof AdskeeperError) return { ok: false, error: e.message, expired: e.expired };
    return { ok: false, error: e instanceof Error ? e.message : "Couldn’t load AdsKeeper earnings." };
  }
}
