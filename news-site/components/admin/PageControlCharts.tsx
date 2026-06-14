"use client";

import { useEffect, useId, useRef, useState } from "react";
import { formatDay } from "@/lib/fbInsightsRange";

/**
 * Page-Control-only animated charts — dependency-free SVG, mirroring the Insights
 * approach (area + line, the shared --chart-* palette + emerald accent) but with
 * tasteful, PREMIUM motion: a left-to-right line draw-in on scroll-into-view, a
 * gradient fill that fades up after, count-up KPI numbers, and quick sparkline
 * draws. Everything animates ONCE per reveal (no looping) and re-runs on data
 * change. `prefers-reduced-motion` → final state instantly, no animation. Charts
 * are lazy: off-screen ones don't animate until visible (IntersectionObserver).
 */

export type SeriesPoint = { date: string; value: number };

/** True when the user prefers reduced motion (render final state, no animation). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Fires once when the element scrolls into view (lazy animation gate). */
export function useRevealOnce<T extends Element>(): [React.MutableRefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setInView(true);
            io.disconnect();
            break;
          }
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inView]);
  return [ref, inView];
}

/** A number that counts up to `value` (~550ms ease-out) once it scrolls into view. */
export function CountUp({ value, format, durationMs = 550 }: { value: number; format?: (n: number) => string; durationMs?: number }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLSpanElement>();
  const [display, setDisplay] = useState(value);
  const raf = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (reduced || !inView) {
      setDisplay(value);
      return;
    }
    let start = 0;
    const from = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (value - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [value, inView, reduced, durationMs]);

  const shown = Math.round(display);
  return <span ref={ref}>{format ? format(shown) : String(shown)}</span>;
}

/** Compact sparkline (line + soft gradient fill) — draws in once. `fluid` scales it
 *  to the container width (KPI cards); otherwise it's a fixed `width` (landing rows). */
export function AnimatedSparkline({ values, color, width = 92, height = 28, fluid }: { values: number[]; color: string; width?: number; height?: number; fluid?: boolean }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<SVGSVGElement>();
  const gid = useId();
  const svgW = fluid ? "100%" : width;
  const par = fluid ? "none" : undefined;

  if (values.length < 2) {
    return (
      <svg ref={ref} className="adm-pc-spark" width={svgW} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={par} aria-hidden>
        <line x1={3} y1={height - 4} x2={width - 3} y2={height - 4} stroke="var(--adm-bd)" strokeWidth={1.5} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  const pad = 3;
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const stepX = (width - pad * 2) / (values.length - 1);
  const coords = values.map((v, i) => [pad + i * stepX, height - pad - ((v - min) / range) * (height - pad * 2)] as const);
  const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1][0].toFixed(1)},${height - pad} L${coords[0][0].toFixed(1)},${height - pad} Z`;
  const draw = reduced || inView;

  return (
    <svg ref={ref} className="adm-pc-spark" width={svgW} height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio={par} aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} style={{ opacity: draw ? 1 : 0, transition: reduced ? "none" : "opacity 450ms ease 200ms" }} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pathLength={1}
        style={{ strokeDasharray: 1, strokeDashoffset: draw ? 0 : 1, transition: reduced ? "none" : "stroke-dashoffset 600ms ease-out" }}
      />
    </svg>
  );
}

/**
 * Large trend chart that scales to its container — current period (area + drawn-in
 * line) + optional previous-period overlay (dashed), with a tap/hover tooltip. The
 * line draws left-to-right on reveal and re-draws when the dataset changes; the
 * gradient fill fades up after. Reduced-motion → final state instantly.
 */
export function AnimatedAreaChart({
  current,
  previous,
  color,
  showPrev = false,
  formatValue,
}: {
  current: SeriesPoint[];
  previous?: SeriesPoint[];
  color: string;
  showPrev?: boolean;
  formatValue?: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);

  // Re-trigger the draw-in whenever the dataset (or compare toggle) changes.
  const sig = `${current.map((p) => p.value).join(",")}|${showPrev ? "p" : ""}`;
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    if (reduced) {
      setDrawn(true);
      return;
    }
    setDrawn(false);
    if (!inView) return;
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    return () => cancelAnimationFrame(id);
  }, [sig, inView, reduced]);

  if (current.length === 0) {
    return (
      <div ref={ref}>
        <p className="adm-fb-sub" style={{ marginTop: 12 }}>No data for this range yet.</p>
      </div>
    );
  }

  const W = 600;
  const H = 184;
  const padX = 6;
  const padTop = 12;
  const padBot = 8;
  const n = current.length;
  const prev = previous ?? [];
  const vals = [...current.map((p) => p.value), ...(showPrev ? prev.map((p) => p.value) : [])];
  const max = Math.max(1, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const stepX = n > 1 ? (W - padX * 2) / (n - 1) : 0;
  const xOf = (i: number) => padX + i * stepX;
  const yOf = (v: number) => padTop + (1 - (v - min) / span) * (H - padTop - padBot);
  const pathOf = (pts: SeriesPoint[]) => pts.slice(0, n).map((p, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ");
  const curPath = pathOf(current);
  const area = `${curPath} L${xOf(n - 1).toFixed(1)},${H - padBot} L${xOf(0).toFixed(1)},${H - padBot} Z`;
  const draw = reduced || (inView && drawn);

  function pick(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.round(rel * (n - 1)))));
  }

  const hp = hover != null ? current[hover] : null;
  const hoverLeftPct = hover != null ? (xOf(hover) / W) * 100 : 0;

  return (
    <div
      ref={ref}
      className="adm-pc-chart"
      onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => {
        e.stopPropagation(); // don't let a chart scrub trigger the sub-tab swipe
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.24} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <line x1={padX} y1={H - padBot} x2={W - padX} y2={H - padBot} stroke="var(--adm-bd)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <path d={area} fill={`url(#${gid})`} style={{ opacity: draw ? 1 : 0, transition: reduced ? "none" : "opacity 550ms ease 260ms" }} />
        {showPrev && prev.length > 0 && (
          <path d={pathOf(prev)} fill="none" stroke="var(--adm-muted, #94a3b8)" strokeWidth={1.5} strokeDasharray="5 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ opacity: draw ? 0.9 : 0, transition: reduced ? "none" : "opacity 400ms ease 300ms" }} />
        )}
        <path
          d={curPath}
          fill="none"
          stroke={color}
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
          pathLength={1}
          style={{ strokeDasharray: 1, strokeDashoffset: draw ? 0 : 1, transition: reduced ? "none" : "stroke-dashoffset 720ms ease-out" }}
        />
        {hover != null && (
          <>
            <line x1={xOf(hover)} y1={padTop} x2={xOf(hover)} y2={H - padBot} stroke={color} strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" opacity={0.5} />
            <circle cx={xOf(hover)} cy={yOf(current[hover].value)} r={3.5} fill={color} vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>

      {hp && (
        <div className="adm-pc-chart-tip" style={{ left: `${hoverLeftPct}%` }}>
          <span className="adm-pc-chart-tip-v">{formatValue ? formatValue(hp.value) : String(hp.value)}</span>
          <span className="adm-pc-chart-tip-d">{formatDay(hp.date)}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(current[0].date)}</span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(current[n - 1].date)}</span>
      </div>
    </div>
  );
}

const GAUGE_R = 49;
const GAUGE_L = Math.PI * GAUGE_R; // arc length of the top semicircle

/**
 * Semicircular "gauge card" matching the dashboard's StatGauge style (reuses its
 * `.adm-gauge/.adm-gfill/.adm-gnum` CSS) + the emerald accent. The arc sweeps 0→value
 * and the number counts up ONCE on scroll-into-view (the `.adm-gfill` CSS transition
 * + `CountUp`); `prefers-reduced-motion` → final state instantly. `max` is the arc's
 * full point (a "nice" ceiling of the value); `suffix` (e.g. "+") marks a
 * capped/approximate count.
 */
export function AnimatedGauge({ value, max, label, sub, suffix = "" }: { value: number; max: number; label: string; sub: string; suffix?: string }) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const gid = useId();
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const draw = reduced || inView;
  const offset = draw ? GAUGE_L * (1 - frac) : GAUGE_L;
  const len = Math.round(value).toLocaleString("en-US").replace(/,/g, "").length + (suffix ? 1 : 0);
  const fontSize = len <= 3 ? 24 : len <= 5 ? 20 : 16;

  return (
    <div className="adm-stat" ref={ref}>
      <div className="adm-gauge">
        <svg viewBox="0 0 120 64">
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="var(--section-accent)" />
              <stop offset="1" stopColor="var(--section-accent-bright)" />
            </linearGradient>
          </defs>
          <path d="M 11 56 A 49 49 0 0 1 109 56" fill="none" stroke="rgba(120,130,150,.16)" strokeWidth="8" strokeLinecap="round" />
          <path
            className="adm-gfill"
            d="M 11 56 A 49 49 0 0 1 109 56"
            fill="none"
            stroke={`url(#${gid})`}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${GAUGE_L} ${GAUGE_L}`}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="adm-gnum" style={{ fontSize }} aria-label={`${label}: ${value.toLocaleString("en-US")}${suffix}`}>
          <CountUp value={value} format={(n) => `${n.toLocaleString("en-US")}${suffix}`} />
        </div>
      </div>
      <div className="adm-stat-meta">
        <div className="adm-glabel">{label}</div>
        <div className="adm-gsub">{sub}</div>
      </div>
    </div>
  );
}

export type PostsBar = { date: string; video: number; image: number };

/**
 * Posts-per-day stacked bars (video on the bottom, image stacked above) that scale to
 * the container width — each day's bar grows up from the baseline once on reveal, with
 * a tap/hover tooltip showing the date + the video/image split. Zero-filled empty days
 * keep the range continuous. Reduced-motion → final state instantly.
 */
export function AnimatedStackedBars({
  data,
  videoColor = "#2563eb",
  imageColor = "#ea580c",
  height = 116,
}: {
  data: PostsBar[];
  videoColor?: string;
  imageColor?: string;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const n = data.length;
  const hasPosts = data.some((d) => d.video + d.image > 0);
  if (n === 0 || !hasPosts) {
    return (
      <div ref={ref}>
        <p className="adm-fb-sub" style={{ marginTop: 8 }}>No posts in this range yet.</p>
      </div>
    );
  }

  const W = 600;
  const H = height;
  const padTop = 8;
  const padBot = 4;
  const usableH = H - padTop - padBot;
  const max = Math.max(1, ...data.map((d) => d.video + d.image));
  const groupW = W / n;
  const barW = Math.max(2, Math.min(groupW * 0.72, 26));
  const scale = (v: number) => (v / max) * usableH;
  const draw = reduced || inView;

  function pick(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(rel * n))));
  }

  const hd = hover != null ? data[hover] : null;
  const hoverLeftPct = hover != null ? (((hover + 0.5) * groupW) / W) * 100 : 0;

  return (
    <div
      ref={ref}
      className="adm-pc-chart"
      onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => {
        e.stopPropagation();
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        <line x1={0} y1={H - padBot} x2={W} y2={H - padBot} stroke="var(--adm-bd)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const x = i * groupW + (groupW - barW) / 2;
          const vH = scale(d.video);
          const iH = scale(d.image);
          const vy = H - padBot - vH;
          const iy = vy - iH;
          const dim = hover != null && hover !== i;
          return (
            <g
              key={d.date}
              style={{
                transformBox: "fill-box",
                transformOrigin: "bottom",
                transform: draw ? "scaleY(1)" : "scaleY(0)",
                transition: reduced ? "none" : `transform 480ms ease-out ${Math.min(i * 10, 220)}ms`,
                opacity: dim ? 0.5 : 1,
              }}
            >
              {d.video > 0 && <rect x={x} y={vy} width={barW} height={vH} fill={videoColor} rx={1.5} />}
              {d.image > 0 && <rect x={x} y={iy} width={barW} height={iH} fill={imageColor} rx={1.5} />}
            </g>
          );
        })}
      </svg>

      {hd && (
        <div className="adm-pc-chart-tip" style={{ left: `${hoverLeftPct}%` }}>
          <span className="adm-pc-chart-tip-v">{hd.video + hd.image} post{hd.video + hd.image === 1 ? "" : "s"}</span>
          <span className="adm-pc-chart-tip-d">{formatDay(hd.date)} · 🎥 {hd.video} · 🖼 {hd.image}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(data[0].date)}</span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(data[n - 1].date)}</span>
      </div>
    </div>
  );
}

/**
 * Compact video-vs-image ratio as a single horizontal stacked bar with % labels +
 * a count legend. Each segment grows from 0 to its share once on reveal (reduced-
 * motion → instant). "No posts" when the range is empty.
 */
export function TypeMixBar({
  video,
  image,
  videoColor = "#2563eb",
  imageColor = "#ea580c",
}: {
  video: number;
  image: number;
  videoColor?: string;
  imageColor?: string;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const total = video + image;
  if (total === 0) {
    return (
      <div ref={ref}>
        <p className="adm-fb-sub" style={{ marginTop: 8 }}>No posts in this range yet.</p>
      </div>
    );
  }
  const pV = Math.round((video / total) * 100);
  const pI = 100 - pV;
  const grow = reduced || inView;

  return (
    <div ref={ref}>
      <div className="adm-pc-mixbar" role="img" aria-label={`Video ${pV}%, image ${pI}%`}>
        <span className="adm-pc-mixseg" style={{ width: grow ? `${pV}%` : "0%", background: videoColor, transition: reduced ? "none" : "width 600ms ease-out" }}>
          {pV >= 12 ? `${pV}%` : ""}
        </span>
        <span className="adm-pc-mixseg" style={{ width: grow ? `${pI}%` : "0%", background: imageColor, transition: reduced ? "none" : "width 600ms ease-out 80ms" }}>
          {pI >= 12 ? `${pI}%` : ""}
        </span>
      </div>
      <div className="adm-pc-mixlegend">
        <span><i style={{ background: videoColor }} />🎥 Video {video} · {pV}%</span>
        <span><i style={{ background: imageColor }} />🖼 Image {image} · {pI}%</span>
      </div>
    </div>
  );
}

/**
 * Single-series animated bar chart that scales to the container width — one bar per
 * point, growing up from the baseline once on reveal, with a tap/hover tooltip (date +
 * `formatValue`). Mirrors `AnimatedStackedBars`' look/motion but for one value series
 * (e.g. daily earnings). Zero-filled empty points keep the range continuous.
 * Reduced-motion → final state instantly.
 */
export function AnimatedBars({
  data,
  color = "#3b82f6",
  height = 116,
  formatValue,
}: {
  data: SeriesPoint[];
  color?: string;
  height?: number;
  formatValue?: (n: number) => string;
}) {
  const reduced = useReducedMotion();
  const [ref, inView] = useRevealOnce<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const n = data.length;
  const hasData = data.some((d) => d.value > 0);
  if (n === 0 || !hasData) {
    return (
      <div ref={ref}>
        <p className="adm-fb-sub" style={{ marginTop: 8 }}>No data in this range yet.</p>
      </div>
    );
  }

  const W = 600;
  const H = height;
  const padTop = 8;
  const padBot = 4;
  const usableH = H - padTop - padBot;
  const max = Math.max(1, ...data.map((d) => d.value));
  const groupW = W / n;
  const barW = Math.max(2, Math.min(groupW * 0.72, 26));
  const scale = (v: number) => (v / max) * usableH;
  const draw = reduced || inView;

  function pick(clientX: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return;
    const rel = (clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(n - 1, Math.floor(rel * n))));
  }

  const hd = hover != null ? data[hover] : null;
  const hoverLeftPct = hover != null ? (((hover + 0.5) * groupW) / W) * 100 : 0;

  return (
    <div
      ref={ref}
      className="adm-pc-chart"
      onMouseMove={(e) => pick(e.clientX, e.currentTarget)}
      onMouseLeave={() => setHover(null)}
      onTouchStart={(e) => {
        e.stopPropagation();
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchMove={(e) => {
        e.stopPropagation();
        pick(e.touches[0].clientX, e.currentTarget);
      }}
      onTouchEnd={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display: "block" }} aria-hidden>
        <line x1={0} y1={H - padBot} x2={W} y2={H - padBot} stroke="var(--adm-bd)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const x = i * groupW + (groupW - barW) / 2;
          const bH = scale(d.value);
          const y = H - padBot - bH;
          const dim = hover != null && hover !== i;
          return (
            <g
              key={d.date}
              style={{
                transformBox: "fill-box",
                transformOrigin: "bottom",
                transform: draw ? "scaleY(1)" : "scaleY(0)",
                transition: reduced ? "none" : `transform 480ms ease-out ${Math.min(i * 10, 220)}ms`,
                opacity: dim ? 0.5 : 1,
              }}
            >
              {d.value > 0 && <rect x={x} y={y} width={barW} height={bH} fill={color} rx={1.5} />}
            </g>
          );
        })}
      </svg>

      {hd && (
        <div className="adm-pc-chart-tip" style={{ left: `${hoverLeftPct}%` }}>
          <span className="adm-pc-chart-tip-v">{formatValue ? formatValue(hd.value) : String(hd.value)}</span>
          <span className="adm-pc-chart-tip-d">{formatDay(hd.date)}</span>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(data[0].date)}</span>
        <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{formatDay(data[n - 1].date)}</span>
      </div>
    </div>
  );
}
