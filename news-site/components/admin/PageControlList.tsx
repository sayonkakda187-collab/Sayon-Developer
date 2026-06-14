"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { PlusIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatNumber } from "@/lib/site";
import { usePageControlSearch } from "@/components/admin/pageControlSearchStore";
import { usePageControlManagerFilter } from "@/components/admin/pageControlManagerFilterStore";
import { usePageControlConnectSignal } from "@/components/admin/pageControlConnectStore";
// Loaded on demand (admin only). Keeping it out of the static graph means the admin
// Connect flow + its server actions are NOT bundled into the read-only Manager Portal.
const PageControlConnectModal = dynamic(
  () => import("@/components/admin/PageControlConnectModal").then((m) => m.PageControlConnectModal),
  { ssr: false },
);
import { AnimatedSparkline, AnimatedAreaChart, AnimatedStackedBars, TypeMixBar, CountUp } from "@/components/admin/PageControlCharts";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { RangeControl, type InsightsPageRow, type Range } from "@/components/admin/FacebookPageInsights";
import { presetRange, rangeKey, formatRange, ppToday, eachDate } from "@/lib/fbInsightsRange";

const PER_PAGE = 24;
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
  earnings: number | null; // manager-entered earnings summed over the range (null → none)
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

/** Manager-entered earnings summed over the selected range ("$8.50"); "—" when none. */
function EarningsPill({ amount }: { amount: number | null }) {
  return (
    <span className="adm-pc-stat adm-pc-stat-earn">
      <span className="adm-pc-stat-k">Earnings</span>
      <span className="adm-pc-stat-v">{amount == null ? "—" : `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</span>
    </span>
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
        <EarningsPill amount={entry.earnings} />
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
  tokenExpiresAt,
  managers,
  assignments,
  apiBase = "/api/admin/page-control",
  readOnly = false,
  onOpenPage,
}: {
  pages: MonitoredRow[];
  appConfigured: boolean;
  // The Page Control user-token expiry (ISO) for the Connect dialog's status line.
  tokenExpiresAt?: string | null;
  managers: Manager[];
  assignments: Record<string, string | null>;
  apiBase?: string;
  // Manager Portal: a shared read-only view. Hides the admin-only "Connect Page"
  // affordances (the empty-state CTA + the connect modal) — the stats/charts are
  // already read-only.
  readOnly?: boolean;
  // Manager Portal: when set, clicking a row opens that page's full detail (handled by
  // the portal client) instead of expanding the inline charts accordion.
  onOpenPage?: (pageId: string) => void;
}) {
  const STATS_API = useMemo(() => `${apiBase}/stats`, [apiBase]);
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

  // Manager filter + "Connect Page" live in the admin HEADER (Page Control route only).
  // Read the SELECTED manager (header autocomplete) from the shared filter store, and
  // open the connect modal when the header's "Connect Page" button bumps its signal.
  const selectedManager = usePageControlManagerFilter();
  const connectSignal = usePageControlConnectSignal();
  const connectSeen = useRef(connectSignal);

  // Expandable rows: one open at a time (accordion) + a client cache of fetched chart
  // data per (page, range) so collapse/re-expand within a session never refetches.
  const [expanded, setExpanded] = useState<string | null>(null);
  const chartCacheRef = useRef<Map<string, RowChartsResp>>(new Map());

  useEffect(() => {
    if (connectSignal !== connectSeen.current) {
      connectSeen.current = connectSignal;
      if (!readOnly) setShowConnect(true);
    }
  }, [connectSignal, readOnly]);

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

  // 2) Manager filter — the header autocomplete selects ONE manager → only that
  // manager's pages (null → all). Page-name + manager filters compose.
  const managerFiltered = useMemo(
    () => (selectedManager ? filtered.filter((p) => assignments[p.id] === selectedManager.id) : filtered),
    [filtered, selectedManager, assignments],
  );

  const { page, setPage, pageCount, pageItems } = usePaged(managerFiltered, PER_PAGE);
  const visibleRows = pageItems;

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
  }, [STATS_API]);

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
    const activate = () => (onOpenPage ? onOpenPage(p.id) : setExpanded(isOpen ? null : p.id));
    return (
      <div key={p.id} className={`adm-pc-rowwrap ${isOpen ? "on" : ""}`}>
        <div
          className="adm-card adm-pc-row"
          role="button"
          tabIndex={0}
          aria-expanded={onOpenPage ? undefined : isOpen}
          aria-label={onOpenPage ? `${p.pageName} — open page detail` : `${p.pageName} — ${isOpen ? "collapse" : "expand"} charts`}
          onClick={activate}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              activate();
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
          <span className={`adm-pc-caret ${isOpen ? "on" : ""}`} aria-hidden>{onOpenPage ? "›" : "⌄"}</span>
        </div>
        {!onOpenPage && isOpen && <ExpandedRowCharts pageId={p.id} from={range.from} to={range.to} rk={rk} cache={chartCacheRef} apiBase={apiBase} />}
      </div>
    );
  }

  return (
    <div>
      {pages.length === 0 ? (
        readOnly ? (
          <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "32px 18px" }}>
            <div className="adm-card-title" style={{ fontSize: 18 }}>No Pages yet</div>
            <p className="adm-card-sub" style={{ maxWidth: 460, margin: "8px auto 0" }}>
              There are no monitored Pages to show right now. Check back once your team adds Pages.
            </p>
          </div>
        ) : (
          <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "32px 18px" }}>
            <div className="adm-card-title" style={{ fontSize: 18 }}>Monitor your first Page</div>
            <p className="adm-card-sub" style={{ maxWidth: 460, margin: "8px auto 16px" }}>
              Page Control is a <strong>watch-only</strong> dashboard with its own connection — separate from the Facebook
              posting tab. Connect Pages here (even from a different Facebook account) to see each one’s Summary, real
              published Content, and Analytics.
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>{connectBtn}</div>
          </div>
        )
      ) : (
        <>
          {/* Date-range chips sit at the TOP of the list box; "Search by manager" and
              "Connect Page" now live in the admin header (Page Control route only). */}
          <div className="adm-pc-listrange">
            <RangeControl range={range} onChange={setRange} />
          </div>

          {selectedManager && (
            <div className="adm-pc-group-head adm-pc-selhead">
              <ManagerAvatar name={selectedManager.name} photo={selectedManager.photo} size={22} />
              <span className="adm-pc-group-name">{selectedManager.name}</span>
              <span className="adm-pc-group-count">· {managerFiltered.length} {managerFiltered.length === 1 ? "page" : "pages"}</span>
            </div>
          )}

          <div className="adm-pc-list">{pageItems.map(renderRow)}</div>

          {managerFiltered.length === 0 && (
            <p className="adm-card-sub" style={{ marginTop: 12 }}>
              {selectedManager
                ? `No monitored pages are managed by ${selectedManager.name}${query.trim() ? ` matching “${query.trim()}”` : ""}.`
                : `No Pages match “${query}”.`}
            </p>
          )}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span className="adm-fb-sub">Stats: {formatRange(range.from, range.to)}{range.to === ppToday() ? " · today partial" : ""}</span>
            <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        </>
      )}

      {!readOnly && showConnect && (
        <PageControlConnectModal
          appConfigured={appConfigured}
          tokenExpiresAt={tokenExpiresAt}
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
  earningsDaily: { date: string; amount: number }[];
  capped: boolean;
  status: "ok" | "reconnect";
};

/** Expand sparse daily earnings into a full per-day series (0 for days with no entry). */
function fillDaily(from: string, to: string, entries: { date: string; amount: number }[]): { date: string; value: number }[] {
  const m = new Map(entries.map((e) => [e.date, e.amount]));
  return eachDate(from, to).map((d) => ({ date: d, value: m.get(d) ?? 0 }));
}

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
  apiBase,
}: {
  pageId: string;
  from: string;
  to: string;
  rk: string;
  cache: React.MutableRefObject<Map<string, RowChartsResp>>;
  apiBase: string;
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
        const res = await fetch(`${apiBase}/row-charts?id=${encodeURIComponent(pageId)}&from=${from}&to=${to}`);
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
  }, [pageId, rk, from, to, cache, apiBase]);

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
          <section className="adm-pc-expand-sec">
            <div className="adm-pc-expand-h">Daily earnings</div>
            {(state.earningsDaily?.length ?? 0) > 0 ? (
              <AnimatedAreaChart current={fillDaily(from, to, state.earningsDaily)} color="var(--section-accent)" formatValue={(v) => `$${v.toFixed(2)}`} />
            ) : (
              <p className="adm-card-sub" style={{ margin: "6px 2px" }}>No earnings entered for this range yet.</p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
