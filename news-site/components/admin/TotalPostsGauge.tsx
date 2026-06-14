"use client";

import { useEffect, useState } from "react";
import { AnimatedGauge } from "@/components/admin/PageControlCharts";

type State = { count: number | null; capped: boolean; status: string };

/** Smallest "nice" ceiling (1/2/5 × 10ⁿ) ≥ n, for the gauge's full-arc point. */
function niceCeil(n: number): number {
  if (n <= 0) return 1;
  const base = Math.pow(10, Math.floor(Math.log10(n)));
  for (const m of [1, 2, 5]) if (n <= m * base) return m * base;
  return 10 * base;
}

/**
 * Page Control → Summary "Total posts" gauge: a monitored page's all-time published-
 * post count, fetched lazily (cached ~24h server-side) and shown in the animated
 * emerald gauge. Graceful states for loading / unavailable / needs-reconnect. The
 * count is exact when Graph returns a summary total; otherwise it's a capped floor
 * shown as "N+".
 */
export function TotalPostsGauge({ pageDbId, apiBase = "/api/admin/page-control" }: { pageDbId: string; apiBase?: string }) {
  const API = `${apiBase}/total-posts`;
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}?page=${encodeURIComponent(pageDbId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setState(j.ok ? { count: j.count ?? null, capped: Boolean(j.capped), status: j.status } : { count: null, capped: false, status: "error" });
      })
      .catch(() => !cancelled && setState({ count: null, capped: false, status: "error" }));
    return () => {
      cancelled = true;
    };
  }, [pageDbId, API]);

  if (state === null) {
    return (
      <div className="adm-pc-gaugewrap">
        <div className="adm-stat adm-pc-gauge-msg">
          <span className="adm-spinner" aria-hidden /> <span className="adm-gsub">Counting posts…</span>
        </div>
      </div>
    );
  }

  if (state.count == null) {
    return (
      <div className="adm-pc-gaugewrap">
        <div className="adm-stat adm-pc-gauge-msg">
          <div className="adm-glabel">Total posts</div>
          <div className="adm-gsub">{state.status === "reconnect" ? "Needs reconnect" : "Unavailable"}</div>
        </div>
      </div>
    );
  }

  const sub = state.capped ? `${state.count.toLocaleString("en-US")}+ counted` : "all-time";
  return (
    <div className="adm-pc-gaugewrap">
      <AnimatedGauge value={state.count} max={niceCeil(state.count)} label="Total posts" sub={sub} suffix={state.capped ? "+" : ""} />
    </div>
  );
}
