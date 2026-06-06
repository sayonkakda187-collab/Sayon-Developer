"use client";

import { useState } from "react";
import { COUNTRY_CENTROIDS, project } from "@/lib/countryCentroids";
import { countryColor, countryName } from "@/lib/countries";
import { CountryFlag } from "./CountryFlag";

type Stat = { countryCode: string; count: number };

/**
 * Dependency-free world bubble map (equirectangular SVG). A faint base layer of
 * all country centroids traces the inhabited world; countries with visitors get
 * a bubble sized by volume (area ∝ count) with a flag/name/count tooltip. Theme-
 * aware via the admin accent + neutral tokens. Countries we lack a centroid for
 * still appear in the ranked list beside the map.
 */
export function WorldBubbleMap({ stats, total }: { stats: Stat[]; total: number }) {
  const [hover, setHover] = useState<{ code: string; count: number; x: number; y: number } | null>(null);

  const W = 360;
  const H = 180;
  const max = Math.max(1, ...stats.map((s) => s.count));
  const radius = (c: number) => Math.max(2.2, Math.min(15, 2.2 + Math.sqrt(c / max) * 13));

  const points = stats
    .map((s, i) => {
      const cc = COUNTRY_CENTROIDS[s.countryCode];
      if (!cc) return null;
      const { x, y } = project(cc[0], cc[1]);
      return { code: s.countryCode, count: s.count, x, y, r: radius(s.count), color: countryColor(s.countryCode, i) };
    })
    .filter((p): p is { code: string; count: number; x: number; y: number; r: number; color: string } => p !== null)
    .sort((a, b) => b.r - a.r); // big first so small bubbles stay clickable on top

  // One radial gradient per distinct colour in view (referenced by the bubbles).
  const gradColors = Array.from(new Set(points.map((p) => p.color)));
  const gradId = (color: string) => `aud-b-${color.replace("#", "")}`;

  const pct = (c: number) => (total ? Math.round((c / total) * 100) : 0);

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Visitors by country — world map"
        style={{ width: "100%", height: "auto", display: "block" }}
        onClick={(e) => { if (e.target === e.currentTarget) setHover(null); }}
      >
        <defs>
          {gradColors.map((color) => (
            <radialGradient key={color} id={gradId(color)} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={color} stopOpacity="0.95" />
              <stop offset="100%" stopColor={color} stopOpacity="0.5" />
            </radialGradient>
          ))}
        </defs>

        <rect x="0" y="0" width={W} height={H} rx="4" fill="rgba(120,130,150,.06)" onClick={() => setHover(null)} />

        {/* graticule */}
        <g stroke="rgba(120,130,150,.12)" strokeWidth="0.3">
          {[-120, -60, 0, 60, 120].map((lon) => <line key={`v${lon}`} x1={lon + 180} y1="0" x2={lon + 180} y2={H} />)}
          {[-60, -30, 0, 30, 60].map((lat) => <line key={`h${lat}`} x1="0" y1={90 - lat} x2={W} y2={90 - lat} />)}
        </g>

        {/* base layer — every country as a faint dot (traces the continents) */}
        <g fill="rgba(120,130,150,.30)">
          {Object.entries(COUNTRY_CENTROIDS).map(([code, [lat, lon]]) => {
            const { x, y } = project(lat, lon);
            return <circle key={code} cx={x} cy={y} r="0.7" />;
          })}
        </g>

        {/* data bubbles */}
        <g>
          {points.map((p) => (
            <circle
              key={p.code}
              cx={p.x}
              cy={p.y}
              r={p.r}
              fill={`url(#${gradId(p.color)})`}
              stroke={p.color}
              strokeWidth="0.4"
              strokeOpacity="0.6"
              style={{ cursor: "pointer" }}
              onMouseEnter={() => setHover({ code: p.code, count: p.count, x: p.x, y: p.y })}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover({ code: p.code, count: p.count, x: p.x, y: p.y })}
            >
              <title>{`${countryName(p.code)} — ${p.count.toLocaleString("en-US")} (${pct(p.count)}%)`}</title>
            </circle>
          ))}
        </g>
      </svg>

      {hover && (
        <div
          style={{
            position: "absolute",
            left: `${(hover.x / W) * 100}%`,
            top: `${(hover.y / H) * 100}%`,
            transform: "translate(-50%, calc(-100% - 9px))",
            background: "rgba(17,24,39,.94)",
            color: "#fff",
            padding: "5px 9px",
            borderRadius: 8,
            fontSize: 12,
            whiteSpace: "nowrap",
            pointerEvents: "none",
            boxShadow: "0 6px 18px rgba(0,0,0,.28)",
            zIndex: 5,
          }}
        >
          <CountryFlag code={hover.code} width={18} />{" "}
          <b>{countryName(hover.code)}</b>
          <span style={{ opacity: 0.85 }}> · {hover.count.toLocaleString("en-US")} · {pct(hover.count)}%</span>
        </div>
      )}
    </div>
  );
}
