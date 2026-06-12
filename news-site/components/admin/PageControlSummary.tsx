"use client";

import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { previousPeriod, ppToday, formatRange } from "@/lib/fbInsightsRange";
import {
  InsightsDashboard,
  buildDayRows,
  type InsightsPageRow,
  type Range,
  type DetailData,
} from "@/components/admin/FacebookPageInsights";
import { PagePostCard } from "@/components/admin/PageControlContent";
import type { PagePost } from "@/lib/facebook";

const DETAIL_API = "/api/admin/facebook/page-insights";
const POSTS_API = "/api/admin/facebook/page-posts";

/**
 * Page Control → Summary (a Page's "home"): the KPI cards + mini trend for the
 * selected range (reusing the Insights dashboard, no duplication) and the 3 most
 * recent real posts (from Content). The identity header (avatar · name · followers
 * · link to the Page) lives in the dashboard shell above, visible across sub-tabs.
 * Both data sources are server-cached.
 */
export function PageControlSummary({
  page,
  range,
  onSeeAllPosts,
}: {
  page: InsightsPageRow;
  range: Range;
  onSeeAllPosts: () => void;
}) {
  const { error } = useToast();
  const [data, setData] = useState<DetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<PagePost[] | null>(null);

  // KPI cards + trend — the same per-Page detail data the Insights tab uses.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`${DETAIL_API}?detail=${encodeURIComponent(page.id)}&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.ok) setData(json.detail as DetailData);
        else error(json.error || "Couldn’t load this Page’s summary.");
      })
      .catch(() => !cancelled && error("Couldn’t load this Page’s summary."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [page.id, range.from, range.to, error]);

  // 3 most recent real posts (cached server-side; shared with the Content tab).
  useEffect(() => {
    let cancelled = false;
    fetch(`${POSTS_API}?page=${encodeURIComponent(page.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        setRecent(json.ok && Array.isArray(json.posts) ? (json.posts as PagePost[]).slice(0, 3) : []);
      })
      .catch(() => !cancelled && setRecent([]));
    return () => { cancelled = true; };
  }, [page.id]);

  const curRows = useMemo(
    () => (data ? buildDayRows(range.from, range.to, new Map(data.days.map((d) => [d.date, d])), data.shares) : []),
    [data, range.from, range.to],
  );
  const prevRows = useMemo(() => {
    if (!data) return [];
    const p = previousPeriod(range.from, range.to);
    return buildDayRows(p.from, p.to, new Map(data.daysPrev.map((d) => [d.date, d])), {});
  }, [data, range.from, range.to]);
  const includesToday = range.to === ppToday();

  return (
    <div>
      {/* KPI cards + mini trend (reused Insights dashboard) */}
      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading {formatRange(range.from, range.to)} from Facebook…
        </p>
      ) : !data ? null : data.status === "reconnect" ? (
        <div className="adm-card adm-card-pad" style={{ marginTop: 12 }}>
          <span className="adm-pill amber">Needs reconnect</span>
          <p className="adm-card-sub" style={{ marginTop: 8 }}>This Page’s token can’t read insights right now. Recent posts below still work.</p>
        </div>
      ) : (
        <InsightsDashboard curRows={curRows} prevRows={prevRows} prevPostsTotal={data.prevPostsTotal} includesToday={includesToday} />
      )}

      {/* 3 most recent real posts */}
      <div className="adm-list-head" style={{ marginTop: 22, alignItems: "baseline" }}>
        <div className="adm-card-title" style={{ fontSize: 14 }}>Recent posts</div>
        <button type="button" className="adm-link" onClick={onSeeAllPosts}>See all →</button>
      </div>
      {recent === null ? (
        <p className="adm-card-sub" style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading posts…
        </p>
      ) : recent.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>No published posts found for this Page yet.</p>
      ) : (
        <div className="adm-pc-posts" style={{ marginTop: 10 }}>
          {recent.map((p) => (
            <PagePostCard key={p.id} post={p} />
          ))}
        </div>
      )}
    </div>
  );
}
