"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatNumber } from "@/lib/site";
import { CoinsIcon, RefreshIcon } from "@/components/admin/icons";
import { getAdskeeperEarnings, refreshAdskeeperEarnings } from "@/app/admin/adskeeper-actions";
import {
  EARNINGS_RANGES,
  type AdskeeperEarnings,
  type EarningsRange,
  type EarningsResult,
} from "@/lib/adskeeper/types";

function money(n: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 2 }).format(n || 0);
}

/**
 * Dashboard "Ad Earnings" panel. Self-contained: fetches its own data via a
 * server action on mount / range change / refresh, so the dashboard loads
 * instantly and this fills in. Shows tidy not-set-up, error, and no-data states.
 * All AdsKeeper calls + the API key stay server-side.
 */
export function AdskeeperPanel() {
  const [range, setRange] = useState<EarningsRange>("last7");
  const [result, setResult] = useState<EarningsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (r: EarningsRange) => {
    setLoading(true);
    const res = await getAdskeeperEarnings(r);
    setResult(res);
    setLoading(false);
  }, []);

  useEffect(() => {
    load(range);
  }, [range, load]);

  async function onRefresh() {
    setRefreshing(true);
    const res = await refreshAdskeeperEarnings(range);
    setResult(res);
    setRefreshing(false);
  }

  const notConfigured = result != null && "configured" in result && result.configured === false;
  const errored = result != null && "ok" in result && result.ok === false;
  const data: AdskeeperEarnings | null =
    result != null && "ok" in result && result.ok ? result.data : null;

  return (
    <div className="adm-card adm-card-pad adm-rise" style={{ animationDelay: "0.1s" }}>
      <div className="adm-list-head" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="adm-qa-ic" style={{ background: "rgba(22,163,74,.12)", color: "#16a34a" }}>
            <CoinsIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="adm-card-title">Ad Earnings · AdsKeeper</div>
            <div className="adm-card-sub">
              Real revenue from the AdsKeeper publisher API
              {data?.cached ? " · cached" : ""}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          {!notConfigured && (
            <div className="adm-seg" role="tablist" aria-label="Earnings date range">
              {EARNINGS_RANGES.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  role="tab"
                  aria-selected={range === r.id}
                  className={`adm-seg-btn ${range === r.id ? "on" : ""}`}
                  onClick={() => setRange(r.id)}
                  disabled={loading || refreshing}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {!notConfigured && (
            <button
              type="button"
              className="adm-btn-ghost adm-fb-act"
              onClick={onRefresh}
              disabled={loading || refreshing}
              title="Force-refresh from AdsKeeper (bypasses the 30-min cache)"
            >
              <RefreshIcon className={`h-4 w-4 ${refreshing ? "adm-spinning" : ""}`} />
              <span className="adm-fb-actlabel">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {loading && result == null ? (
        <div className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading earnings…
        </div>
      ) : notConfigured ? (
        <NotConfigured />
      ) : errored ? (
        <div className="adm-trend-note" role="alert" style={{ marginTop: 14 }}>
          <p style={{ margin: 0 }}>
            {(result as { error: string }).error}{" "}
            {(result as { expired?: boolean }).expired && (
              <Link href="/admin/settings" className="adm-link">Reconnect →</Link>
            )}
          </p>
        </div>
      ) : data ? (
        <EarningsView data={data} />
      ) : null}
    </div>
  );
}

function NotConfigured() {
  return (
    <div className="adm-empty" style={{ padding: "26px 16px" }}>
      <div className="adm-ill">
        <CoinsIcon className="h-[34px] w-[34px]" />
      </div>
      <h2 className="adm-serif">Connect AdsKeeper to see earnings</h2>
      <p>
        Add your AdsKeeper publisher API key in Settings to pull real impressions, clicks, CTR and
        revenue into this panel. Your key is encrypted and stays server-side.
      </p>
      <Link href="/admin/settings" className="adm-btn-primary" style={{ marginTop: 14 }}>
        Open Settings →
      </Link>
    </div>
  );
}

function EarningsView({ data }: { data: AdskeeperEarnings }) {
  const t = data.totals;
  const empty =
    t.revenue === 0 && t.impressions === 0 && t.clicks === 0 && data.series.length === 0;

  const tiles = [
    { label: "Revenue", value: money(t.revenue, data.currency), accent: true },
    { label: "Impressions", value: formatNumber(Math.round(t.impressions)) },
    { label: "Clicks", value: formatNumber(Math.round(t.clicks)) },
    { label: "CTR", value: `${t.ctr.toFixed(2)}%` },
    { label: "eCPM", value: money(t.ecpm, data.currency) },
    { label: "EPC", value: money(t.epc, data.currency) },
  ];
  const maxSite = Math.max(1, ...data.sites.map((s) => s.revenue));

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(116px, 1fr))", gap: 10 }}>
        {tiles.map((tile) => (
          <div
            key={tile.label}
            style={{ background: "var(--adm-card)", border: "1px solid var(--adm-bd)", borderRadius: 13, padding: "11px 13px" }}
          >
            <div className="adm-card-sub" style={{ marginTop: 0 }}>{tile.label}</div>
            <div
              style={{
                fontSize: 21,
                fontWeight: 700,
                color: tile.accent ? "#16a34a" : "var(--adm-ink)",
                letterSpacing: "-0.4px",
                marginTop: 3,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {empty ? (
        <p className="adm-card-sub" style={{ marginTop: 16 }}>
          No earnings recorded in this period yet. If your site traffic is low, AdsKeeper may report
          little or no revenue — this panel only shows the real data it returns.
        </p>
      ) : (
        <>
          <RevenueChart series={data.series} currency={data.currency} />
          {data.sites.length > 1 && (
            <div style={{ marginTop: 18 }}>
              <div className="adm-card-title" style={{ fontSize: 13.5 }}>By website</div>
              <div className="adm-bars" style={{ marginTop: 10 }}>
                {data.sites.slice(0, 8).map((s) => (
                  <div key={s.name} className="adm-bar-row">
                    <span className="adm-bl" title={s.name}>{s.name}</span>
                    <div className="adm-bar-track">
                      <div className="adm-bar-fill" style={{ width: `${Math.round((s.revenue / maxSite) * 100)}%`, background: "#16a34a" }} />
                    </div>
                    <span className="adm-bv">{money(s.revenue, data.currency)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {data.balance != null && (
        <PayoutProgress balance={data.balance} target={data.payoutTarget} currency={data.currency} />
      )}
    </div>
  );
}

function PayoutProgress({ balance, target, currency }: { balance: number; target: number; currency: string }) {
  const pct = Math.max(0, Math.min(100, (balance / target) * 100));
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span className="adm-card-title" style={{ fontSize: 13.5 }}>Toward {money(target, currency)} payout</span>
        <span className="adm-card-sub" style={{ marginTop: 0 }}>
          {money(balance, currency)} · {pct.toFixed(0)}%
        </span>
      </div>
      <div className="adm-bar-track" style={{ height: 9 }}>
        <div
          className="adm-bar-fill"
          style={{ width: `${pct}%`, background: pct >= 100 ? "#16a34a" : "linear-gradient(90deg,#34d27b,#16a34a)" }}
        />
      </div>
    </div>
  );
}

function RevenueChart({ series, currency }: { series: { date: string; revenue: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const data = series;
  const n = data.length;
  if (n === 0) return null;

  const W = 640;
  const H = 170;
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const max = Math.max(0.0001, ...data.map((p) => p.revenue));

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const linePath = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.revenue).toFixed(1)}`).join(" ");
  const areaPath =
    `${linePath} L${x(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`;
  const label = (dk: string) =>
    new Date(`${dk}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

  return (
    <div style={{ marginTop: 16 }}>
      <div className="adm-card-title" style={{ fontSize: 13.5, marginBottom: 6 }}>Revenue over time</div>
      <div className="adm-vchart" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Revenue over time">
          <defs>
            <linearGradient id="adk-rev-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#16a34a" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#adk-rev-fill)" />
          <path d={linePath} fill="none" stroke="#16a34a" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          {data.map((p, i) => (
            <g key={p.date}>
              <rect
                x={x(i) - innerW / (2 * Math.max(1, n - 1))}
                y={PAD.top}
                width={Math.max(6, innerW / Math.max(1, n - 1))}
                height={innerH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
              />
              {hover === i && (
                <circle cx={x(i)} cy={y(p.revenue)} r={3.5} fill="#16a34a" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
              )}
            </g>
          ))}
        </svg>
        {hover !== null && data[hover] && (
          <div className="adm-vchart-tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
            <b>{money(data[hover].revenue, currency)}</b>
            <span>{label(data[hover].date)}</span>
          </div>
        )}
        <div className="adm-vchart-axis">
          <span>{data[0] && label(data[0].date)}</span>
          <span>{data[n - 1] && label(data[n - 1].date)}</span>
        </div>
      </div>
    </div>
  );
}
