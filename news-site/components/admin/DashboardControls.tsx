"use client";

import React, { useEffect, useRef, useState } from "react";
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
 * Dashboard header controls: Refresh + the date-range filter (1–30 days).
 * The slider drives `days` in the parent via onChange on every input, so the
 * charts scale instantly and continuously as you drag (no server round-trip).
 * Refresh re-fetches the baseline via router.refresh().
 */
export function DashboardControls({
  days,
  onChange,
}: {
  days: number;
  onChange: (days: number) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const chipRef = useRef<HTMLButtonElement>(null);
  const [popStyle, setPopStyle] = useState<React.CSSProperties>({});

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

  function handleOpen() {
    if (chipRef.current) {
      const r = chipRef.current.getBoundingClientRect();
      setPopStyle({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    setOpen((o) => !o);
  }

  function refresh() {
    setSpinning(true);
    window.setTimeout(() => setSpinning(false), 900);
    router.refresh();
  }

  const pct = Math.round(((days - 1) / 29) * 100);

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
          ref={chipRef}
          type="button"
          className="adm-chip"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={handleOpen}
        >
          <CalendarIcon className="h-4 w-4" />
          <span>{rangeLabel(days)}</span>
          <ChevronDownIcon className="h-3 w-3" />
        </button>

        <div className={`adm-rangepop ${open ? "open" : ""}`} style={popStyle} role="dialog" aria-label="Filter by date range">
          <div className="adm-rp-title">Filter by date range</div>
          <div className="adm-rp-presets">
            {PRESETS.map((p) => (
              <button
                key={p.days}
                type="button"
                className={days === p.days ? "on" : ""}
                onClick={() => onChange(p.days)}
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
            value={days}
            className="adm-rp-slider"
            style={{ ["--pct" as string]: `${pct}%` }}
            aria-label="Days"
            aria-valuetext={`${days} day${days === 1 ? "" : "s"}`}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <div className="adm-rp-val">
            Showing <b>{days}</b> day{days === 1 ? "" : "s"}
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
