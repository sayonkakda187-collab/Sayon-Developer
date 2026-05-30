"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarIcon, ChevronDownIcon, PlusIcon, RefreshIcon } from "./icons";
import Link from "next/link";

const PRESETS = [
  { days: 1, label: "Today" },
  { days: 7, label: "7 days" },
  { days: 14, label: "14 days" },
  { days: 30, label: "30 days" },
];

function rangeLabel(days: number) {
  return days === 1 ? "Today" : `Last ${days} days`;
}

/**
 * Dashboard header controls: Refresh + a working date-range filter (1–30 days).
 * The range is the source of truth in the URL (`?days=N`); changing it re-queries
 * the server (real publish-date window). Refresh spins + re-fetches via
 * router.refresh(). Honors prefers-reduced-motion (CSS skips the spin).
 */
export function DashboardControls({ days }: { days: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(days);
  const [spinning, setSpinning] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(days), [days]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function applyDays(next: number) {
    setDraft(next);
    const params = new URLSearchParams(window.location.search);
    if (next === 30) params.delete("days");
    else params.set("days", String(next));
    const qs = params.toString();
    startTransition(() => router.replace(`/admin${qs ? `?${qs}` : ""}`, { scroll: false }));
  }

  function refresh() {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 900);
    startTransition(() => router.refresh());
  }

  const pct = Math.round(((draft - 1) / 29) * 100);

  return (
    <div className="adm-head-actions">
      <button
        type="button"
        className="adm-iconchip"
        title="Refresh data"
        aria-label="Refresh"
        onClick={refresh}
        disabled={pending}
      >
        <RefreshIcon className={`h-[18px] w-[18px] ${spinning ? "adm-spinning" : ""}`} />
      </button>

      <div className="adm-daterange" ref={wrapRef}>
        <button
          type="button"
          className="adm-chip"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>{rangeLabel(draft)}</span>
          <ChevronDownIcon className="h-3 w-3" />
        </button>

        <div className={`adm-rangepop ${open ? "open" : ""}`} role="dialog" aria-label="Filter by date range">
          <div className="adm-rp-title">Filter by date range</div>
          <div className="adm-rp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={draft === p.days ? "on" : ""}
                onClick={() => applyDays(p.days)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={30}
            value={draft}
            className="adm-rp-slider"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-label="Days"
            onChange={(e) => setDraft(Number(e.target.value))}
            onMouseUp={(e) => applyDays(Number((e.target as HTMLInputElement).value))}
            onTouchEnd={(e) => applyDays(Number((e.target as HTMLInputElement).value))}
            onKeyUp={(e) => applyDays(Number((e.target as HTMLInputElement).value))}
          />
          <div className="adm-rp-val">
            Showing <b>{draft}</b> day{draft === 1 ? "" : "s"}
          </div>
        </div>
      </div>

      <Link href="/admin/articles/new" className="adm-btn-primary">
        <PlusIcon className="h-4 w-4" />
        New Article
      </Link>
    </div>
  );
}
