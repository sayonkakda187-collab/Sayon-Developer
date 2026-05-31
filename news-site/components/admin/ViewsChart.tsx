"use client";

import { useMemo, useState } from "react";
import { formatNumber } from "@/lib/site";

type Point = { date: string; views: number };

/**
 * Real views-over-time chart (last N days) — a hand-rolled SVG area/line, no
 * chart library. Renders an axis-light sparkline-style area with a hover
 * tooltip. Respects the admin tokens; degrades to a friendly note when empty.
 */
export function ViewsChart({ series, days }: { series: Point[]; days: number }) {
  const data = useMemo(() => series.slice(-days), [series, days]);
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = 180;
  const PAD = { top: 14, right: 8, bottom: 22, left: 8 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const total = data.reduce((s, p) => s + p.views, 0);
  const max = Math.max(1, ...data.map((p) => p.views));
  const n = data.length;

  const x = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;

  const linePath = data.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.views).toFixed(1)}`).join(" ");
  const areaPath = n > 0
    ? `${linePath} L${x(n - 1).toFixed(1)},${(PAD.top + innerH).toFixed(1)} L${x(0).toFixed(1)},${(PAD.top + innerH).toFixed(1)} Z`
    : "";

  function label(dateKey: string) {
    const d = new Date(`${dateKey}T00:00:00Z`);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  }

  const allZero = total === 0;

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-list-head">
        <div>
          <div className="adm-card-title">Views over time</div>
          <div className="adm-card-sub">Last {days} days · {formatNumber(total)} total</div>
        </div>
      </div>

      {allZero ? (
        <p className="adm-card-sub adm-vchart-empty">
          No views recorded yet in this window. As readers visit your articles, daily views will
          appear here.
        </p>
      ) : (
        <div className="adm-vchart" onMouseLeave={() => setHover(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={`Views over the last ${days} days`}>
            <defs>
              <linearGradient id="vchart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgb(var(--accent))" stopOpacity="0.22" />
                <stop offset="100%" stopColor="rgb(var(--accent))" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {areaPath && <path d={areaPath} fill="url(#vchart-fill)" />}
            {linePath && <path d={linePath} fill="none" stroke="rgb(var(--accent))" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
            {/* Hover hit areas + points */}
            {data.map((p, i) => (
              <g key={p.date}>
                <rect
                  x={x(i) - innerW / (2 * Math.max(1, n - 1))}
                  y={PAD.top}
                  width={Math.max(6, innerW / Math.max(1, n - 1))}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                {hover === i && (
                  <circle cx={x(i)} cy={y(p.views)} r={3.5} fill="rgb(var(--accent))" stroke="#fff" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                )}
              </g>
            ))}
          </svg>
          {hover !== null && data[hover] && (
            <div
              className="adm-vchart-tip"
              style={{ left: `${(x(hover) / W) * 100}%` }}
            >
              <b>{formatNumber(data[hover].views)}</b> views
              <span>{label(data[hover].date)}</span>
            </div>
          )}
          <div className="adm-vchart-axis">
            <span>{data[0] && label(data[0].date)}</span>
            <span>{data[n - 1] && label(data[n - 1].date)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
