"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ToastProvider } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { ExternalLinkIcon } from "@/components/admin/icons";
import { formatNumber } from "@/lib/site";
import { presetRange, formatRange, eachDate } from "@/lib/fbInsightsRange";
import { RangeControl, type InsightsPageRow, type Range } from "@/components/admin/FacebookPageInsights";
import { AnimatedAreaChart } from "@/components/admin/PageControlCharts";
import { MonitoredDashboard } from "@/components/admin/MonitoredDashboard";
import { PageControlSummary } from "@/components/admin/PageControlSummary";
import { PageControlContent } from "@/components/admin/PageControlContent";

// Admin-only Reconnect/Remove actions — dynamically imported so they're NOT bundled into
// the read-only Manager Portal (which renders this dashboard with `hideActions`).
const HeaderActions = dynamic(() => import("@/components/admin/PageControlHeaderActions").then((m) => m.HeaderActions), { ssr: false });

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

type DailyEarning = { date: string; amount: number };

/** Full per-day earnings series (0 for days with no entry). */
function earnSeries(from: string, to: string, daily: DailyEarning[]): { date: string; value: number }[] {
  const m = new Map(daily.map((e) => [e.date, e.amount]));
  return eachDate(from, to).map((d) => ({ date: d, value: m.get(d) ?? 0 }));
}

/** Page-detail earnings: the page's manager-entered daily earnings over the shared
 *  range (same row-charts endpoint) — a total + a small area chart. */
function PageEarningsCard({ pageDbId, range, apiBase }: { pageDbId: string; range: Range; apiBase: string }) {
  const [state, setState] = useState<{ daily: DailyEarning[] } | "loading" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`${apiBase}/row-charts?id=${encodeURIComponent(pageDbId)}&from=${range.from}&to=${range.to}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setState(j.ok ? { daily: (j.earningsDaily ?? []) as DailyEarning[] } : "error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [pageDbId, range.from, range.to, apiBase]);

  return (
    <section className="adm-card adm-card-pad" style={{ marginTop: 14 }}>
      <div className="adm-card-title" style={{ fontSize: 14 }}>Daily earnings</div>
      <div className="adm-fb-sub" style={{ marginTop: 1 }}>Manager-entered · {formatRange(range.from, range.to)}</div>
      {state === "loading" ? (
        <div className="adm-pc-skel" style={{ height: 120, marginTop: 12, borderRadius: 12 }} />
      ) : state === "error" ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>Couldn’t load earnings — try again.</p>
      ) : state.daily.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>No earnings entered for this range yet. The page’s manager adds them via the Telegram bot.</p>
      ) : (
        <>
          <div style={{ fontWeight: 800, fontSize: 22, color: "var(--section-link)", marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
            ${state.daily.reduce((s, e) => s + e.amount, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            <span className="adm-fb-sub" style={{ fontSize: 12, fontWeight: 600, marginLeft: 8 }}>total</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <AnimatedAreaChart current={earnSeries(range.from, range.to, state.daily)} color="var(--section-accent)" formatValue={(v) => `$${v.toFixed(2)}`} />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Page Control dashboard for one Page — a Facebook-app-style Page view with three
 * swipeable sub-tabs (Summary · Content · Analytics). A persistent identity header
 * + a shared range control (Summary & Analytics) sit above; only the active
 * sub-tab mounts, so a Page's live content/insights are fetched lazily on open.
 */
export function PageControlDashboard({
  page,
  followers,
  apiBase = "/api/admin/page-control",
  hideActions = false,
  onBack,
}: {
  page: InsightsPageRow;
  followers: number | null;
  // Manager Portal: point the detail data at the portal endpoints, hide the admin
  // action buttons, and use a callback (not the admin route) for the back link.
  apiBase?: string;
  hideActions?: boolean;
  onBack?: () => void;
}) {
  const DETAIL_API = `${apiBase}/insights`;
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
        {onBack ? (
          <button type="button" onClick={onBack} className="adm-link adm-pc-back">← Pages</button>
        ) : (
          <Link href="/admin/page-control" className="adm-link adm-pc-back">← Monitored pages</Link>
        )}
        <div className="adm-pc-id">
          <FacebookPageAvatar dbId={page.id} name={page.pageName} avatarUrl={page.avatarUrl} size={40} />
          <div style={{ minWidth: 0 }}>
            <div className="adm-card-title" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {page.pageName}
              {page.status !== "Connected" && <span className="adm-pill amber" style={{ marginLeft: 8, verticalAlign: "middle" }}>Needs reconnect</span>}
            </div>
            <div className="adm-card-sub" style={{ marginTop: 1 }}>
              Watch-only
              {followers != null && <> · <strong>{formatNumber(followers)}</strong> followers</>}
            </div>
          </div>
        </div>
        {!hideActions && (
          <div className="adm-pc-actions">
            <HeaderActions id={page.id} status={page.status} />
            <a
              href={`https://www.facebook.com/${encodeURIComponent(page.pageId)}`}
              target="_blank"
              rel="noreferrer"
              className="adm-btn-ghost adm-pc-open"
            >
              Open Page <ExternalLinkIcon className="h-4 w-4" />
            </a>
          </div>
        )}
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
          <>
            <PageControlSummary page={page} range={range} onSeeAllPosts={() => setTab("content")} apiBase={apiBase} />
            <PageEarningsCard pageDbId={page.id} range={range} apiBase={apiBase} />
          </>
        )}
        {tab === "content" && <PageControlContent pageDbId={page.id} apiBase={apiBase} />}
        {tab === "analytics" && <MonitoredDashboard pageDbId={page.id} range={range} detailApi={DETAIL_API} showDayTable />}
      </div>
    </ToastProvider>
  );
}
