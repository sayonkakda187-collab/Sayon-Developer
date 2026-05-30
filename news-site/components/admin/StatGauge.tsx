"use client";

import { useEffect, useRef, useState } from "react";

const R = 49;
const L = Math.PI * R; // arc length of the top semicircle

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Semicircular gauge stat card: a light track arc + a gradient-stroked fill arc
 * (rounded caps) that sweeps up on mount, with the value counting up inside.
 * `frac` (0..1) sets how far the arc fills.
 */
export function StatGauge({
  value,
  label,
  sub,
  frac,
  c1,
  c2,
  gradId,
}: {
  value: number;
  label: string;
  sub: string;
  frac: number;
  c1: string;
  c2: string;
  gradId: string;
}) {
  const [offset, setOffset] = useState(L); // start fully hidden
  const [display, setDisplay] = useState(0);
  const raf = useRef<number>();

  // Font size scales down for longer numbers (matches the design spec).
  const digits = String(value).replace(/[^0-9]/g, "").length;
  const fontSize = digits <= 2 ? 25 : digits <= 4 ? 21 : 17;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setOffset(L * (1 - frac));
      setDisplay(value);
      return;
    }

    const sweep = setTimeout(() => setOffset(L * (1 - frac)), 280);

    const dur = 1100;
    let t0: number | null = null;
    const startCount = setTimeout(() => {
      const step = (t: number) => {
        if (t0 === null) t0 = t;
        const p = Math.min((t - t0) / dur, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        setDisplay(Math.round(value * eased));
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      raf.current = requestAnimationFrame(step);
    }, 320);

    return () => {
      clearTimeout(sweep);
      clearTimeout(startCount);
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, frac]);

  return (
    <div className="adm-stat">
      <div className="adm-gauge">
        <svg viewBox="0 0 120 64">
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor={c1} />
              <stop offset="1" stopColor={c2} />
            </linearGradient>
          </defs>
          <path
            d="M 11 56 A 49 49 0 0 1 109 56"
            fill="none"
            stroke="rgba(120,130,150,.16)"
            strokeWidth="8"
            strokeLinecap="round"
          />
          <path
            className="adm-gfill"
            d="M 11 56 A 49 49 0 0 1 109 56"
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${L} ${L}`}
            strokeDashoffset={offset}
          />
        </svg>
        <div
          className="adm-gnum"
          style={{ fontSize }}
          aria-label={`${label}: ${value.toLocaleString("en-US")}`}
        >
          {display.toLocaleString("en-US")}
        </div>
      </div>
      <div className="adm-glabel">{label}</div>
      <div className="adm-gsub">{sub}</div>
    </div>
  );
}
