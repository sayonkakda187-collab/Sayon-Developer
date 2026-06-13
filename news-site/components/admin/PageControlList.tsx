"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { SearchIcon, PlusIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatNumber } from "@/lib/site";
import { PageControlConnectModal } from "@/components/admin/PageControlConnectModal";
import { AnimatedSparkline } from "@/components/admin/PageControlCharts";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

const PER_PAGE = 24;
const STATS_API = "/api/admin/page-control/stats";
const BATCH = 8;

/** A monitored page row for the landing list (InsightsPageRow + its follower count). */
export type MonitoredRow = InsightsPageRow & { followers: number | null };

// Client-safe shape of one row's 28-day quick stats (matches the stats API).
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

/** The 28-day quick-stat pills under a row: shimmer while loading, "—" when a page
 *  has no insights / token can't read them, else Reach · Engaged · Follows + Δ%. */
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
        <span className="adm-pc-stat"><span className="adm-pc-stat-k">28-day reach</span><span className="adm-pc-stat-v">—</span></span>
      </div>
    );
  }
  // Sparkline: default Reach; fall back to Engagement when reach has no data.
  const spark = entry.reach != null && entry.sparkReach.length > 1 ? entry.sparkReach : entry.sparkEngagement;
  return (
    <div className="adm-pc-statsrow">
      <div className="adm-pc-stats" title="Last 28 days vs the previous 28 days">
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
 * 28-day quick stats (Reach · Engaged · Follows + Δ% vs the previous 28d), fetched
 * lazily in small batches with a per-row shimmer and cached ~6h server-side — never
 * a bulk hammer. Empty state nudges the first connection.
 */
export function PageControlList({ pages, appConfigured }: { pages: MonitoredRow[]; appConfigured: boolean }) {
  const { success, error } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showConnect, setShowConnect] = useState(false);
  const [statsMap, setStatsMap] = useState<Record<string, StatEntry>>({});
  const requestedRef = useRef<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.pageName.toLowerCase().includes(q));
  }, [pages, query]);

  const { page, setPage, pageCount, pageItems, total } = usePaged(filtered, PER_PAGE);

  const fetchBatch = useCallback(async (ids: string[]) => {
    setStatsMap((prev) => {
      const next = { ...prev };
      ids.forEach((id) => (next[id] = "loading"));
      return next;
    });
    try {
      const res = await fetch(STATS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      setStatsMap((prev) => {
        const next = { ...prev };
        if (json.ok && Array.isArray(json.rows)) {
          const byId = new Map<string, RowStatsData>((json.rows as RowStatsData[]).map((r) => [r.id, r]));
          ids.forEach((id) => (next[id] = byId.get(id) ?? "error"));
        } else {
          ids.forEach((id) => (next[id] = "error"));
        }
        return next;
      });
    } catch {
      setStatsMap((prev) => {
        const next = { ...prev };
        ids.forEach((id) => (next[id] = "error"));
        return next;
      });
    }
  }, []);

  // Fetch quick stats for the visible rows only (lazy), in small sequential
  // batches so we never burst Graph for the whole list. `idsKey` re-runs this only
  // when the visible set changes (pagination / search), not on every render.
  const idsKey = pageItems.map((p) => p.id).join(",");
  useEffect(() => {
    const visible = idsKey ? idsKey.split(",") : [];
    const todo = visible.filter((id) => !requestedRef.current.has(id));
    if (todo.length === 0) return;
    todo.forEach((id) => requestedRef.current.add(id));
    let cancelled = false;
    (async () => {
      for (let i = 0; i < todo.length && !cancelled; i += BATCH) {
        await fetchBatch(todo.slice(i, i + BATCH));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [idsKey, fetchBatch]);

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
            <div className="adm-search" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <SearchIcon className="h-4 w-4" />
              <input
                className="adm-input"
                type="search"
                placeholder="Search monitored Pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search monitored Pages"
              />
            </div>
            {connectBtn}
          </div>

          <div className="adm-pc-list">
            {pageItems.map((p) => (
              <Link key={p.id} href={`/admin/page-control/${p.id}`} className="adm-card adm-pc-row">
                <FacebookPageAvatar dbId={p.id} name={p.pageName} avatarUrl={p.avatarUrl} size={44} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="adm-pc-row-name">{p.pageName}</div>
                  <div className="adm-card-sub" style={{ marginTop: 1 }}>
                    Watch-only{p.followers != null ? ` · ${formatNumber(p.followers)} followers` : ""}
                  </div>
                  <RowStats entry={statsMap[p.id]} />
                </div>
                {p.status !== "Connected" && <span className="adm-pill amber" style={{ flex: "none" }}>Reconnect</span>}
                <span className="adm-pc-chev" aria-hidden>›</span>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && <p className="adm-card-sub" style={{ marginTop: 12 }}>No Pages match “{query}”.</p>}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span className="adm-fb-sub">{total} monitored {total === 1 ? "Page" : "Pages"} · stats = last 28 days</span>
            <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
          </div>
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
