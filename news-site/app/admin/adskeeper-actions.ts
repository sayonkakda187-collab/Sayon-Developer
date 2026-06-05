"use server";

import { requireAdmin } from "@/lib/auth";
import { getEarnings, probeAuth } from "@/lib/adskeeper/client";
import type { EarningsRange, EarningsResult, AuthProbe } from "@/lib/adskeeper/types";

// Admin-only data actions for the dashboard Earnings panel. These return mapped
// metrics only — the AdsKeeper API key is never included in any response.

const VALID: EarningsRange[] = ["today", "last7", "last30", "thisMonth"];
function asRange(v: string): EarningsRange {
  return (VALID as string[]).includes(v) ? (v as EarningsRange) : "last7";
}

/** Cached earnings for the chosen range (served from a 30-min server cache). */
export async function getAdskeeperEarnings(range: string): Promise<EarningsResult> {
  await requireAdmin();
  return getEarnings(asRange(range));
}

/** Force a fresh pull from AdsKeeper, bypassing the cache (Refresh button). */
export async function refreshAdskeeperEarnings(range: string): Promise<EarningsResult> {
  await requireAdmin();
  return getEarnings(asRange(range), { force: true });
}

/** Probe the AdsKeeper connection and report which auth path worked (no secrets
 *  returned). Powers the Settings "Test connection" button. */
export async function testAdskeeperConnection(): Promise<AuthProbe> {
  await requireAdmin();
  return probeAuth();
}
