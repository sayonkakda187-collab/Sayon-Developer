"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { formatNumber } from "@/lib/site";
import { previousPeriod, ppToday, formatDay, formatRange } from "@/lib/fbInsightsRange";
import { buildDayRows, type Range, type DetailData, type DayRow } from "@/components/admin/FacebookPageInsights";
import { CountUp, AnimatedSparkline, AnimatedAreaChart, type SeriesPoint } from "@/components/admin/PageControlCharts";

type Metric = "reach" | "engagement" | "follows" | "paidReach";
const METRICS: { key: Metric; label: string; color: string; signed?: boolean }[] = [
  { key: "reach", label: "Reach", color: "var(--section-accent)" },
  { key: "engagement", label: "Engagement", color: "var(--chart-2)" },
  { key: "follows", label: "Followers", color: "var(--chart-3)", signed: true },
  { key: "paidReach", label: "Paid reach", color: "var(--chart-1)" },
];

function fmtSigned(n: number): string {
  return `${n > 0 ? "+" : ""}${formatNumber(n)}`;
}
function sumRows(rows: DayRow[], k: Metric): number {
  return rows.reduce((s, r) => s + (r[k] ?? 0), 0);
}
function seriesOf(rows: DayRow[], k: Metric): SeriesPoint[] {
  return rows.map((r) => ({ date: r.date, value: r[k] ?? 0 }));
}
function valuesOf(rows: DayRow[], k: Metric): number[] {
  return rows.map((r) => r[k] ?? 0);
}
function delta(cur: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } | null {
  if (prev === 0 || !Number.isFinite(prev)) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { pct, dir: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}
/** True when at least one day in range carried a non-null value for `k` (so we can
 *  tell a genuine 0 from a metric Meta isn't returning, and degrade gracefully). */
function hasAny(rows: DayRow[], k: Metric): boolean {
  return rows.some((r) => r[k] != null);
}

/** Compact "Paid vs Organic" split: the two totals + a proportion bar. Organic is
 *  ESTIMATED as total reach − paid reach over the range (clamped at 0). Only shown
 *  when paid reach is available; otherwise the KPI explains it's not available. */
function PaidOrganicSplit({ total, paid }: { total: number; paid: number }) {
  const organic = Math.max(0, total - paid);
  const denom = paid + organic || 1;
  const paidPct = Math.min(100, Math.max(0, (paid / denom) * 100));
  return (
    <div className="adm-pc-kpi" style={{ marginTop: 12 }}>
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Paid vs organic reach</div>
      <div style={{ display: "flex", gap: 20, marginTop: 8, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--chart-1)" }} aria-hidden />
            <span className="adm-fb-sub" style={{ fontSize: 11 }}>Paid</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 19, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{formatNumber(paid)}</div>
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--section-accent)" }} aria-hidden />
            <span className="adm-fb-sub" style={{ fontSize: 11 }}>Organic (est.)</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 19, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 1 }}>{formatNumber(organic)}</div>
        </div>
      </div>
      <div
        className="adm-bar-track"
        style={{ height: 8, borderRadius: 5, marginTop: 10, overflow: "hidden", display: "flex" }}
        role="img"
        aria-label={`Paid reach ${formatNumber(paid)}, organic reach ${formatNumber(organic)}`}
      >
        <div style={{ width: `${paidPct}%`, background: "var(--chart-1)", height: "100%" }} />
        <div style={{ width: `${100 - paidPct}%`, background: "var(--section-accent)", height: "100%" }} />
      </div>
      <p className="adm-fb-sub" style={{ fontSize: 10.5, marginTop: 6 }}>
        Organic is estimated as total reach minus paid reach over this range.
      </p>
    </div>
  );
}

/** Graceful placeholder KPI when Meta returns no paid-reach metric for the Page. */
function PaidReachUnavailable() {
  return (
    <div className="adm-pc-kpi">
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Paid reach</div>
      <div style={{ fontWeight: 800, fontSize: 18, color: "var(--adm-muted, #94a3b8)", marginTop: 6 }}>Not available</div>
      <p className="adm-fb-sub" style={{ fontSize: 10.5, marginTop: 4 }}>
        Facebook isn’t returning paid reach for this Page — the metric may be retired, or the Page has no ad activity.
      </p>
    </div>
  );
}

/** Animated KPI card: count-up number + %-change vs previous + a draw-in sparkline. */
function Kpi({ label, value, prev, values, color, signed }: { label: string; value: number; prev: number; values: number[]; color: string; signed?: boolean }) {
  const d = delta(value, prev);
  const dirColor = d == null || d.dir === "flat" ? "var(--adm-muted, #94a3b8)" : d.dir === "up" ? "#15803d" : "#b91c1c";
  const arrow = d == null ? "" : d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "▬";
  return (
    <div className="adm-pc-kpi">
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        <CountUp value={value} format={signed ? fmtSigned : formatNumber} />
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 1 }}>
        <span style={{ color: dirColor, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {d == null ? "—" : `${arrow} ${Math.abs(d.pct).toFixed(0)}%`}
        </span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>vs prev</span>
      </div>
      <div style={{ marginTop: 6 }}>
        <AnimatedSparkline values={values} color={color} width={300} height={40} fluid />
      </div>
    </div>
  );
}

/**
 * The animated per-page dashboard for a MONITORED page: count-up KPIs (Reach ·
 * Engagement · Net follows) each with %-change + sparkline, a metric-switchable
 * large trend chart (reach / engagement / followers) with an optional previous-
 * period overlay + tap/hover tooltip, and an optional day-by-day table. Fed by the
 * SAME `?detail=` data Page Control already fetches (no new Graph calls). Only
 * AVAILABLE v25.0 metrics are shown — a metric with no data simply reads 0/flat,
 * never an empty box. Watch-only, so there is no "Our posts" / farm-share content.
 */
export function MonitoredDashboard({ pageDbId, range, detailApi, showDayTable }: { pageDbId: string; range: Range; detailApi: string; showDayTable?: boolean }) {
  const { error } = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [metric, setMetric] = useState<Metric>("reach");
  const [comparePrev, setComparePrev] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${detailApi}?detail=${encodeURIComponent(pageDbId)}&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) setData(json.detail as DetailData);
        else error(json.error || "Couldn’t load this Page’s insights.");
      })
      .catch(() => !cancelled && error("Couldn’t load this Page’s insights."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [pageDbId, range.from, range.to, detailApi, error]);

  const curRows = useMemo(
    () => (data ? buildDayRows(range.from, range.to, new Map(data.days.map((d) => [d.date, d])), {}) : []),
    [data, range.from, range.to],
  );
  const prevRows = useMemo(() => {
    if (!data) return [];
    const p = previousPeriod(range.from, range.to);
    return buildDayRows(p.from, p.to, new Map(data.daysPrev.map((d) => [d.date, d])), {});
  }, [data, range.from, range.to]);

  const includesToday = range.to === ppToday();
  const paidAvailable = hasAny(curRows, "paidReach");
  const paidReachTotal = sumRows(curRows, "paidReach");
  const reachTotal = sumRows(curRows, "reach");
  // Hide the Paid-reach toggle when there's no paid data, and never leave the chart
  // stuck on an empty metric if availability flips when the range changes.
  const chartMetrics = paidAvailable ? METRICS : METRICS.filter((m) => m.key !== "paidReach");
  const effectiveMetric: Metric = metric === "paidReach" && !paidAvailable ? "reach" : metric;
  const metricInfo = METRICS.find((m) => m.key === effectiveMetric) ?? METRICS[0];

  if (loading) {
    return (
      <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="adm-spinner" aria-hidden /> Loading {formatRange(range.from, range.to)} from Facebook…
      </p>
    );
  }
  if (!data) return null;
  if (data.status === "reconnect") {
    return (
      <div className="adm-card adm-card-pad" style={{ marginTop: 12 }}>
        <span className="adm-pill amber">Needs reconnect</span>
        <p className="adm-card-sub" style={{ marginTop: 8 }}>This Page’s token can’t read insights right now. Reconnect it to see charts.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="adm-pc-kpis">
        <Kpi label="Reach" value={reachTotal} prev={sumRows(prevRows, "reach")} values={valuesOf(curRows, "reach")} color="var(--section-accent)" />
        <Kpi label="Engagement" value={sumRows(curRows, "engagement")} prev={sumRows(prevRows, "engagement")} values={valuesOf(curRows, "engagement")} color="var(--chart-2)" />
        <Kpi label="Net follows" value={sumRows(curRows, "follows")} prev={sumRows(prevRows, "follows")} values={valuesOf(curRows, "follows")} color="var(--chart-3)" signed />
        {paidAvailable ? (
          <Kpi label="Paid reach" value={paidReachTotal} prev={sumRows(prevRows, "paidReach")} values={valuesOf(curRows, "paidReach")} color="var(--chart-1)" />
        ) : (
          <PaidReachUnavailable />
        )}
      </div>

      {paidAvailable && <PaidOrganicSplit total={reachTotal} paid={paidReachTotal} />}

      {includesToday && (
        <p className="adm-fb-sub" style={{ marginTop: 8 }}>
          Today is <strong>partial</strong> — Facebook is still finalizing today’s numbers.
        </p>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 16 }}>
        <div className="adm-seg" role="tablist" aria-label="Chart metric">
          {chartMetrics.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={effectiveMetric === m.key} className={`adm-seg-btn ${effectiveMetric === m.key ? "on" : ""}`} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="adm-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          <span>Compare to previous period</span>
        </label>
      </div>

      <AnimatedAreaChart current={seriesOf(curRows, effectiveMetric)} previous={seriesOf(prevRows, effectiveMetric)} color={metricInfo.color} showPrev={comparePrev} formatValue={metricInfo.signed ? fmtSigned : formatNumber} />

      {showDayTable && curRows.length > 0 && (
        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--adm-bd)", borderRadius: 12 }}>
            <table className="adm-table" style={{ marginTop: 0 }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", top: 0, background: "var(--adm-card)" }}>Date</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--adm-card)", textAlign: "right" }}>Reach</th>
                  {paidAvailable && <th style={{ position: "sticky", top: 0, background: "var(--adm-card)", textAlign: "right" }}>Paid reach</th>}
                  <th style={{ position: "sticky", top: 0, background: "var(--adm-card)", textAlign: "right" }}>Engagement</th>
                  <th style={{ position: "sticky", top: 0, background: "var(--adm-card)", textAlign: "right" }}>Follower Δ</th>
                </tr>
              </thead>
              <tbody>
                {[...curRows].reverse().map((r) => (
                  <tr key={r.date}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {formatDay(r.date)}
                      {r.partial && <span className="adm-pill amber" style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}>partial</span>}
                    </td>
                    <td className="adm-num-td" style={{ textAlign: "right" }}>{r.reach == null ? "—" : formatNumber(r.reach)}</td>
                    {paidAvailable && <td className="adm-num-td" style={{ textAlign: "right" }}>{r.paidReach == null ? "—" : formatNumber(r.paidReach)}</td>}
                    <td className="adm-num-td" style={{ textAlign: "right" }}>{r.engagement == null ? "—" : formatNumber(r.engagement)}</td>
                    <td className="adm-num-td" style={{ textAlign: "right" }}>{r.follows == null ? "—" : fmtSigned(r.follows)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
