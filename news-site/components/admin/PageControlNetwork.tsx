"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useToast } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { ManagerAvatar } from "@/components/admin/ManagerAvatar";
import { setPageControlManagerFilter, usePageControlManagerFilter } from "@/components/admin/pageControlManagerFilterStore";
import { ExternalLinkIcon } from "@/components/admin/icons";
import { formatNumber, formatDate } from "@/lib/site";
import { presetRange, ppToday, formatRange } from "@/lib/fbInsightsRange";
import { RangeControl, type Range } from "@/components/admin/FacebookPageInsights";
import { CountUp, AnimatedSparkline, AnimatedAreaChart, useReducedMotion, useRevealOnce, type SeriesPoint } from "@/components/admin/PageControlCharts";
import type { DayPoint } from "@/lib/facebookInsights";
import type { NetworkRollup, LeaderRow, NetPost, MoverRow } from "@/lib/pageControlNetwork";

const NET_API = "/api/admin/page-control/network";
const SS_DASH = "pageControl.dashRange";

type Metric = "reach" | "engagement" | "follows";
const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "reach", label: "Reach", color: "var(--section-accent)" },
  { key: "engagement", label: "Engagement", color: "var(--chart-2)" },
  { key: "follows", label: "Followers", color: "var(--chart-3)" },
];

function dashRange(): Range {
  const fallback: Range = { preset: "28d", ...presetRange("28d") };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(SS_DASH);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Range>;
      if (r.preset === "custom" && r.from && r.to) return { preset: "custom", from: r.from, to: r.to };
      if (r.preset && r.preset !== "custom") return { preset: r.preset, ...presetRange(r.preset) };
    }
  } catch {
    /* fall through */
  }
  return fallback;
}

function compact(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}
function delta(cur: number | null, prev: number | null): { txt: string; cls: "up" | "down" | "flat" } | null {
  if (cur == null || prev == null || prev === 0) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { txt: `${pct > 0.5 ? "▲" : pct < -0.5 ? "▼" : "▬"} ${Math.abs(pct).toFixed(0)}%`, cls: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}
function seriesValues(days: DayPoint[], key: Metric): number[] {
  return days.map((d) => d[key] ?? 0);
}
function seriesPoints(days: DayPoint[], key: Metric): SeriesPoint[] {
  return days.map((d) => ({ date: d.date, value: d[key] ?? 0 }));
}
function engagementOf(p: NetPost): number {
  return (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
}

/** KPI card: count-up number + %-change + sparkline (snapshot ones skip the delta). */
function Kpi({ label, value, prev, values, color, snapshot }: { label: string; value: number | null; prev: number | null; values: number[]; color: string; snapshot?: boolean }) {
  const d = snapshot ? null : delta(value, prev);
  const dirColor = d == null || d.cls === "flat" ? "var(--adm-muted, #94a3b8)" : d.cls === "up" ? "#15803d" : "#b91c1c";
  return (
    <div className="adm-pc-kpi">
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        {value == null ? "—" : <CountUp value={value} format={formatNumber} />}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 1, minHeight: 16 }}>
        {!snapshot && <><span style={{ color: dirColor, fontWeight: 700, fontSize: 12 }}>{d == null ? "—" : d.txt}</span><span className="adm-fb-sub" style={{ fontSize: 10.5 }}>vs prev</span></>}
        {snapshot && <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>across the network</span>}
      </div>
      {!snapshot && <div style={{ marginTop: 6 }}><AnimatedSparkline values={values} color={color} width={300} height={36} fluid /></div>}
    </div>
  );
}

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div style={{ marginTop: 20, marginBottom: 4 }}>
      <div className="adm-card-title" style={{ fontSize: 14 }}>{children}</div>
      {sub && <div className="adm-fb-sub" style={{ marginTop: 1 }}>{sub}</div>}
    </div>
  );
}

function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const [by, setBy] = useState<"reach" | "engagement">("reach");
  const ranked = useMemo(() => [...rows].sort((a, b) => b[by] - a[by]).slice(0, 10), [rows, by]);
  if (rows.length === 0) return <p className="adm-card-sub" style={{ marginTop: 8 }}>No cached page data for this range yet.</p>;
  return (
    <>
      <div className="adm-seg" role="tablist" aria-label="Rank by" style={{ marginTop: 8 }}>
        {(["reach", "engagement"] as const).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={by === k} className={`adm-seg-btn ${by === k ? "on" : ""}`} onClick={() => setBy(k)}>
            {k === "reach" ? "Reach" : "Engagement"}
          </button>
        ))}
      </div>
      <div className="adm-pc-lead">
        {ranked.map((r, i) => (
          <Link key={r.id} href={`/admin/page-control/${r.id}`} className="adm-pc-lead-row">
            <span className="adm-pc-lead-rank">{i + 1}</span>
            <FacebookPageAvatar dbId={r.id} name={r.name} avatarUrl={r.avatarUrl} size={30} />
            <span className="adm-pc-lead-name">{r.name}</span>
            <span className="adm-pc-lead-spark"><AnimatedSparkline values={r.sparkReach} color="var(--section-accent)" width={70} height={22} /></span>
            <span className="adm-pc-lead-val">{compact(r[by])}</span>
          </Link>
        ))}
      </div>
    </>
  );
}

function NetPostCard({ post }: { post: NetPost }) {
  const caption = post.message?.replace(/\s+/g, " ").trim() ?? "";
  return (
    <div className="adm-card adm-pc-netpost">
      <div className="adm-pc-netpost-head">
        <FacebookPageAvatar dbId={post.pageDbId} name={post.pageName} avatarUrl={post.avatarUrl} size={26} />
        <span className="adm-pc-netpost-page">{post.pageName}</span>
        <a href={post.permalink} target="_blank" rel="noreferrer" className="adm-link" style={{ marginLeft: "auto", fontSize: 12, flex: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
          View <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      </div>
      <p className="adm-pc-netpost-cap">{caption || <span className="adm-fb-sub">(No caption)</span>}</p>
      <div className="adm-fb-sub" style={{ marginTop: 2 }}>{post.createdTime ? formatDate(post.createdTime) : "Published"}</div>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 6 }}>
        {([["Reactions", post.reactions], ["Comments", post.comments], ["Shares", post.shares], ["Reach", post.reach]] as const).map(([l, v]) => (
          <span key={l} style={{ display: "inline-flex", flexDirection: "column", minWidth: 44 }}>
            <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 13, fontVariantNumeric: "tabular-nums" }}>{v == null ? "—" : formatNumber(v)}</span>
            <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function TopPosts({ posts }: { posts: NetPost[] }) {
  const [expanded, setExpanded] = useState(false);
  if (posts.length === 0) return <p className="adm-card-sub" style={{ marginTop: 8 }}>No cached posts yet — open some pages’ Content to populate this.</p>;
  const ranked = [...posts].sort((a, b) => engagementOf(b) - engagementOf(a) || (b.reach ?? 0) - (a.reach ?? 0));
  const shown = expanded ? ranked : ranked.slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
      {shown.map((p) => <NetPostCard key={`${p.pageDbId}:${p.id}`} post={p} />)}
      {ranked.length > 5 && (
        <button type="button" className="adm-btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show more (${ranked.length})`}
        </button>
      )}
    </div>
  );
}

function MoverList({ rows, dir }: { rows: MoverRow[]; dir: "up" | "down" }) {
  if (rows.length === 0) return <p className="adm-card-sub" style={{ marginTop: 6 }}>Not enough history yet.</p>;
  return (
    <div className="adm-pc-movers">
      {rows.map((m) => (
        <Link key={m.id} href={`/admin/page-control/${m.id}`} className="adm-pc-mover">
          <FacebookPageAvatar dbId={m.id} name={m.name} avatarUrl={m.avatarUrl} size={26} />
          <span className="adm-pc-mover-name">{m.name}</span>
          <span className={`adm-pc-mover-pct ${dir}`}>{dir === "up" ? "▲" : "▼"} {Math.abs(m.pct).toFixed(0)}%</span>
        </Link>
      ))}
    </div>
  );
}

function Health({ health }: { health: { growing: number; flat: number; shrinking: number } }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const total = health.growing + health.flat + health.shrinking;
  if (total === 0) return <p className="adm-card-sub" style={{ marginTop: 8 }}>No follower-change data for this range yet.</p>;
  const pct = (n: number) => (inView || reduced ? (n / total) * 100 : 0);
  const segs: { n: number; color: string; label: string }[] = [
    { n: health.growing, color: "var(--section-accent)", label: "Growing" },
    { n: health.flat, color: "var(--adm-bd)", label: "Flat" },
    { n: health.shrinking, color: "#dc2626", label: "Shrinking" },
  ];
  return (
    <div ref={ref}>
      <div className="adm-pc-health-bar">
        {segs.map((s) => (
          <span key={s.label} style={{ width: `${pct(s.n)}%`, background: s.color, transition: reduced ? "none" : "width 700ms cubic-bezier(0.3,0.85,0.3,1)" }} />
        ))}
      </div>
      <div className="adm-pc-health-legend">
        {segs.map((s) => (
          <span key={s.label} className="adm-pc-health-leg">
            <span className="adm-pc-health-dot" style={{ background: s.color }} />
            {s.label} <strong>{s.n}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function NetTrend({ days, daysPrev }: { days: DayPoint[]; daysPrev: DayPoint[] }) {
  const [metric, setMetric] = useState<Metric>("reach");
  const [comparePrev, setComparePrev] = useState(false);
  const info = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  return (
    <div>
      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 8 }}>
        <div className="adm-seg" role="tablist" aria-label="Trend metric">
          {METRICS.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className={`adm-seg-btn ${metric === m.key ? "on" : ""}`} onClick={() => setMetric(m.key)}>{m.label}</button>
          ))}
        </div>
        <label className="adm-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          <span>Compare to previous</span>
        </label>
      </div>
      <AnimatedAreaChart current={seriesPoints(days, metric)} previous={seriesPoints(daysPrev, metric)} color={info.color} showPrev={comparePrev} formatValue={formatNumber} />
    </div>
  );
}

/**
 * Page Control NETWORK dashboard (the RIGHT box): combined totals / trend /
 * leaderboard / top posts / risers-fallers / health across ALL monitored pages,
 * aggregated from EXISTING per-page caches (no Graph calls). Has its OWN range chips
 * (independent of the list's). Animations are once-on-scroll-in + reduced-motion
 * safe (reused from the chart lib). Coverage ("N of M pages") is shown up top.
 */
export function PageControlNetwork() {
  const { error } = useToast();
  // Selected manager (header autocomplete) → the dashboard filters to that manager's
  // pages, in sync with the list. null = whole network.
  const selectedManager = usePageControlManagerFilter();
  const [range, setRange] = useState<Range>(dashRange);
  const [data, setData] = useState<NetworkRollup | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_DASH, JSON.stringify(range));
    } catch {
      /* ignore */
    }
  }, [range]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const url = `${NET_API}?from=${range.from}&to=${range.to}${selectedManager ? `&manager=${encodeURIComponent(selectedManager.id)}` : ""}`;
    fetch(url, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.ok) setData(j.rollup as NetworkRollup);
        else error(j.error || "Couldn’t load the network dashboard.");
      })
      .catch(() => !cancelled && error("Couldn’t load the network dashboard."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [range.from, range.to, selectedManager, error]);

  const t = data?.totals;
  return (
    <div className="adm-pc-dash">
      <div className="adm-pc-dash-head">
        <div>
          <div className="adm-card-title" style={{ fontSize: 16 }}>Network dashboard</div>
          {data && <div className="adm-fb-sub" style={{ marginTop: 1 }}>Based on {data.coverage.withData} of {data.coverage.total} {data.coverage.total === 1 ? "page" : "pages"} · {formatRange(range.from, range.to)}{range.to === ppToday() ? " · today partial" : ""}</div>}
        </div>
        {selectedManager && (
          <div className="adm-pc-netfilter">
            <ManagerAvatar name={selectedManager.name} photo={selectedManager.photo} size={20} />
            <span>{selectedManager.name}</span>
            <button type="button" onClick={() => setPageControlManagerFilter(null)} aria-label={`Clear manager filter (${selectedManager.name})`}>×</button>
          </div>
        )}
      </div>

      <RangeControl range={range} onChange={setRange} busy={loading} />

      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Building the network rollup…
        </p>
      ) : !data ? null : data.coverage.withData === 0 ? (
        <div className="adm-card adm-card-pad" style={{ marginTop: 12 }}>
          <div className="adm-card-title" style={{ fontSize: 14 }}>No cached data for this range yet</div>
          <p className="adm-card-sub" style={{ marginTop: 6 }}>
            Open the monitored-pages list (left) at this range, or open a few pages’ dashboards — that populates the
            per-page caches this rollup reads (it never calls Facebook directly). It fills in automatically as you browse.
          </p>
        </div>
      ) : (
        <>
          {/* 1) Network totals */}
          <div className="adm-pc-kpis">
            <Kpi label="Reach" value={t!.reach} prev={t!.reachPrev} values={seriesValues(data.trendDays, "reach")} color="var(--section-accent)" />
            <Kpi label="Engagement" value={t!.engagement} prev={t!.engagementPrev} values={seriesValues(data.trendDays, "engagement")} color="var(--chart-2)" />
            <Kpi label="Followers" value={t!.followers} prev={null} values={[]} color="var(--chart-3)" snapshot />
            <Kpi label="Total posts" value={t!.totalPosts} prev={null} values={[]} color="var(--chart-6)" snapshot />
          </div>

          {/* 2) Network trend */}
          <SectionTitle>Reach &amp; engagement over time</SectionTitle>
          <NetTrend days={data.trendDays} daysPrev={data.trendDaysPrev} />

          {/* 3) Top pages leaderboard */}
          <SectionTitle>Top pages</SectionTitle>
          <Leaderboard rows={data.leaderboard} />

          {/* 4) Top posts across all pages */}
          <SectionTitle sub={data.topPosts.length < 5 ? "Caches are still thin — more appear as you open pages’ Content." : undefined}>Top posts network-wide</SectionTitle>
          <TopPosts posts={data.topPosts} />

          {/* 5) Risers & fallers */}
          <SectionTitle>Risers &amp; fallers (reach vs previous)</SectionTitle>
          <div className="adm-pc-movecols">
            <div>
              <div className="adm-fb-sub" style={{ marginBottom: 4 }}>Risers</div>
              <MoverList rows={data.risers} dir="up" />
            </div>
            <div>
              <div className="adm-fb-sub" style={{ marginBottom: 4 }}>Fallers</div>
              <MoverList rows={data.fallers} dir="down" />
            </div>
          </div>

          {/* 6) Page health split */}
          <SectionTitle sub="Follower change over the range">Page health</SectionTitle>
          <Health health={data.health} />
        </>
      )}
    </div>
  );
}
