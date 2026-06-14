"use client";

import { useEffect, useState } from "react";
import { type InsightsPageRow, type Range } from "@/components/admin/FacebookPageInsights";
import { MonitoredDashboard } from "@/components/admin/MonitoredDashboard";
import { PagePostCard } from "@/components/admin/PageControlContent";
import { TotalPostsGauge } from "@/components/admin/TotalPostsGauge";
import type { PagePost } from "@/lib/facebook";

/**
 * Page Control → Summary (a Page's "home"): the animated KPI cards + trend chart
 * for the selected range (`MonitoredDashboard`) and the 3 most recent real posts
 * (from Content). The identity header (avatar · name · followers · link to the
 * Page) lives in the dashboard shell above. Both data sources are server-cached.
 * `apiBase` lets the read-only Manager Portal point this at the portal endpoints.
 */
export function PageControlSummary({
  page,
  range,
  onSeeAllPosts,
  apiBase = "/api/admin/page-control",
}: {
  page: InsightsPageRow;
  range: Range;
  onSeeAllPosts: () => void;
  apiBase?: string;
}) {
  const POSTS_API = `${apiBase}/posts`;
  const [recent, setRecent] = useState<PagePost[] | null>(null);

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
    return () => {
      cancelled = true;
    };
  }, [page.id, POSTS_API]);

  return (
    <div>
      {/* All-time post count gauge */}
      <TotalPostsGauge pageDbId={page.id} apiBase={apiBase} />

      {/* Animated KPI cards + mini trend chart */}
      <MonitoredDashboard pageDbId={page.id} range={range} detailApi={`${apiBase}/insights`} />

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
