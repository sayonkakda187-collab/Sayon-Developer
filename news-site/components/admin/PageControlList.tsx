"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { PlusIcon, SearchIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatNumber } from "@/lib/site";
import { usePageControlSearch } from "@/components/admin/pageControlSearchStore";
import { PageControlConnectModal } from "@/components/admin/PageControlConnectModal";
import { AnimatedSparkline, AnimatedAreaChart, AnimatedStackedBars, TypeMixBar, CountUp } from "@/components/admin/PageControlCharts";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { RangeControl, type InsightsPageRow, type Range } from "@/components/admin/FacebookPageInsights";
import { presetRange, rangeKey, formatRange, ppToday } from "@/lib/fbInsightsRange";

const PER_PAGE = 24;
const STATS_API = "/api/admin/page-control/stats";
const BATCH = 8;
const SS_RANGE = "pageControl.listRange";

/** Remembered list range (recompute relative presets vs today; keep custom dates). */
function initialRange(): Range {
  const fallback: Range = { preset: "28d", ...presetRange("28d") };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(SS_RANGE);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Range>;
      if (r.preset === "custom" && r.from && r.to) return { preset: "custom", from: r.from, to: r.to };
      if (r.preset && r.preset !== "custom") return { preset: r.preset, ...presetRange(r.preset) };
    }
  } catch {
    // fall through
  }
  return fallback;
}

/** A monitored page row for the landing list (InsightsPageRow + follower count +
 *  the id of its assigned manager, if any). */
export type MonitoredRow = InsightsPageRow & { followers: number | null; managerId: string | null };

// Posts published WITHIN the selected range, split video vs image/other (capped = floor).
type RangePosts = { total: number; video: number; image: number; capped: boolean };

// Client-safe shape of one row's range stats (matches the stats API).
type RowStatsData = {
  id: string;
  reach: number | null;
  engagement: number | null;
  follows: number | null;
  reachPrev: number | null;
  engagementPrev: number | null;
  followsPrev: number | null;
  sparkReach: number[];
  sparkEngagement: number[];
  rangePosts: RangePosts;
  status: "ok" | "reconnect";
};
type StatEntry = RowStatsData | "loading" | "error";

/** Compact number (12345 → "12.3k", 1_200_000 → "1.2M"). */
function compact(n: number | null): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k`;
  return String(Math.round(n));
}

/** Whole-percent change vs the previous period (null when there's no base). */
function delta(cur: number | null, prev: number | null): { txt: string; cls: "up" | "down" } | null {
  if (cur == null || prev == null || prev === 0) return null;
  const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
  if (pct === 0) return null;
  return { txt: `${pct > 0 ? "▲" : "▼"}${Math.abs(pct)}%`, cls: pct > 0 ? "up" : "down" };
}

function StatPill({ label, value, prev }: { label: string; value: number | null; prev: number | null }) {
  const d = delta(value, prev);
  return (
    <span className="adm-pc-stat">
      <span className="adm-pc-stat-k">{label}</span>
      <span className="adm-pc-stat-v">{compact(value)}</span>
      {d && <span className={`adm-pc-stat-d ${d.cls}`}>{d.txt}</span>}
    </span>
  );
}

/** Range-aware Posts pills: count of posts published IN the selected range (tiny
 *  count-up), split into 🎥 video (blue) + 🖼 image/other (coral). "Posts 0" when
 *  none (no broken split pills). "{n}+" when the range count hit the fetch cap. */
function PostsPill({ rp }: { rp: RangePosts }) {
  return (
    <>
      <span className="adm-pc-stat adm-pc-stat-posts">
        <span className="adm-pc-stat-k">Posts</span>
        <span className="adm-pc-stat-v">
          <CountUp value={rp.total} durationMs={500} format={(n) => `${Math.round(n)}${rp.capped ? "+" : ""}`} />
        </span>
      </span>
      {rp.total > 0 && rp.video > 0 && (
        <span className="adm-pc-stat adm-pc-stat-video">
          <span className="adm-pc-stat-v">🎥 {rp.video}</span>
          <span className="adm-pc-stat-k" style={{ textTransform: "none" }}>video</span>
        </span>
      )}
      {rp.total > 0 && rp.image > 0 && (
        <span className="adm-pc-stat adm-pc-stat-image">
          <span className="adm-pc-stat-v">🖼 {rp.image}</span>
          <span className="adm-pc-stat-k" style={{ textTransform: "none" }}>image</span>
        </span>
      )}
    </>
  );
}

/** The selected-range quick-stat pills under a row: shimmer while loading, "—" when
 *  a page has no insights / token can't read them, else Reach · Engaged · Follows + Δ%. */
function RowStats({ entry }: { entry: StatEntry | undefined }) {
  if (entry === undefined || entry === "loading") {
    return (
      <div className="adm-pc-stats" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span key={i} className="adm-pc-stat adm-pc-stat-skel" />
        ))}
      </div>
    );
  }
  if (entry === "error" || entry.status === "reconnect") {
    return (
      <div className="adm-pc-stats">
        <span className="adm-pc-stat"><span className="adm-pc-stat-k">Reach</span><span className="adm-pc-stat-v">—</span></span>
      </div>
    );
  }
  // Sparkline: default Reach; fall back to Engagement when reach has no data.
  const spark = entry.reach != null && entry.sparkReach.length > 1 ? entry.sparkReach : entry.sparkEngagement;
  return (
    <div className="adm-pc-statsrow">
      <div className="adm-pc-stats" title="Posts published in the range (🎥 video / 🖼 image) · selected range vs the previous equal-length period">
        <PostsPill rp={entry.rangePosts} />
        <StatPill label="Reach" value={entry.reach} prev={entry.reachPrev} />
        <StatPill label="Engaged" value={entry.engagement} prev={entry.engagementPrev} />
        <StatPill label="Follows" value={entry.follows} prev={entry.followsPrev} />
      </div>
      <span className="adm-pc-sparkwrap">
        <AnimatedSparkline values={spark} color="var(--section-accent)" width={92} height={28} />
      </span>
    </div>
  );
}

/**
 * Page Control landing — shows ONLY the pages connected INSIDE this tab
 * (MonitoredPage store), with its own "Connect Page" flow. Each row carries
 * range-aware quick stats (Reach · Engaged · Follows + Δ%) fetched lazily in small
 * batches with a per-row shimmer and cached ~6h server-side, plus a small read-only
 * badge in the top-right showing the assigned manager (none if unassigned). All
 * assigning happens in the Managers tab. A "Search by manager…" box filters the list
 * to the Pages a matching person manages, grouped per manager.
 */
export function PageControlList({
  pages,
  appConfigured,
  managers,
  assignments,
}: {
  pages: MonitoredRow[];
  appConfigured: boolean;
  managers: Manager[];
  assignments: Record<string, string | null>;
}) {
  const { success, error } = useToast();
  const router = useRouter();
  // The page-name filter comes from the header "Search Pages…" bar (shared store), so
  // there is exactly ONE page-search input — in the top header. The manager-search box
  // below is separate and filters by the assigned team member.
  const query = usePageControlSearch();
  const [showConnect, setShowConnect] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, StatEntry>>({});
  const requestedRef = useRef<Set<string>>(new Set());
  const [range, setRange] = useState<Range>(initialRange);
  const rk = rangeKey(range.from, range.to);

  // Manager filter (debounced).
  const [mq, setMq] = useState("");
  const [mqDebounced, setMqDebounced] = useState("");

  // Expandable rows: one open at a time (accordion) + a client cache of fetched chart
  // data per (page, range) so collapse/re-expand within a session never refetches.
  const [expanded, setExpanded] = useState<string | null>(null);
  const chartCacheRef = useRef<Map<string, RowChartsResp>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setMqDebounced(mq), 200);
    return () => clearTimeout(t);
  }, [mq]);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_RANGE, JSON.stringify(range));
    } catch {
      /* ignore (private mode / quota) */
    }
  }, [range]);

  const managerById = useMemo(() => new Map(managers.map((m) => [m.id, m])), [managers]);

  // 1) Page-name filter (header search) — unchanged behavior.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.pageName.toLowerCase().includes(q));
  }, [pages, query]);

  // 2) Manager filter — when active, narrow to Pages whose assigned manager's name
  // matches, and prepare per-manager groups for a grouped render.
  const mqv = mqDebounced.trim().toLowerCase();
  const managerActive = mqv !== "";
  const matchingManagerIds = useMemo(
    () => (managerActive ? new Set(managers.filter((m) => m.name.toLowerCase().includes(mqv)).map((m) => m.id)) : null),
    [managerActive, managers, mqv],
  );
  const managerFiltered = useMemo(() => {
    if (!managerActive || !matchingManagerIds) return filtered;
    return filtered.filter((p) => {
      const id = assignments[p.id];
      return id != null && matchingManagerIds.has(id);
    });
  }, [filtered, managerActive, matchingManagerIds, assignments]);

  const { page, setPage, pageCount, pageItems, total } = usePaged(managerFiltered, PER_PAGE);

  // In manager-search mode we render every match grouped (no pagination); otherwise the
  // normal paginated slice. Quick stats load for whichever rows are actually visible.
  const visibleRows = managerActive ? managerFiltered : pageItems;
  const groups = useMemo(() => {
    if (!managerActive || !matchingManagerIds) return [];
    return managers
      .filter((m) => matchingManagerIds.has(m.id))
      .map((m) => ({ manager: m, items: managerFiltered.filter((p) => assignments[p.id] === m.id) }))
      .filter((g) => g.items.length > 0);
  }, [managerActive, matchingManagerIds, managers, managerFiltered, assignments]);

  // Stats + the "requested" set are keyed by `${rangeKey}|${id}`, so each range has
  // its own cached view — switching ranges refetches only the not-yet-seen combos.
  const fetchBatch = useCallback(async (ids: string[], from: string, to: string, key: string) => {
    setStatsMap((prev) => {
      const next = { ...prev };
      ids.forEach((id) => (next[`${key}|${id}`] = "loading"));
      return next;
    });
    try {
      const res = await fetch(STATS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, from, to }),
      });
      const json = await res.json();
      setStatsMap((prev) => {
        const next = { ...prev };
        if (json.ok && Array.isArray(json.rows)) {
          const byId = new Map<string, RowStatsData>((json.rows as RowStatsData[]).map((r) => [r.id, r]));
          ids.forEach((id) => (next[`${key}|${id}`] = byId.get(id) ?? "error"));
        } else {
          ids.forEach((id) => (next[`${key}|${id}`] = "error"));
        }
        return next;
      });
    } catch {
      setStatsMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[`${key}|${id}`] = "error"));
        return next;
      });
    }
  }, []);

  // Fetch quick stats for the visible rows only (lazy), in small sequential batches so
  // we never burst Graph for the whole list. Re-runs when the visible set (pagination /
  // page-search / manager-search) OR the selected range changes.
  const idsKey = visibleRows.map((p) => p.id).join(",");
  useEffect(() => {
    const visible = idsKey ? idsKey.split(",") : [];
    const todo = visible.filter((id) => !requestedRef.current.has(`${rk}|${id}`));
    if (todo.length === 0) return;
    todo.forEach((id) => requestedRef.current.add(`${rk}|${id}`));
    let cancelled = false;
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += BATCH) {
        await fetchBatch(todo.slice(i, i + BATCH), range.from, range.to, rk);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, rk, range.from, range.to, fetchBatch]);

  function onConnected(added: number) {
    setShowConnect(false);
    success(added === 1 ? "Added 1 page to monitor." : `Added ${added} pages to monitor.`);
    router.refresh();
  }

  const connectBtn = (
    <button type="button" className="adm-btn-primary" onClick={() => setShowConnect(true)}>
      <PlusIcon className="h-4 w-4" /> Connect Page
    </button>
  );

  // One monitored-page row (reused in the flat list + the grouped manager view). The
  // compact row is UNCHANGED (avatar, name, manager badge, followers, pills, sparkline)
  // — tapping it toggles an inline charts panel below (expand in place, not navigate).
  // "Open page →" inside the panel keeps the full-dashboard action.
  function renderRow(p: MonitoredRow) {
    const m = assignments[p.id] ? managerById.get(assignments[p.id]!) ?? null : null;
    const isOpen = expanded === p.id;
    return (
      <div key={p.id} className={`adm-pc-rowwrap ${isOpen ? "on" : ""}`}>
        <div
          className="adm-card adm-pc-row"
          role="button"
          tabIndex={0}
          aria-expanded={isOpen}
          aria-label={`${p.pageName} — ${isOpen ? "collapse" : "expand"} charts`}
          onClick={() => setExpanded(isOpen ? null : p.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded(isOpen ? null : p.id);
            }
          }}
        >
          <FacebookPageAvatar dbId={p.id} name={p.pageName} avatarUrl={p.avatarUrl} size={44} />
          <div className="adm-pc-rowbody" style={{ minWidth: 0, flex: 1 }}>
            <div className="adm-pc-row-top">
              <div className="adm-pc-row-name">{p.pageName}</div>
              {m && (
                <span className="adm-pc-rowmgr" title={`Manager: ${m.name}`}>
                  <ManagerAvatar name={m.name} photo={m.photo} size={22} />
                  <span className="adm-pc-rowmgr-name">{m.name}</span>
                </span>
              )}
            </div>
            <div className="adm-card-sub" style={{ marginTop: 1 }}>
              Watch-only{p.followers != null ? ` · ${formatNumber(p.followers)} followers` : ""}
            </div>
            <RowStats entry={statsMap[`${rk}|${p.id}`]} />
          </div>
          {p.status !== "Connected" && <span className="adm-pill amber" style={{ flex: "none" }}>Reconnect</span>}
          <span className={`adm-pc-caret ${isOpen ? "on" : ""}`} aria-hidden>⌄</span>
        </div>
        {isOpen && <ExpandedRowCharts pageId={p.id} from={range.from} to={range.to} rk={rk} cache={chartCacheRef} />}
      </div>
    );
  }

  return (
    <div>
      {pages.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "32px 18px" }}>
          <div className="adm-card-title" style={{ fontSize: 18 }}>Monitor your first Page</div>
          <p className="adm-card-sub" style={{ maxWidth: 460, margin: "8px auto 16px" }}>
            Page Control is a <strong>watch-only</strong> dashboard with its own connection — separate from the Facebook
            posting tab. Connect Pages here (even from a different Facebook account) to see each one’s Summary, real
            published Content, and Analytics.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>{connectBtn}</div>
        </div>
      ) : (
        <>
          <div className="adm-list-head" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span className="adm-fb-sub">
              {total} monitored {total === 1 ? "Page" : "Pages"}
              {query.trim() ? ` matching “${query.trim()}”` : ""}
            </span>
            {connectBtn}
          </div>

          {/* Manager-search — filters the list to the Pages a matching person manages. */}
          <label className="adm-mgr-search adm-pc-mgrsearch">
            <SearchIcon className="h-4 w-4" />
            <input
              className="adm-input"
              value={mq}
              onChange={(e) => setMq(e.target.value)}
              placeholder="Search by manager…"
              aria-label="Search Pages by manager"
            />
            {mq && (
              <button type="button" className="adm-mgr-search-clear" aria-label="Clear manager search" onClick={() => setMq("")}>
                ×
              </button>
            )}
          </label>

          <div className="adm-pc-listrange">
            <RangeControl range={range} onChange={setRange} />
          </div>

          {managerActive ? (
            groups.length === 0 ? (
              <p className="adm-card-sub" style={{ marginTop: 8 }}>No Pages are managed by someone matching “{mqDebounced.trim()}”.</p>
            ) : (
              <div className="adm-pc-list">
                {groups.map((g) => (
                  <div key={g.manager.id} className="adm-pc-group">
                    <div className="adm-pc-group-head">
                      <ManagerAvatar name={g.manager.name} photo={g.manager.photo} size={22} />
                      <span className="adm-pc-group-name">{g.manager.name}</span>
                      <span className="adm-pc-group-count">· {g.items.length} {g.items.length === 1 ? "page" : "pages"}</span>
                    </div>
                    {g.items.map(renderRow)}
                  </div>
                ))}
              </div>
            )
          ) : (
            <>
              <div className="adm-pc-list">{pageItems.map(renderRow)}</div>

              {filtered.length === 0 && <p className="adm-card-sub" style={{ marginTop: 12 }}>No Pages match “{query}”.</p>}

              <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <span className="adm-fb-sub">Stats: {formatRange(range.from, range.to)}{range.to === ppToday() ? " · today partial" : ""}</span>
                <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
              </div>
            </>
          )}
        </>
      )}

      {showConnect && (
        <PageControlConnectModal
          appConfigured={appConfigured}
          onClose={() => setShowConnect(false)}
          onConnected={onConnected}
          onError={error}
        />
      )}
    </div>
  );
}

// Lazy chart payload for one expanded row (matches /api/admin/page-control/row-charts).
type RowChartsResp = {
  ok: boolean;
  reach: { date: string; value: number }[];
  posts: { date: string; video: number; image: number }[];
  typeMix: { video: number; image: number };
  capped: boolean;
  status: "ok" | "reconnect";
};

/**
 * The inline panel under an expanded row: three charts (reach trend, posts/day
 * video·image, type mix) for the SELECTED range. Fetched LAZILY only when the row is
 * expanded, from the existing per-page caches, and memoised per (page, range) in the
 * list's `cache` ref so collapse/re-expand (or returning to a range) never refetches.
 */
function ExpandedRowCharts({
  pageId,
  from,
  to,
  rk,
  cache,
}: {
  pageId: string;
  from: string;
  to: string;
  rk: string;
  cache: React.MutableRefObject<Map<string, RowChartsResp>>;
}) {
  const [state, setState] = useState<RowChartsResp | "loading" | "error">(() => cache.current.get(`${pageId}|${rk}`) ?? "loading");

  useEffect(() => {
    const key = `${pageId}|${rk}`;
    const hit = cache.current.get(key);
    if (hit) {
      setState(hit);
      return;
    }
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const res = await fetch(`/api/admin/page-control/row-charts?id=${encodeURIComponent(pageId)}&from=${from}&to=${to}`);
        const json = (await res.json()) as RowChartsResp;
        if (cancelled) return;
        if (json.ok) {
          cache.current.set(key, json);
          setState(json);
        } else {
          setState("error");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId, rk, from, to, cache]);

  return (
    <div className="adm-pc-expand">
      <div className="adm-pc-expand-head">
        <span className="adm-fb-sub">Charts · {formatRange(from, to)}</span>
        <Link href={`/admin/page-control/${pageId}`} className="adm-pc-openlink">Open page →</Link>
      </div>

      {state === "loading" ? (
        <div className="adm-pc-expand-body">
          {[0, 1, 2].map((i) => (
            <div key={i} className="adm-pc-expand-skel adm-pc-skel" />
          ))}
        </div>
      ) : state === "error" ? (
        <p className="adm-card-sub" style={{ margin: "8px 2px" }}>Couldn’t load charts — collapse and try again.</p>
      ) : state.status === "reconnect" ? (
        <p className="adm-card-sub" style={{ margin: "8px 2px" }}>Reconnect this Page to see its charts.</p>
      ) : (
        <div className="adm-pc-expand-body">
          <section className="adm-pc-expand-sec">
            <div className="adm-pc-expand-h">Reach trend</div>
            <AnimatedAreaChart current={state.reach} color="var(--section-accent)" formatValue={(v) => compact(Math.round(v))} />
          </section>
          <section className="adm-pc-expand-sec">
            <div className="adm-pc-expand-h">Posts per day</div>
            <AnimatedStackedBars data={state.posts} />
            <div className="adm-pc-barlegend">
              <span><i className="adm-pc-sw v" />🎥 Video</span>
              <span><i className="adm-pc-sw i" />🖼 Image</span>
              {state.capped && <span className="adm-fb-sub">· first 100 posts</span>}
            </div>
          </section>
          <section className="adm-pc-expand-sec">
            <div className="adm-pc-expand-h">Type mix</div>
            <TypeMixBar video={state.typeMix.video} image={state.typeMix.image} />
          </section>
        </div>
      )}
    </div>
  );
}
