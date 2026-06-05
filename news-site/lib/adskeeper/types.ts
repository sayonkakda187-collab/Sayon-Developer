// Shared AdsKeeper types. No "server-only" here so client components can import
// these for type-only usage. All runtime AdsKeeper API calls live in ./client
// (server-only); credential storage lives in ./settings (server-only).

export type EarningsRange = "today" | "last7" | "last30" | "thisMonth";

export type EarningsTotals = {
  revenue: number; // AdsKeeper "wage" metric
  impressions: number;
  clicks: number;
  ctr: number; // percent
  ecpm: number; // revenue per 1000 impressions
  cpc: number; // revenue per click (AdsKeeper "cpc")
};

export type DailyPoint = { date: string; revenue: number };

export type SiteBreakdown = { name: string; revenue: number; impressions: number; clicks: number };

export type AdskeeperEarnings = {
  range: EarningsRange;
  rangeLabel: string;
  currency: string;
  totals: EarningsTotals;
  series: DailyPoint[];
  sites: SiteBreakdown[];
  /** Amount earned toward payout, if the API exposes a balance; else null. */
  balance: number | null;
  payoutTarget: number; // AdsKeeper minimum payout ($100)
  fetchedAt: string;
  /** True when served from the in-memory cache rather than a fresh API call. */
  cached: boolean;
};

export type EarningsResult =
  | { ok: true; data: AdskeeperEarnings }
  | { ok: false; error: string; expired?: boolean }
  | { configured: false };

/** Result of the Settings "Test connection" probe (never carries the token). */
export type AuthProbe =
  | {
      ok: true;
      mode: "login" | "token";
      authPath?: string;
      authId: string | null;
      headerVariant?: "bearer" | "raw"; // token mode: which Authorization header worked
      sampleRevenue?: number; // token mode: revenue from the small probe report
      currency?: string;
    }
  | {
      ok: false;
      mode: "login" | "token" | "none";
      error: string;
      tried?: string[]; // login mode: auth endpoints tried
      httpStatus?: number; // token mode: exact HTTP status AdsKeeper returned
      responseBody?: string; // token mode: exact response body (for support)
      headerVariant?: "bearer" | "raw";
      authId?: string | null;
    };

export const EARNINGS_RANGES: { id: EarningsRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "last7", label: "7 days" },
  { id: "last30", label: "30 days" },
  { id: "thisMonth", label: "This month" },
];
