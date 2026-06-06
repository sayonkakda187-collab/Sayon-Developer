"use client";

import { useMemo } from "react";
import { StatGauge } from "./StatGauge";
import type { FacebookPageView } from "./FacebookPagesManager";

/** Visual gauge fill (0..1) — mirrors the Dashboard tab's stat gauges. */
function frac(value: number, ref: number) {
  if (value <= 0) return 0.04;
  return Math.max(0.08, Math.min(0.96, value / ref));
}

/**
 * Totals summary for the Facebook tab — the same animated gauges as the
 * Dashboard, shown at the TOP of the tab. Derived entirely from the page list
 * already loaded server-side; renders nothing until a Page is connected.
 */
export function FacebookStats({ pages }: { pages: FacebookPageView[] }) {
  const totals = useMemo(() => {
    const connected = pages.filter((p) => p.status === "Connected").length;
    return {
      pages: pages.length,
      connected,
      expired: pages.length - connected,
      groups: new Set(pages.map((p) => p.categoryGroup)).size,
      posted: pages.reduce((s, p) => s + p.postedCount, 0),
      scheduled: pages.reduce((s, p) => s + p.pendingCount, 0),
    };
  }, [pages]);

  if (totals.pages === 0) return null;

  return (
    <div className="adm-stats adm-rise" style={{ animationDelay: "0.04s" }}>
      <StatGauge
        value={totals.pages}
        label="Total Pages"
        sub={`${totals.groups} group${totals.groups === 1 ? "" : "s"}`}
        frac={frac(totals.pages, 12)}
        c1="#34d27b"
        c2="#16a34a"
        gradId="g-fb-pages"
      />
      <StatGauge
        value={totals.connected}
        label="Connected"
        sub={totals.expired > 0 ? `${totals.expired} expired` : "all active"}
        frac={totals.pages ? Math.max(0.08, totals.connected / totals.pages) : 0.04}
        c1="#38bdf8"
        c2="#2563eb"
        gradId="g-fb-connected"
      />
      <StatGauge
        value={totals.posted}
        label="Posts Published"
        sub="all-time to Facebook"
        frac={frac(totals.posted, 50)}
        c1="#fbbf24"
        c2="#f59e0b"
        gradId="g-fb-posted"
      />
      <StatGauge
        value={totals.scheduled}
        label="Scheduled"
        sub={totals.scheduled === 1 ? "post queued" : "posts queued"}
        frac={frac(totals.scheduled, 20)}
        c1="#a78bfa"
        c2="#7c3aed"
        gradId="g-fb-scheduled"
      />
    </div>
  );
}
