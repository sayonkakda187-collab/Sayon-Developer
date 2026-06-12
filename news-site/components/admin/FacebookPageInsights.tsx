"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useToast } from "@/components/admin/Toast";
import { formatDate, formatNumber } from "@/lib/site";
import { RefreshIcon, CloseIcon, ExternalLinkIcon, SearchIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { type RangePreset, presetRange, ppToday, eachDate, formatDay, formatRange, addDays, dayCount } from "@/lib/fbInsightsRange";

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
  avatarUrl?: string | null; // refreshed during the insights fetch (may update the row)
  cachedAt: string;
};

type SeriesPoint = { date: string; value: number };
type DayPoint = { date: string; reach: number | null; engagement: number | null; follows: number | null };
type DayRow = DayPoint & { shares: number; partial: boolean };
type Range = { preset: RangePreset; from: string; to: string };

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
type DetailData = {
  pageDbId: string;
  pageName: string;
  from: string;
  to: string;
  status: "ok" | "reconnect";
  days: DayPoint[];
  shares: Record<string, number>;
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
  effectiveAvatar: string | null; // freshly-refreshed url (if any) else the server prop
};

/** Numeric value backing a sortable column (null → sorts last). */
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
// Pages per server call. Each page now also fetches a daily series, so keep the
// batch modest to stay well under the Hobby 60s function limit on a cold load.
const BATCH = 20;
const SS_KEY = "fbInsights.view"; // remembered sort + search + range for the session.

const API = "/api/admin/facebook/page-insights";

const PRESETS: { key: RangePreset; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "7d", label: "7d" },
  { key: "28d", label: "28d" },
  { key: "90d", label: "90d" },
];

function fmtNum(x: number | null): string {
  return x == null ? "—" : formatNumber(x);
}
function fmtSigned(x: number | null): string {
  return x == null ? "—" : (x > 0 ? "+" : "") + formatNumber(x);
}

/** Fill a date range with daily values + our share counts (missing days → null/0). */
function buildDayRows(from: string, to: string, daily: Map<string, DayPoint>, shares: Record<string, number>): DayRow[] {
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

/** Null-preserving add of one day into a running per-day sum (client side). */
function mergeDaily(acc: Map<string, DayPoint>, dp: DayPoint): void {
  const cur = acc.get(dp.date) ?? { date: dp.date, reach: null, engagement: null, follows: null };
  if (dp.reach != null) cur.reach = (cur.reach ?? 0) + dp.reach;
  if (dp.engagement != null) cur.engagement = (cur.engagement ?? 0) + dp.engagement;
  if (dp.follows != null) cur.follows = (cur.follows ?? 0) + dp.follows;
  acc.set(dp.date, cur);
}

/** Quick-range buttons (Today · Yesterday · 7d · 28d · 90d · Custom). */
function RangeControl({ range, onChange, busy }: { range: Range; onChange: (r: Range) => void; busy?: boolean }) {
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
    if (dayCount(from, to) > 92) from = addDays(to, -91); // server caps the window at 92 days
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

/** Sortable column header — click to sort, click again to flip direction. */
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
        style={{
          background: "none",
          border: "none",
          font: "inherit",
          letterSpacing: "inherit",
          textTransform: "inherit",
          color: active ? "var(--adm-ink)" : "inherit",
          cursor: "pointer",
          padding: 0,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          flexDirection: align === "right" ? "row-reverse" : "row",
        }}
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
    <span
      className="adm-pill"
      style={{ background: "rgba(245,158,11,.16)", color: "#b45309", fontSize: 10.5, fontWeight: 700 }}
      title="This Page's token can't read insights — reconnect it (Pages tab → Connect → Reconnect ALL pages) granting read_insights."
    >
      Needs reconnect
    </span>
  );
}

/** Dependency-free SVG sparkline (area + line) that scales to its container. */
function Sparkline({ points, color }: { points: SeriesPoint[]; color: string }) {
  if (points.length === 0) return null;
  const W = 300;
  const H = 60;
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

/** One trend card: headline total + sparkline (or a friendly empty state). When
 *  `signed`, the total is a delta (e.g. net follows) and shows a +/− sign. */
function TrendCard({ title, points, color, emptyHint, signed }: { title: string; points: SeriesPoint[]; color: string; emptyHint: string; signed?: boolean }) {
  const total = points.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ border: "1px solid var(--adm-bd)", borderRadius: 14, padding: 12, background: "var(--adm-card)", minWidth: 0 }}>
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {points.length === 0 ? (
        <div className="adm-fb-sub" style={{ marginTop: 8 }}>{emptyHint}</div>
      ) : (
        <>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
            {signed ? fmtSigned(total) : formatNumber(total)}
          </div>
          <Sparkline points={points} color={color} />
        </>
      )}
    </div>
  );
}

/** Reach / engagement / new-follows daily charts for a range (network or page). */
function DailyCharts({ rows }: { rows: DayRow[] }) {
  const hasAny = rows.some((r) => r.reach != null || r.engagement != null || r.follows != null);
  const seriesOf = (k: "reach" | "engagement" | "follows"): SeriesPoint[] => rows.map((r) => ({ date: r.date, value: r[k] ?? 0 }));
  if (!hasAny) {
    return <p className="adm-fb-sub" style={{ marginTop: 12 }}>No day-by-day data for this range yet.</p>;
  }
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
      <TrendCard title="Reach" points={seriesOf("reach")} color="#2563eb" emptyHint="No reach data" />
      <TrendCard title="Engagement" points={seriesOf("engagement")} color="#16a34a" emptyHint="No engagement data" />
      <TrendCard title="New follows" points={seriesOf("follows")} color="#9333ea" emptyHint="No follow data" signed />
    </div>
  );
}

const STICKY_TH: CSSProperties = { position: "sticky", top: 0, background: "var(--adm-card)", zIndex: 1 };

/** Per-day breakdown table: date · reach · engagement · follower change · our posts. */
function DayTable({ rows }: { rows: DayRow[] }) {
  if (rows.length === 0) return null;
  const view = [...rows].reverse(); // newest day first
  return (
    <div style={{ overflowX: "auto", marginTop: 12 }}>
      <div style={{ maxHeight: 360, overflowY: "auto", border: "1px solid var(--adm-bd)", borderRadius: 12 }}>
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
      <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : formatNumber(value)}
      </span>
      <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{label}</span>
    </span>
  );
}

function PartialNote() {
  return (
    <p className="adm-fb-sub" style={{ marginTop: 8 }}>
      Today is <strong>partial</strong> — Facebook is still finalizing today’s numbers, so they’ll keep rising.
    </p>
  );
}

/** Detail panel for one Page: range control, day-by-day charts + table, and
 *  recent posts (from our own share records) with per-post stats. */
function PageDetail({ page, initialRange, onClose }: { page: InsightsPageRow; initialRange: Range; onClose: () => void }) {
  const { error } = useToast();
  const [range, setRange] = useState<Range>(initialRange);
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

  const rows = useMemo(() => {
    if (!data) return [];
    return buildDayRows(range.from, range.to, new Map(data.days.map((d) => [d.date, d])), data.shares);
  }, [data, range.from, range.to]);

  const includesToday = range.to === ppToday();

  return (
    <div className="adm-card adm-card-pad" style={{ marginBottom: 16, borderColor: "var(--adm-green, #16a34a)" }}>
      <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <FacebookPageAvatar key={page.id} dbId={page.id} name={page.pageName} avatarUrl={page.avatarUrl} size={48} />
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{page.pageName}</div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>{page.categoryGroup} · day-by-day &amp; recent posts</div>
          </div>
        </div>
        <button type="button" className="adm-iconbtn" aria-label="Close detail" onClick={onClose}>
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>

      <RangeControl range={range} onChange={setRange} busy={loading} />

      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading {formatRange(range.from, range.to)} from Facebook…
        </p>
      ) : !data ? null : data.status === "reconnect" ? (
        <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 14 }}>
          This Page’s token can’t read insights. Reconnect it (Pages tab → Connect → <strong>Reconnect ALL pages</strong>)
          granting <strong>read_insights</strong> to see trends. Recent posts below still work.
        </p>
      ) : (
        <>
          <DailyCharts rows={rows} />
          {includesToday && <PartialNote />}
          <DayTable rows={rows} />
        </>
      )}

      <div style={{ marginTop: 18 }}>
        <div className="adm-card-title" style={{ fontSize: 14 }}>Recent posts via our system</div>
        {!data || data.posts.length === 0 ? (
          <p className="adm-card-sub" style={{ marginTop: 8 }}>
            No posts shared to this Page yet. Share an article from the <strong>Share</strong> tab and its stats appear here.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
            {data.posts.map((p) => (
              <div key={p.id} style={{ border: "1px solid var(--adm-bd)", borderRadius: 12, padding: 10, background: "var(--adm-card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <span style={{ fontWeight: 600, color: "var(--adm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{p.title}</span>
                  <a href={p.permalink} target="_blank" rel="noreferrer" className="adm-link" style={{ fontSize: 12, flex: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                    View <ExternalLinkIcon className="h-3.5 w-3.5" />
                  </a>
                </div>
                <div className="adm-fb-sub" style={{ marginTop: 1 }}>{p.postedAt ? `Posted ${formatDate(p.postedAt)}` : "Posted"}</div>
                <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 8 }}>
                  <PostStat label="Reactions" value={p.reactions} />
                  <PostStat label="Comments" value={p.comments} />
                  <PostStat label="Shares" value={p.shares} />
                  <PostStat label="Reach" value={p.reach} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Insights tab: a network day-by-day view (reach/engagement chart + per-day table
 * over a selectable range — Today · Yesterday · 7d · 28d · 90d · Custom, in Phnom
 * Penh) on top of a sortable, searchable, paginated per-Page overview table with a
 * click-through detail panel. Overviews + each Page's daily series load
 * progressively in small batches (the network daily totals are summed from cached
 * per-page data, never one giant request); Pages whose token can't read insights
 * show a "needs reconnect" badge instead of failing.
 */
export function FacebookPageInsights({ pages }: { pages: InsightsPageRow[] }) {
  const { error } = useToast();
  const [data, setData] = useState<Map<string, Overview>>(new Map());
  const [networkDaily, setNetworkDaily] = useState<Map<string, DayPoint>>(new Map());
  const [networkShares, setNetworkShares] = useState<Record<string, number>>({});
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

  // Restore remembered sort + search + range for the session (client-only).
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

  // Persist sort + search + range.
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
      setProgress({ done: 0, total: pages.length });
      const ovAcc = opts?.refresh ? new Map<string, Overview>() : new Map(dataRef.current);
      const dailyAcc = new Map<string, DayPoint>();
      let anyError = false;

      // Network "our posts per day" — one cheap DB call, in parallel with batches.
      const sharesP = fetch(`${API}?networkShares=1&from=${rng.from}&to=${rng.to}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => (j.ok && j.shares ? (j.shares as Record<string, number>) : {}))
        .catch(() => ({}) as Record<string, number>);

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
          } else {
            anyError = true;
          }
        } catch {
          anyError = true;
        }
        setData(new Map(ovAcc));
        setNetworkDaily(new Map(dailyAcc));
        setProgress({ done: Math.min(i + BATCH, pages.length), total: pages.length });
      }
      setNetworkShares(await sharesP);
      setLoading(false);
      if (anyError) error("Some Pages couldn’t be loaded — try Refresh.");
    },
    [pages, error],
  );

  // Load on mount (after restoring the saved range) and whenever the range changes.
  useEffect(() => {
    if (!ready) return;
    void loadAll(range);
    // loadAll is stable for a given page list; re-running only on range change is intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, range]);

  function onSort(k: SortKey) {
    if (k === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
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
      if (sortKey === "name") {
        return sortDir === "asc" ? a.pageName.localeCompare(b.pageName) : b.pageName.localeCompare(a.pageName);
      }
      const av = numFor(a, sortKey);
      const bv = numFor(b, sortKey);
      if (av == null && bv == null) return a.pageName.localeCompare(b.pageName);
      if (av == null) return 1; // nulls always last
      if (bv == null) return -1;
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [filtered, sortKey, sortDir]);

  // Network totals across the FILTERED set (not just the current page).
  const totals = useMemo(() => {
    let followers = 0;
    let reach = 0;
    let haveF = false;
    let haveR = false;
    for (const r of filtered) {
      if (r.followers != null) {
        followers += r.followers;
        haveF = true;
      }
      if (r.reach28 != null) {
        reach += r.reach28;
        haveR = true;
      }
    }
    return { followers: haveF ? followers : null, reach: haveR ? reach : null };
  }, [filtered]);

  const networkRows = useMemo(() => buildDayRows(range.from, range.to, networkDaily, networkShares), [range, networkDaily, networkShares]);

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
            <div className="adm-card-title">Page insights</div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>
              Per-Page performance from the Facebook Graph API · {formatNumber(pages.length)} Page{pages.length === 1 ? "" : "s"}
            </div>
          </div>
          <button type="button" className="adm-btn-ghost" onClick={() => loadAll(range, { refresh: true })} disabled={loading} title="Re-fetch fresh numbers from Facebook (ignores the cache)">
            <RefreshIcon className={`h-4 w-4 ${loading ? "adm-spinning" : ""}`} /> Refresh
          </button>
        </div>

        {/* Network totals (range-independent headline KPIs) */}
        <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginTop: 12, padding: "10px 12px", border: "1px solid var(--adm-bd)", borderRadius: 12, background: "var(--adm-card)" }}>
          <div>
            <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>Network followers</div>
            <div style={{ fontWeight: 800, fontSize: 19, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums" }}>{totals.followers == null ? "—" : formatNumber(totals.followers)}</div>
          </div>
          <div>
            <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>28-day reach</div>
            <div style={{ fontWeight: 800, fontSize: 19, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums" }}>{totals.reach == null ? "—" : formatNumber(totals.reach)}</div>
          </div>
        </div>

        {/* Day-by-day (network) */}
        <div style={{ marginTop: 18 }}>
          <div className="adm-card-title" style={{ fontSize: 14 }}>Day-by-day · network</div>
          <RangeControl range={range} onChange={setRange} busy={loading} />
          <DailyCharts rows={networkRows} />
          {includesToday && <PartialNote />}
          <DayTable rows={networkRows} />
        </div>

        {/* Search */}
        <div className="adm-search" style={{ marginTop: 18, maxWidth: 360 }}>
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Pages or groups…" aria-label="Search Pages" />
          {query && (
            <button type="button" className="adm-iconbtn" aria-label="Clear search" onClick={() => setQuery("")} style={{ width: 24, height: 24 }}>
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress while a batch load runs */}
        {loading && (
          <div style={{ marginTop: 12 }}>
            <div className="adm-fb-sub" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="adm-spinner" aria-hidden /> Loading insights… {formatNumber(progress.done)} / {formatNumber(progress.total)}
            </div>
            <div className="adm-bar-track" style={{ height: 6, borderRadius: 4, marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "var(--adm-green, #16a34a)", transition: "width .3s" }} />
            </div>
          </div>
        )}

        {/* Overview table (horizontally scrollable on small screens) */}
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
                  <tr key={r.id} onClick={() => openDetail(r.id)} style={{ cursor: "pointer" }} title="Open detail">
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
              Showing {formatNumber(start + 1)}–{formatNumber(Math.min(start + PER_PAGE, total))} of {formatNumber(total)} · tap a row for day-by-day &amp; recent posts
            </div>
            <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
