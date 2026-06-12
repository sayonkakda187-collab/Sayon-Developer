"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ToastProvider } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { ExternalLinkIcon } from "@/components/admin/icons";
import { formatNumber } from "@/lib/site";
import { presetRange } from "@/lib/fbInsightsRange";
import { PageDetail, RangeControl, type InsightsPageRow, type Range } from "@/components/admin/FacebookPageInsights";
import { PageControlSummary } from "@/components/admin/PageControlSummary";
import { PageControlContent } from "@/components/admin/PageControlContent";

type Tab = "summary" | "content" | "analytics";
const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "content", label: "Content" },
  { key: "analytics", label: "Analytics" },
];
const ORDER: Tab[] = ["summary", "content", "analytics"];
const SS_RANGE = "pageControl.range";

function initialRange(): Range {
  const fallback: Range = { preset: "28d", ...presetRange("28d") };
  if (typeof window === "undefined") return fallback;
  try {
    const raw = sessionStorage.getItem(SS_RANGE);
    if (raw) {
      const r = JSON.parse(raw) as Partial<Range>;
      if (r.preset === "custom" && r.from && r.to) return { preset: "custom", from: r.from, to: r.to };
      if (r.preset && r.preset !== "custom") return { preset: r.preset, ...presetRange(r.preset) }; // recompute vs today
    }
  } catch {
    // fall through to default
  }
  return fallback;
}

/**
 * Page Control dashboard for one Page — a Facebook-app-style Page view with three
 * swipeable sub-tabs (Summary · Content · Analytics). A persistent identity header
 * + a shared range control (Summary & Analytics) sit above; only the active
 * sub-tab mounts, so a Page's live content/insights are fetched lazily on open.
 */
export function PageControlDashboard({ page, followers }: { page: InsightsPageRow; followers: number | null }) {
  const [tab, setTab] = useState<Tab>("summary");
  const [range, setRange] = useState<Range>(initialRange);
  const touch = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(SS_RANGE, JSON.stringify(range));
    } catch {
      // ignore (private mode / quota)
    }
  }, [range]);

  function go(dir: 1 | -1) {
    const i = ORDER.indexOf(tab);
    const next = ORDER[i + dir];
    if (next) setTab(next);
  }
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touch.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touch.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touch.current.x;
    const dy = t.clientY - touch.current.y;
    touch.current = null;
    // Horizontal swipe only (don't hijack vertical scroll).
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
  }

  const showRange = tab !== "content";

  return (
    <ToastProvider>
      <div className="adm-pc-top">
        <Link href="/admin/page-control" className="adm-link adm-pc-back">← Pages</Link>
        <div className="adm-pc-id">
          <FacebookPageAvatar dbId={page.id} name={page.pageName} avatarUrl={page.avatarUrl} size={40} />
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{page.pageName}</div>
            <div className="adm-card-sub" style={{ marginTop: 1 }}>
              {page.categoryGroup}
              {followers != null && <> · <strong>{formatNumber(followers)}</strong> followers</>}
            </div>
          </div>
        </div>
        <a
          href={`https://www.facebook.com/${encodeURIComponent(page.pageId)}`}
          target="_blank"
          rel="noreferrer"
          className="adm-btn-ghost adm-pc-open"
        >
          Open Page <ExternalLinkIcon className="h-4 w-4" />
        </a>
      </div>

      <div className="adm-pc-subtabs" role="tablist" aria-label="Page sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`adm-pc-subtab ${tab === t.key ? "on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {showRange && (
        <div className="adm-pc-range">
          <RangeControl range={range} onChange={setRange} />
        </div>
      )}

      <div className="adm-pc-panel" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {tab === "summary" && (
          <PageControlSummary page={page} range={range} onSeeAllPosts={() => setTab("content")} />
        )}
        {tab === "content" && <PageControlContent pageDbId={page.id} />}
        {tab === "analytics" && <PageDetail page={page} initialRange={range} range={range} embedded />}
      </div>
    </ToastProvider>
  );
}
