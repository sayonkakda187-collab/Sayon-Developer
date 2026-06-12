"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { formatDate, formatNumber } from "@/lib/site";
import { RefreshIcon, CloseIcon, ExternalLinkIcon, SearchIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";

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
type DetailSeries = {
  reach: SeriesPoint[];
  engagement: SeriesPoint[];
  follows: SeriesPoint[];
  reachMetric: string | null;
  engagementMetric: string | null;
  followsMetric: string | null;
};
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
  days: number;
  status: "ok" | "reconnect";
  series: DetailSeries;
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
const BATCH = 25; // Pages fetched per server call (fits the Hobby 60s limit).
const SS_KEY = "fbInsights.view"; // remembered sort + search for the session.

const API = "/api/admin/facebook/page-insights";

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

/** One trend card: headline total + sparkline (or a friendly empty state). */
function TrendCard({ title, points, color, emptyHint }: { title: string; points: SeriesPoint[]; color: string; emptyHint: string }) {
  const total = points.reduce((s, p) => s + p.value, 0);
  return (
    <div style={{ border: "1px solid var(--adm-bd)", borderRadius: 14, padding: 12, background: "var(--adm-card)", minWidth: 0 }}>
      <div className="adm-fb-sub" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
      {points.length === 0 ? (
        <div className="adm-fb-sub" style={{ marginTop: 8 }}>{emptyHint}</div>
      ) : (
        <>
          <div style={{ fontWeight: 800, fontSize: 20, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums", marginTop: 2 }}>
            {formatNumber(total)}
          </div>
          <Sparkline points={points} color={color} />
        </>
      )}
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

/** Detail panel for one Page: 7/28/90-day reach/engagement/follows trends +
 *  recent posts (from our own share records) with per-post stats. */
function PageDetail({ page, onClose }: { page: InsightsPageRow; onClose: () => void }) {
  const { error } = useToast();
  const [days, setDays] = useState<7 | 28 | 90>(28);
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${API}?detail=${encodeURIComponent(page.id)}&days=${days}`, { cache: "no-store" })
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
  }, [page.id, days, error]);

  return (
    <div className="adm-card adm-card-pad" style={{ marginBottom: 16, borderColor: "var(--adm-green, #16a34a)" }}>
      <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <FacebookPageAvatar key={page.id} dbId={page.id} name={page.pageName} avatarUrl={page.avatarUrl} size={48} />
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{page.pageName}</div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>{page.categoryGroup} · trends &amp; recent posts</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <div className="adm-seg" role="tablist" aria-label="Date range">
            {([7, 28, 90] as const).map((d) => (
              <button key={d} type="button" role="tab" aria-selected={days === d} className={`adm-seg-btn ${days === d ? "on" : ""}`} onClick={() => setDays(d)}>
                {d}d
              </button>
            ))}
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Close detail" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading {days}-day trends from Facebook…
        </p>
      ) : !data ? null : data.status === "reconnect" ? (
        <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 14 }}>
          This Page’s token can’t read insights. Reconnect it (Pages tab → Connect → <strong>Reconnect ALL pages</strong>)
          granting <strong>read_insights</strong> to see trends. Recent posts below still work.
        </p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 14 }}>
          <TrendCard title={`Reach · ${days}d`} points={data.series.reach} color="#2563eb" emptyHint="No reach data yet" />
          <TrendCard title={`Engagement · ${days}d`} points={data.series.engagement} color="#16a34a" emptyHint="No engagement data yet" />
          <TrendCard title={`New follows · ${days}d`} points={data.series.follows} color="#9333ea" emptyHint="No follow data yet" />
        </div>
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
 * Insights tab: a sortable, searchable, paginated overview table of every
 * connected Page (followers · 28-day reach · 28-day engagement · posts via us ·
 * last shared), with a network totals row, a Refresh (busts the ~12h cache), and a
 * click-through detail panel. Overviews load progressively in small batches with a
 * progress indicator so ~264 Pages never need one giant request, and a Page whose
 * token can't read insights shows a "needs reconnect" badge instead of failing.
 */
export function FacebookPageInsights({ pages }: { pages: InsightsPageRow[] }) {
  const { error } = useToast();
  const [data, setData] = useState<Map<string, Overview>>(new Map());
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: pages.length });
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("reach28");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailId, setDetailId] = useState<string | null>(null);
  const ranOnce = useRef(false);
  const detailRef = useRef<HTMLDivElement | null>(null);

  // Restore remembered sort + search for the session (client-only; avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(SS_KEY);
      if (raw) {
        const v = JSON.parse(raw) as { sortKey?: SortKey; sortDir?: "asc" | "desc"; query?: string };
        if (v.sortKey) setSortKey(v.sortKey);
        if (v.sortDir) setSortDir(v.sortDir);
        if (typeof v.query === "string") setQuery(v.query);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Persist sort + search.
  useEffect(() => {
    try {
      sessionStorage.setItem(SS_KEY, JSON.stringify({ sortKey, sortDir, query }));
    } catch {
      /* ignore */
    }
  }, [sortKey, sortDir, query]);

  const loadOverviews = useCallback(
    async (opts?: { refresh?: boolean }) => {
      if (pages.length === 0) return;
      setLoading(true);
      setProgress({ done: 0, total: pages.length });
      const acc = opts?.refresh ? new Map<string, Overview>() : new Map(data);
      let anyError = false;
      for (let i = 0; i < pages.length; i += BATCH) {
        const slice = pages.slice(i, i + BATCH).map((p) => p.id);
        try {
          const res = await fetch(API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pageDbIds: slice, refresh: opts?.refresh === true }),
          });
          const json = await res.json();
          if (json.ok && Array.isArray(json.rows)) {
            for (const row of json.rows as (Overview & { pageDbId: string })[]) {
              acc.set(row.pageDbId, { followers: row.followers, reach28: row.reach28, engagement28: row.engagement28, status: row.status, avatarUrl: row.avatarUrl, cachedAt: row.cachedAt });
            }
          } else {
            anyError = true;
          }
        } catch {
          anyError = true;
        }
        setData(new Map(acc));
        setProgress({ done: Math.min(i + BATCH, pages.length), total: pages.length });
      }
      setLoading(false);
      if (anyError) error("Some Pages couldn’t be loaded — try Refresh.");
    },
    // `data` intentionally omitted: we snapshot it at call time and a stale read
    // only means a refresh re-fetches a Page already in the map (harmless).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pages, error],
  );

  // Load once on mount.
  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    void loadOverviews();
  }, [loadOverviews]);

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
    // Bring the panel into view (it renders above the table).
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

  return (
    <div>
      {detailPage && (
        <div ref={detailRef}>
          <PageDetail page={detailPage} onClose={() => setDetailId(null)} />
        </div>
      )}

      <div className="adm-card adm-card-pad">
        <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title">Page insights</div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>
              Per-Page performance from the Facebook Graph API · cached ~12h · {formatNumber(pages.length)} Page{pages.length === 1 ? "" : "s"}
            </div>
          </div>
          <button type="button" className="adm-btn-ghost" onClick={() => loadOverviews({ refresh: true })} disabled={loading} title="Re-fetch fresh numbers from Facebook (ignores the cache)">
            <RefreshIcon className={`h-4 w-4 ${loading ? "adm-spinning" : ""}`} /> Refresh
          </button>
        </div>

        {/* Network totals */}
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

        {/* Search */}
        <div className="adm-search" style={{ marginTop: 12, maxWidth: 360 }}>
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input value={query} onChange={(e) => { setQuery(e.target.value); setPage(1); }} placeholder="Search Pages or groups…" aria-label="Search Pages" />
          {query && (
            <button type="button" className="adm-iconbtn" aria-label="Clear search" onClick={() => setQuery("")} style={{ width: 24, height: 24 }}>
              <CloseIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Progress while the first batch load runs */}
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
              Showing {formatNumber(start + 1)}–{formatNumber(Math.min(start + PER_PAGE, total))} of {formatNumber(total)} · tap a row for trends &amp; recent posts
            </div>
            <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
