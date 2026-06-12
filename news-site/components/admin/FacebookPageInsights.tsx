"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useToast } from "@/components/admin/Toast";
import { formatDate, formatNumber } from "@/lib/site";
import { RefreshIcon, CloseIcon, ExternalLinkIcon, SearchIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { type RangePreset, presetRange, previousPeriod, ppToday, eachDate, formatDay, formatRange, addDays, dayCount } from "@/lib/fbInsightsRange";

export type InsightsPageRow = {
  id: string;
  pageId: string;
  pageName: string;
  categoryGroup: string;
  status: string; // "Connected" | "Expired"
  avatarUrl: string | null; // cached Page profile picture CDN URL (null = initials)
  postedCount: number;
  lastSharedAt: string | null;
};

type Overview = {
  followers: number | null;
  reach28: number | null;
  engagement28: number | null;
  status: "ok" | "partial" | "reconnect";
  avatarUrl?: string | null;
  cachedAt: string;
};

type SeriesPoint = { date: string; value: number };
export type DayPoint = { date: string; reach: number | null; engagement: number | null; follows: number | null };
export type DayRow = DayPoint & { shares: number; partial: boolean };
export type Range = { preset: RangePreset; from: string; to: string };
type Metric = "reach" | "engagement" | "follows";

type RecentPost = {
  id: string;
  title: string;
  postedAt: string | null;
  permalink: string;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  reach: number | null;
};
type TopPost = RecentPost & { pageDbId: string; pageName: string; avatarUrl: string | null; engagement: number };
export type DetailData = {
  pageDbId: string;
  pageName: string;
  from: string;
  to: string;
  status: "ok" | "reconnect";
  days: DayPoint[];
  daysPrev: DayPoint[];
  shares: Record<string, number>;
  prevPostsTotal: number;
  posts: RecentPost[];
};

type SortKey = "name" | "followers" | "reach28" | "engagement28" | "posts" | "lastShared";
const NUMERIC_KEYS: SortKey[] = ["followers", "reach28", "engagement28", "posts", "lastShared"];

type MergedRow = InsightsPageRow & {
  followers: number | null;
  reach28: number | null;
  engagement28: number | null;
  ovStatus: Overview["status"] | null;
  needsReconnect: boolean;
  effectiveAvatar: string | null;
};

function numFor(r: MergedRow, key: SortKey): number | null {
  switch (key) {
    case "followers":
      return r.followers;
    case "reach28":
      return r.reach28;
    case "engagement28":
      return r.engagement28;
    case "posts":
      return r.postedCount;
    case "lastShared":
      return r.lastSharedAt ? Date.parse(r.lastSharedAt) : null;
    default:
      return null;
  }
}

const PER_PAGE = 20;
// Pages per server call. Each page also fetches a daily series (current+previous
// in one combined call), so keep the batch modest to stay under the 60s limit.
const BATCH = 18;
const SS_KEY = "fbInsights.view";
const API = "/api/admin/facebook/page-insights";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
];
// Chart colours come from the section-accent token system (globals.css): the
// PRIMARY metric uses the page's section accent, the rest the shared chart palette.
const METRICS: { key: Metric; label: string; color: string }[] = [
  { key: "reach", label: "Reach", color: "var(--section-accent)" },
  { key: "engagement", label: "Engagement", color: "var(--chart-2)" },
  { key: "follows", label: "Followers", color: "var(--chart-3)" },
];

function fmtNum(x: number | null): string {
  return x == null ? "—" : formatNumber(x);
}
function fmtSigned(x: number | null): string {
  return x == null ? "—" : (x > 0 ? "+" : "") + formatNumber(x);
}

export function buildDayRows(from: string, to: string, daily: Map<string, DayPoint>, shares: Record<string, number>): DayRow[] {
  const today = ppToday();
  return eachDate(from, to).map((date) => {
    const d = daily.get(date);
    return {
      date,
      reach: d?.reach ?? null,
      engagement: d?.engagement ?? null,
      follows: d?.follows ?? null,
      shares: shares[date] ?? 0,
      partial: date === today,
    };
  });
}

function mergeDaily(acc: Map<string, DayPoint>, dp: DayPoint): void {
  const cur = acc.get(dp.date) ?? { date: dp.date, reach: null, engagement: null, follows: null };
  if (dp.reach != null) cur.reach = (cur.reach ?? 0) + dp.reach;
  if (dp.engagement != null) cur.engagement = (cur.engagement ?? 0) + dp.engagement;
  if (dp.follows != null) cur.follows = (cur.follows ?? 0) + dp.follows;
  acc.set(dp.date, cur);
}

function sumRows(rows: DayRow[], k: Metric): number {
  return rows.reduce((s, r) => s + (r[k] ?? 0), 0);
}
function sumShares(rows: DayRow[]): number {
  return rows.reduce((s, r) => s + r.shares, 0);
}
function seriesOf(rows: DayRow[], k: Metric): SeriesPoint[] {
  return rows.map((r) => ({ date: r.date, value: r[k] ?? 0 }));
}
function postsSeries(rows: DayRow[]): SeriesPoint[] {
  return rows.map((r) => ({ date: r.date, value: r.shares }));
}

/** % change vs the previous period (null when there's no comparable base). */
function deltaInfo(cur: number, prev: number): { pct: number; dir: "up" | "down" | "flat" } | null {
  if (prev === 0 || !Number.isFinite(prev)) return null;
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return { pct, dir: pct > 0.5 ? "up" : pct < -0.5 ? "down" : "flat" };
}

/** Quick-range buttons (Today · Yesterday · 7d · 28d · 90d · Custom). Exported so
 *  the Page Control dashboard can drive one shared range across its sub-tabs. */
export function RangeControl({ range, onChange, busy }: { range: Range; onChange: (r: Range) => void; busy?: boolean }) {
  const today = ppToday();
  const [open, setOpen] = useState(range.preset === "custom");
  const [cf, setCf] = useState(range.from);
  const [ct, setCt] = useState(range.to);

  useEffect(() => {
    setCf(range.from);
    setCt(range.to);
  }, [range.from, range.to]);

  function pickPreset(key: RangePreset) {
    setOpen(false);
    onChange({ preset: key, ...presetRange(key, today) });
  }
  function applyCustom() {
    if (!cf || !ct) return;
    let from = cf <= ct ? cf : ct;
    const to = cf <= ct ? ct : cf;
    if (dayCount(from, to) > 92) from = addDays(to, -91);
    onChange({ preset: "custom", from, to });
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div className="adm-seg" role="tablist" aria-label="Date range" style={{ flexWrap: "wrap" }}>
          {PRESETS.map((p) => (
            <button key={p.key} type="button" role="tab" aria-selected={range.preset === p.key} className={`adm-seg-btn ${range.preset === p.key ? "on" : ""}`} disabled={busy} onClick={() => pickPreset(p.key)}>
              {p.label}
            </button>
          ))}
          <button type="button" role="tab" aria-selected={range.preset === "custom"} className={`adm-seg-btn ${range.preset === "custom" ? "on" : ""}`} disabled={busy} onClick={() => setOpen((o) => !o)}>
            Custom
          </button>
        </div>
        <span className="adm-fb-sub">{formatRange(range.from, range.to)} · Phnom Penh</span>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 10 }}>
          <label className="adm-field" style={{ margin: 0 }}>
            <span>From</span>
            <input type="date" className="adm-input" value={cf} max={today} onChange={(e) => setCf(e.target.value)} />
          </label>
          <label className="adm-field" style={{ margin: 0 }}>
            <span>To</span>
            <input type="date" className="adm-input" value={ct} max={today} onChange={(e) => setCt(e.target.value)} />
          </label>
          <button type="button" className="adm-btn-primary" disabled={busy || !cf || !ct} onClick={applyCustom}>
            Apply
          </button>
        </div>
      )}
    </div>
  );
}

function Th({
  label,
  col,
  sortKey,
  sortDir,
  onSort,
  align = "left",
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === col;
  return (
    <th style={{ textAlign: align, cursor: "pointer", whiteSpace: "nowrap" }} aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className="adm-fb-sortbtn"
        style={{ background: "none", border: "none", font: "inherit", letterSpacing: "inherit", textTransform: "inherit", color: active ? "var(--adm-ink)" : "inherit", cursor: "pointer", padding: 0, display: "inline-flex", alignItems: "center", gap: 4, flexDirection: align === "right" ? "row-reverse" : "row" }}
        title={`Sort by ${label}`}
      >
        {label}
        <span aria-hidden style={{ opacity: active ? 1 : 0.25, fontSize: 9 }}>{active ? (sortDir === "asc" ? "▲" : "▼") : "▾"}</span>
      </button>
    </th>
  );
}

function ReconnectBadge() {
  return (
    <span className="adm-pill" style={{ background: "rgba(245,158,11,.16)", color: "#b45309", fontSize: 10.5, fontWeight: 700 }} title="This Page's token can't read insights.">
      Needs reconnect
    </span>
  );
}

/** Dependency-free SVG sparkline (area + line) that scales to its container. */
function Sparkline({ points, color, height = 60 }: { points: SeriesPoint[]; color: string; height?: number }) {
  if (points.length === 0) return null;
  const W = 300;
  const H = height;
  const pad = 4;
  const vals = points.map((p) => p.value);
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const range = max - min || 1;
  const stepX = points.length > 1 ? (W - pad * 2) / (points.length - 1) : 0;
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = H - pad - ((p.value - min) / range) * (H - pad * 2);
    return [x, y] as const;
  });
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${H - pad} L${coords[0][0].toFixed(1)},${H - pad} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block", marginTop: 6 }} aria-hidden>
      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.75} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/** A KPI card: big number + % change vs the previous period + a sparkline. */
function KpiCard({ label, value, prev, points, color, signed }: { label: string; value: number; prev: number; points: SeriesPoint[]; color: string; signed?: boolean }) {
  const d = deltaInfo(value, prev);
  const dirColor = d == null || d.dir === "flat" ? "var(--adm-muted)" : d.dir === "up" ? "#15803d" : "#b91c1c";
  const arrow = d == null ? "" : d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "▬";
  return (
    <div style={{ border: "1px solid var(--adm-bd)", borderRadius: 14, padding: 12, background: "var(--adm-card)", minWidth: 0 }}>
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
        {signed ? fmtSigned(value) : formatNumber(value)}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline", marginTop: 1 }}>
        <span style={{ color: dirColor, fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
          {d == null ? "—" : `${arrow} ${Math.abs(d.pct).toFixed(0)}%`}
        </span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>vs prev</span>
      </div>
      <Sparkline points={points} color={color} height={44} />
    </div>
  );
}

/** The large trend chart: current period (solid area+line) + optional previous
 *  period overlay (dashed). Lightweight SVG, no chart library. */
function BigChart({ current, previous, color, showPrev }: { current: SeriesPoint[]; previous: SeriesPoint[]; color: string; showPrev: boolean }) {
  if (current.length === 0) return <p className="adm-fb-sub" style={{ marginTop: 12 }}>No data for this range yet.</p>;
  const W = 600;
  const H = 170;
  const padX = 6;
  const padTop = 10;
  const padBot = 8;
  const n = current.length;
  const vals = [...current.map((p) => p.value), ...(showPrev ? previous.map((p) => p.value) : [])];
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const stepX = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const xOf = (i: number) => padX + i * stepX;
  const yOf = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBot);
  const pathOf = (pts: SeriesPoint[]) => pts.slice(0, n).map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ");
  const curPath = pathOf(current);
  const area = `${curPath} L${xOf(n - 1).toFixed(1)},${H - padBot} L${xOf(0).toFixed(1)},${H - padBot} Z`;
  return (
    <div style={{ marginTop: 12 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke="var(--adm-bd)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill={color} opacity={0.12} />
        {showPrev && previous.length > 0 && (
          <path d={pathOf(previous)} fill="none" stroke="var(--adm-muted)" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        )}
        <path d={curPath} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(current[0].date)}</span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(current[n - 1].date)}</span>
      </div>
    </div>
  );
}

function PartialNote() {
  return (
    <p className="adm-fb-sub" style={{ marginTop: 8 }}>
      Today is <strong>partial</strong> — Facebook is still finalizing today’s numbers, so they’ll keep rising.
    </p>
  );
}

/** KPI cards + metric-switchable trend chart, shared by the network overview and
 *  the per-Page detail. `curRows`/`prevRows` are equal-length day rows. */
export function InsightsDashboard({ curRows, prevRows, prevPostsTotal, includesToday }: { curRows: DayRow[]; prevRows: DayRow[]; prevPostsTotal: number; includesToday: boolean }) {
  const [metric, setMetric] = useState<Metric>("reach");
  const [comparePrev, setComparePrev] = useState(false);
  const metricInfo = METRICS.find((m) => m.key === metric) ?? METRICS[0];

  const kpis: { label: string; value: number; prev: number; points: SeriesPoint[]; color: string; signed?: boolean }[] = [
    { label: "Reach", value: sumRows(curRows, "reach"), prev: sumRows(prevRows, "reach"), points: seriesOf(curRows, "reach"), color: "var(--section-accent)" },
    { label: "Engagement", value: sumRows(curRows, "engagement"), prev: sumRows(prevRows, "engagement"), points: seriesOf(curRows, "engagement"), color: "var(--chart-2)" },
    { label: "Net follows", value: sumRows(curRows, "follows"), prev: sumRows(prevRows, "follows"), points: seriesOf(curRows, "follows"), color: "var(--chart-3)", signed: true },
    { label: "Our posts", value: sumShares(curRows), prev: prevPostsTotal, points: postsSeries(curRows), color: "var(--chart-6)" },
  ];

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginTop: 12 }}>
        {kpis.map((k) => (
          <KpiCard key={k.label} label={k.label} value={k.value} prev={k.prev} points={k.points} color={k.color} signed={k.signed} />
        ))}
      </div>
      {includesToday && <PartialNote />}

      <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", marginTop: 16 }}>
        <div className="adm-seg" role="tablist" aria-label="Chart metric">
          {METRICS.map((m) => (
            <button key={m.key} type="button" role="tab" aria-selected={metric === m.key} className={`adm-seg-btn ${metric === m.key ? "on" : ""}`} onClick={() => setMetric(m.key)}>
              {m.label}
            </button>
          ))}
        </div>
        <label className="adm-check" style={{ margin: 0 }}>
          <input type="checkbox" checked={comparePrev} onChange={(e) => setComparePrev(e.target.checked)} />
          <span>Compare to previous period</span>
        </label>
      </div>
      <BigChart current={seriesOf(curRows, metric)} previous={seriesOf(prevRows, metric)} color={metricInfo.color} showPrev={comparePrev} />
    </div>
  );
}

const STICKY_TH: CSSProperties = { position: "sticky", top: 0, background: "var(--adm-card)", zIndex: 1 };

/** Per-day breakdown table: date · reach · engagement · follower change · our posts. */
function DayTable({ rows }: { rows: DayRow[] }) {
  if (rows.length === 0) return null;
  const view = [...rows].reverse();
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--adm-bd)", borderRadius: 12 }}>
        <table className="adm-table" style={{ marginTop: 0 }}>
          <thead>
            <tr>
              <th style={STICKY_TH}>Date</th>
              <th style={{ ...STICKY_TH, textAlign: "right" }}>Reach</th>
              <th style={{ ...STICKY_TH, textAlign: "right" }}>Engagement</th>
              <th style={{ ...STICKY_TH, textAlign: "right" }}>Follower Δ</th>
              <th style={{ ...STICKY_TH, textAlign: "right" }}>Our posts</th>
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.date}>
                <td style={{ whiteSpace: "nowrap" }}>
                  {formatDay(r.date)}
                  {r.partial && <span className="adm-pill amber" style={{ marginLeft: 6, fontSize: 10, padding: "1px 6px" }}>partial</span>}
                </td>
                <td className="adm-num-td" style={{ textAlign: "right" }}>{fmtNum(r.reach)}</td>
                <td className="adm-num-td" style={{ textAlign: "right" }}>{fmtNum(r.engagement)}</td>
                <td className="adm-num-td" style={{ textAlign: "right" }}>{fmtSigned(r.follows)}</td>
                <td className="adm-num-td" style={{ textAlign: "right" }}>{formatNumber(r.shares)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PostStat({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 44 }}>
      <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>{value == null ? "—" : formatNumber(value)}</span>
      <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{label}</span>
    </span>
  );
}

/** One post row (avatar optional) with title, page/date, and engagement stats. */
function PostRow({ post, showPage }: { post: TopPost | RecentPost; showPage?: boolean }) {
  const tp = post as TopPost;
  return (
    <div style={{ border: "1px solid var(--adm-bd)", borderRadius: 12, padding: 10, background: "var(--adm-card)", display: "flex", gap: 10 }}>
      {showPage && <FacebookPageAvatar dbId={tp.pageDbId} name={tp.pageName} avatarUrl={tp.avatarUrl} size={36} />}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
          <span style={{ fontWeight: 600, color: "var(--adm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{post.title}</span>
          <a href={post.permalink} target="_blank" rel="noreferrer" className="adm-link" style={{ fontSize: 12, flex: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
            View <ExternalLinkIcon className="h-3.5 w-3.5" />
          </a>
        </div>
        <div className="adm-fb-sub" style={{ marginTop: 1 }}>
          {showPage ? `${tp.pageName} · ` : ""}
          {post.postedAt ? formatDate(post.postedAt) : "Posted"}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
          <PostStat label="Reactions" value={post.reactions} />
          <PostStat label="Comments" value={post.comments} />
          <PostStat label="Shares" value={post.shares} />
          <PostStat label="Reach" value={post.reach} />
        </div>
      </div>
    </div>
  );
}

/** Top posts for the network view (ranked by engagement then reach). */
function TopPosts({ posts, loading }: { posts: TopPost[]; loading: boolean }) {
  const [expanded, setExpanded] = useState(false);
  if (loading) {
    return (
      <p className="adm-card-sub" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
        <span className="adm-spinner" aria-hidden /> Loading top posts…
      </p>
    );
  }
  if (posts.length === 0) {
    return <p className="adm-card-sub" style={{ marginTop: 10 }}>No posts shared in this range yet.</p>;
  }
  const shown = expanded ? posts : posts.slice(0, 5);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
      {shown.map((p) => (
        <PostRow key={p.id} post={p} showPage />
      ))}
      {posts.length > 5 && (
        <button type="button" className="adm-btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setExpanded((e) => !e)}>
          {expanded ? "Show less" : `Show more (${posts.length})`}
        </button>
      )}
    </div>
  );
}

/** Detail panel for one Page: KPI cards + trend chart + its posts (same dashboard
 *  treatment scoped to the page) over a selectable range. Exported + embeddable so
 *  the Page Control → Analytics sub-tab reuses it verbatim: pass `embedded` to drop
 *  the duplicate header / close button / inner range control (Page Control owns
 *  those) and a controlled `range` to drive it from the shared dashboard chips. */
export function PageDetail({
  page,
  initialRange,
  range: controlledRange,
  onClose,
  embedded,
}: {
  page: InsightsPageRow;
  initialRange: Range;
  range?: Range;
  onClose?: () => void;
  embedded?: boolean;
}) {
  const { error } = useToast();
  const [internalRange, setRange] = useState<Range>(initialRange);
  const range = controlledRange ?? internalRange;
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API}?detail=${encodeURIComponent(page.id)}&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) setData(json.detail as DetailData);
        else error(json.error || "Couldn’t load this Page’s insights.");
      })
      .catch(() => {
        if (!cancelled) error("Couldn’t load this Page’s insights.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page.id, range.from, range.to, error]);

  const curRows = useMemo(() => (data ? buildDayRows(range.from, range.to, new Map(data.days.map((d) => [d.date, d])), data.shares) : []), [data, range.from, range.to]);
  const prevRows = useMemo(() => {
    if (!data) return [];
    const prevP = previousPeriod(range.from, range.to);
    return buildDayRows(prevP.from, prevP.to, new Map(data.daysPrev.map((d) => [d.date, d])), {});
  }, [data, range.from, range.to]);
  const rankedPosts = useMemo(() => {
    if (!data) return [];
    return [...data.posts].sort((a, b) => (b.reactions ?? 0) + (b.comments ?? 0) + (b.shares ?? 0) - ((a.reactions ?? 0) + (a.comments ?? 0) + (a.shares ?? 0)));
  }, [data]);

  const includesToday = range.to === ppToday();

  return (
    <div
      className={embedded ? "" : "adm-card adm-card-pad"}
      style={embedded ? undefined : { marginBottom: 16, borderColor: "var(--adm-green, #16a34a)" }}
    >
      {!embedded && (
        <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <FacebookPageAvatar key={page.id} dbId={page.id} name={page.pageName} avatarUrl={page.avatarUrl} size={48} />
            <div style={{ minWidth: 0 }}>
              <div className="adm-card-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{page.pageName}</div>
              <div className="adm-card-sub" style={{ marginTop: 2 }}>{page.categoryGroup} · dashboard &amp; posts</div>
            </div>
          </div>
          {onClose && (
            <button type="button" className="adm-iconbtn" aria-label="Close detail" onClick={onClose}>
              <CloseIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      )}

      {!embedded && <RangeControl range={range} onChange={setRange} busy={loading} />}

      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading {formatRange(range.from, range.to)} from Facebook…
        </p>
      ) : !data ? null : data.status === "reconnect" ? (
        <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 14 }}>
          This Page’s token can’t read insights. Recent posts below still work.
        </p>
      ) : (
        <InsightsDashboard curRows={curRows} prevRows={prevRows} prevPostsTotal={data.prevPostsTotal} includesToday={includesToday} />
      )}

      <div style={{ marginTop: 18 }}>
        <div className="adm-card-title" style={{ fontSize: 14 }}>Top posts via our system</div>
        {!data || rankedPosts.length === 0 ? (
          <p className="adm-card-sub" style={{ marginTop: 8 }}>
            No posts shared to this Page yet. Share an article from the <strong>Share</strong> tab and its stats appear here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {rankedPosts.map((p) => (
              <PostRow key={p.id} post={p} />
            ))}
          </div>
        )}
      </div>

      {data && data.status !== "reconnect" && <DayTable rows={curRows} />}
    </div>
  );
}

/**
 * Insights tab — a Business-Suite-style dashboard: KPI cards (reach · engagement ·
 * net follows · our posts, each with % change vs the previous equal-length period
 * + a sparkline), a metric-switchable trend chart with an optional previous-period
 * overlay, a network "Top posts" section, and the per-Page table (sortable,
 * searchable, paginated) with click-through to a per-Page version of the same
 * dashboard. Range chips (Today · Yesterday · 7d · 28d · 90d · Custom, Phnom Penh)
 * drive everything. Data loads progressively in batches (network daily totals are
 * summed from cached per-page data, never one giant request).
 */
export function FacebookPageInsights({ pages }: { pages: InsightsPageRow[] }) {
  const { error } = useToast();
  const [data, setData] = useState<Map<string, Overview>>(new Map());
  const [networkDaily, setNetworkDaily] = useState<Map<string, DayPoint>>(new Map());
  const [networkDailyPrev, setNetworkDailyPrev] = useState<Map<string, DayPoint>>(new Map());
  const [networkShares, setNetworkShares] = useState<Record<string, number>>({});
  const [prevPostsTotal, setPrevPostsTotal] = useState(0);
  const [topPosts, setTopPosts] = useState<TopPost[]>([]);
  const [topLoading, setTopLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: pages.length });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reach28");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [range, setRange] = useState<Range>(() => ({ preset: "7d", ...presetRange("7d") }));
  const [detailId, setDetailId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const detailRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { sortKey?: SortKey; sortDir?: "asc" | "desc"; query?: string; range?: Range };
        if (v.sortKey) setSortKey(v.sortKey);
        if (v.sortDir) setSortDir(v.sortDir);
        if (typeof v.query === "string") setQuery(v.query);
        if (v.range?.from && v.range?.to && v.range?.preset) setRange(v.range);
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ sortKey, sortDir, query, range }));
    } catch {
      /* ignore */
    }
  }, [sortKey, sortDir, query, range]);

  const loadAll = useCallback(
    async (rng: Range, opts?: { refresh?: boolean }) => {
      if (pages.length === 0) return;
      setLoading(true);
      setTopLoading(true);
      setProgress({ done: 0, total: pages.length });
      const ovAcc = opts?.refresh ? new Map<string, Overview>() : new Map(dataRef.current);
      const dailyAcc = new Map<string, DayPoint>();
      const dailyPrevAcc = new Map<string, DayPoint>();
      let anyError = false;

      // Network "our posts" (+ prev total) and Top posts — cheap, in parallel.
      const sharesP = fetch(`${API}?networkShares=1&from=${rng.from}&to=${rng.to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (j.ok ? { shares: (j.shares ?? {}) as Record<string, number>, prevPostsTotal: Number(j.prevPostsTotal) || 0 } : { shares: {}, prevPostsTotal: 0 }))
        .catch(() => ({ shares: {} as Record<string, number>, prevPostsTotal: 0 }));
      const topP = fetch(`${API}?topPosts=1&from=${rng.from}&to=${rng.to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (j.ok && Array.isArray(j.posts) ? (j.posts as TopPost[]) : []))
        .catch(() => [] as TopPost[]);

      for (let i = 0; i < pages.length; i += BATCH) {
        const slice = pages.slice(i, i + BATCH).map((p) => p.id);
        try {
          const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageDbIds: slice, refresh: opts?.refresh === true, from: rng.from, to: rng.to }),
          });
          const json = await res.json();
          if (json.ok && Array.isArray(json.rows)) {
            for (const row of json.rows as (Overview & { pageDbId: string })[]) {
              ovAcc.set(row.pageDbId, { followers: row.followers, reach28: row.reach28, engagement28: row.engagement28, status: row.status, avatarUrl: row.avatarUrl, cachedAt: row.cachedAt });
            }
            if (Array.isArray(json.daily)) for (const dp of json.daily as DayPoint[]) mergeDaily(dailyAcc, dp);
            if (Array.isArray(json.dailyPrev)) for (const dp of json.dailyPrev as DayPoint[]) mergeDaily(dailyPrevAcc, dp);
          } else {
            anyError = true;
          }
        } catch {
          anyError = true;
        }
        setData(new Map(ovAcc));
        setNetworkDaily(new Map(dailyAcc));
        setNetworkDailyPrev(new Map(dailyPrevAcc));
        setProgress({ done: Math.min(i + BATCH, pages.length), total: pages.length });
      }

      const sh = await sharesP;
      setNetworkShares(sh.shares);
      setPrevPostsTotal(sh.prevPostsTotal);
      setLoading(false);
      topP.then((tp) => {
        setTopPosts(tp);
        setTopLoading(false);
      });
      if (anyError) error("Some Pages couldn’t be loaded — try Refresh.");
    },
    [pages, error],
  );

  useEffect(() => {
    if (!ready) return;
    void loadAll(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, range]);

  function onSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(NUMERIC_KEYS.includes(k) ? "desc" : "asc");
    }
  }

  function openDetail(id: string) {
    setDetailId(id);
    requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const merged: MergedRow[] = useMemo(
    () =>
      pages.map((p) => {
        const o = data.get(p.id);
        return {
          ...p,
          followers: o?.followers ?? null,
          reach28: o?.reach28 ?? null,
          engagement28: o?.engagement28 ?? null,
          ovStatus: o?.status ?? null,
          needsReconnect: o?.status === "reconnect" || p.status === "Expired",
          effectiveAvatar: o?.avatarUrl !== undefined ? o.avatarUrl : p.avatarUrl,
        };
      }),
    [pages, data],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return merged;
    return merged.filter((r) => r.pageName.toLowerCase().includes(q) || r.categoryGroup.toLowerCase().includes(q));
  }, [merged, query]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      if (sortKey === "name") return sortDir === "asc" ? a.pageName.localeCompare(b.pageName) : b.pageName.localeCompare(a.pageName);
      const av = numFor(a, sortKey);
      const bv = numFor(b, sortKey);
      if (av == null && bv == null) return a.pageName.localeCompare(b.pageName);
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  const totalFollowers = useMemo(() => {
    let followers = 0;
    let have = false;
    for (const r of filtered) if (r.followers != null) { followers += r.followers; have = true; }
    return have ? followers : null;
  }, [filtered]);

  const curRows = useMemo(() => buildDayRows(range.from, range.to, networkDaily, networkShares), [range, networkDaily, networkShares]);
  const prevRows = useMemo(() => {
    const prevP = previousPeriod(range.from, range.to);
    return buildDayRows(prevP.from, prevP.to, networkDailyPrev, {});
  }, [range, networkDailyPrev]);

  const { page, setPage, pageCount, pageItems, start, total } = usePaged(sorted, PER_PAGE);
  const detailPage = detailId ? pages.find((p) => p.id === detailId) ?? null : null;

  if (pages.length === 0) {
    return (
      <div className="adm-card adm-card-pad">
        <div className="adm-card-title">Insights</div>
        <p className="adm-card-sub" style={{ marginTop: 8 }}>
          No connected Pages yet. Connect a Page in the <strong>Pages</strong> tab, then per-Page performance shows up here.
        </p>
      </div>
    );
  }

  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const includesToday = range.to === ppToday();

  return (
    <div>
      {detailPage && (
        <div ref={detailRef}>
          <PageDetail page={detailPage} initialRange={range} onClose={() => setDetailId(null)} />
        </div>
      )}

      <div className="adm-card adm-card-pad">
        <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title">Insights dashboard</div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>
              {formatNumber(pages.length)} Page{pages.length === 1 ? "" : "s"}
              {totalFollowers != null ? ` · ${formatNumber(totalFollowers)} followers` : ""} · Facebook Graph API
            </div>
          </div>
          <button type="button" className="adm-btn-ghost" onClick={() => loadAll(range, { refresh: true })} disabled={loading} title="Re-fetch fresh numbers from Facebook (ignores the cache)">
            <RefreshIcon className={`h-4 w-4 ${loading ? "adm-spinning" : ""}`} /> Refresh
          </button>
        </div>

        <RangeControl range={range} onChange={setRange} busy={loading} />

        {/* KPI cards + trend chart (network) */}
        <InsightsDashboard curRows={curRows} prevRows={prevRows} prevPostsTotal={prevPostsTotal} includesToday={includesToday} />

        {/* Progress while a batch load runs */}
        {loading && (
          <div style={{ marginTop: 14 }}>
            <div className="adm-fb-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="adm-spinner" aria-hidden /> Loading insights… {formatNumber(progress.done)} / {formatNumber(progress.total)}
            </div>
            <div className="adm-bar-track" style={{ height: 6, borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--adm-green, #16a34a)", transition: "width .3s" }} />
            </div>
          </div>
        )}

        {/* Top posts (network) */}
        <div style={{ marginTop: 20 }}>
          <div className="adm-card-title" style={{ fontSize: 14 }}>Top posts · network</div>
          <div className="adm-card-sub" style={{ marginTop: 2 }}>Best of our shares in this range, by engagement.</div>
          <TopPosts posts={topPosts} loading={topLoading} />
        </div>

        {/* Top pages table */}
        <div style={{ marginTop: 20 }}>
          <div className="adm-card-title" style={{ fontSize: 14 }}>Top pages</div>
          <div className="adm-search" style={{ marginTop: 10, maxWidth: 360 }}>
            <SearchIcon className="h-4 w-4" aria-hidden />
            <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Pages or groups…" aria-label="Search Pages" />
            {query && (
              <button type="button" className="adm-iconbtn" aria-label="Clear search" onClick={() => setQuery("")} style={{ width: 32, height: 32 }}>
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <div style={{ overflowX: "auto", marginTop: 6 }}>
            <table className="adm-table">
              <thead>
                <tr>
                  <Th label="Page" col="name" sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
                  <Th label="Followers" col="followers" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                  <Th label="Reach · 28d" col="reach28" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                  <Th label="Engagement · 28d" col="engagement28" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                  <Th label="Posts" col="posts" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                  <Th label="Last shared" col="lastShared" sortKey={sortKey} sortDir={sortDir} onSort={onSort} align="right" />
                </tr>
              </thead>
              <tbody>
                {pageItems.map((r) => {
                  const pending = r.ovStatus == null && loading;
                  return (
                    <tr key={r.id} onClick={() => openDetail(r.id)} style={{ cursor: "pointer" }} title="Open dashboard">
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <FacebookPageAvatar dbId={r.id} name={r.pageName} avatarUrl={r.effectiveAvatar} size={32} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                              <span style={{ fontWeight: 600, color: "var(--adm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 210 }}>{r.pageName}</span>
                              {r.needsReconnect && <ReconnectBadge />}
                            </div>
                            <div className="adm-fb-sub" style={{ fontSize: 11 }}>{r.categoryGroup}</div>
                          </div>
                        </div>
                      </td>
                      <td className="adm-num-td" style={{ textAlign: "right" }}>{r.followers == null ? (pending ? "…" : "—") : formatNumber(r.followers)}</td>
                      <td className="adm-num-td" style={{ textAlign: "right" }}>{r.reach28 == null ? (pending ? "…" : "—") : formatNumber(r.reach28)}</td>
                      <td className="adm-num-td" style={{ textAlign: "right" }}>{r.engagement28 == null ? (pending ? "…" : "—") : formatNumber(r.engagement28)}</td>
                      <td className="adm-num-td" style={{ textAlign: "right" }}>{formatNumber(r.postedCount)}</td>
                      <td className="adm-num-td" style={{ textAlign: "right", whiteSpace: "nowrap" }}>{r.lastSharedAt ? formatDate(r.lastSharedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {sorted.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 14 }}>No Pages match “{query}”.</p>
          ) : (
            <>
              <div className="adm-fb-sub" style={{ marginTop: 10 }}>
                Showing {formatNumber(start + 1)}–{formatNumber(Math.min(start + PER_PAGE, total))} of {formatNumber(total)} · tap a row for its dashboard
              </div>
              <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
            </>
          )}
        </div>

        {/* Day-by-day breakdown (network) */}
        <div style={{ marginTop: 20 }}>
          <div className="adm-card-title" style={{ fontSize: 14 }}>Day-by-day · network</div>
          <DayTable rows={curRows} />
        </div>
      </div>
    </div>
  );
}
