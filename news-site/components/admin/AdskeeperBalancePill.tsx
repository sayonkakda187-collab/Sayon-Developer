"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getAdskeeperEarnings } from "@/app/admin/adskeeper-actions";
import { CoinsIcon } from "@/components/admin/icons";

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n || 0);
}

/**
 * Compact AdsKeeper balance pill for the admin top bar (next to the theme
 * toggle). Self-fetching this month's earnings; renders ONLY when AdsKeeper is
 * configured AND there's money — otherwise nothing, so the header stays clean.
 * Tapping it opens the dashboard (the full Ad Earnings panel). Server-cached
 * 30 min, so it doesn't hit AdsKeeper on every page.
 */
export function AdskeeperBalancePill() {
  const [bal, setBal] = useState<{ amount: number; currency: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAdskeeperEarnings("thisMonth")
      .then((res) => {
        if (cancelled || !("ok" in res) || !res.ok) return;
        // Prefer an API balance if exposed; otherwise this month's revenue.
        const amount = res.data.balance != null ? res.data.balance : res.data.totals.revenue;
        if (amount > 0) setBal({ amount, currency: res.data.currency });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!bal) return null;

  return (
    <Link href="/admin" className="adm-balance-pill" title="AdsKeeper earnings this month — open the dashboard">
      <CoinsIcon className="h-4 w-4" aria-hidden />
      <span>{money(bal.amount, bal.currency)}</span>
    </Link>
  );
}
