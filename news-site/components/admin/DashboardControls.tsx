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
 * `draft` drives the UI immediately; the URL (`?days=N`, the server's source of
 * truth) is updated debounced so dragging the slider is smooth and doesn't fire
 * a request per pixel. The server value only re-syncs `draft` when the popover
 * is closed, so a round-trip can't fight the user's finger mid-drag.
 */
export function DashboardControls({ days }: { days: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(days);
  const [spinning, setSpinning] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Re-sync from the server only while the popover is closed (never mid-drag).
  useEffect(() => {
    if (!open) setDraft(days);
  }, [days, open]);

  // Close the popover on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Push ?days=N to the server. `immediate` for presets (snappy), debounced for
  // the slider drag (one request after the user settles).
  function commit(next: number, immediate = false) {
    clearTimeout(debounceRef.current);
    const push = () => {
      const params = new URLSearchParams(window.location.search);
      if (next === 30) params.delete("days");
      else params.set("days", String(next));
      const qs = params.toString();
      startTransition(() => router.replace(`/admin${qs ? `?${qs}` : ""}`, { scroll: false }));
    };
    if (immediate) push();
    else debounceRef.current = setTimeout(push, 150);
  }

  function onSlide(next: number) {
    setDraft(next); // instant UI
    commit(next); // debounced server update
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
      >
        <RefreshIcon className={`h-[18px] w-[18px] ${spinning ? "adm-spinning" : ""}`} />
      </button>

      <div className="adm-daterange" ref={wrapRef}>
        <button
          type="button"
          className={`adm-chip ${isPending ? "adm-loading" : ""}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-busy={isPending}
          onClick={() => setOpen((o) => !o)}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>{rangeLabel(draft)}</span>
          {isPending ? (
            <RefreshIcon className="h-3.5 w-3.5 adm-spinning" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          )}
        </button>

        <div className={`adm-rangepop ${open ? "open" : ""}`} role="dialog" aria-label="Filter by date range">
          <div className="adm-rp-title">Filter by date range</div>
          <div className="adm-rp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={draft === p.days ? "on" : ""}
                onClick={() => {
                  setDraft(p.days);
                  commit(p.days, true);
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={draft}
            className="adm-rp-slider"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-label="Days"
            aria-valuetext={`${draft} day${draft === 1 ? "" : "s"}`}
            onChange={(e) => onSlide(Number(e.target.value))}
          />
          <div className="adm-rp-val">
            Showing <b>{draft}</b> day{draft === 1 ? "" : "s"}
            {isPending && <span className="adm-rp-loading"> · updating…</span>}
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
