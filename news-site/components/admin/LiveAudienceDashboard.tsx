"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";

/**
 * Live-audience dashboard for the private galleries — a whos.amung.us-style view:
 * a big "readers now" number plus a real-time reader graph (last hour), and a
 * per-gallery breakdown with sparklines + country/device split. Polls the
 * admin live endpoint every 5s; the reader time series is sampled server-side
 * from real visitor heartbeats, so the graph keeps history even between visits.
 * All charts are dependency-free SVG and theme-aware (section accent = fuchsia).
 */

type LiveInfo = { count: number; countries: Record<string, number>; devices: Record<string, number> };
type SeriesPoint = { t: number; c: number };
type Poll = { live: Record<string, LiveInfo>; series: Record<string, SeriesPoint[]>; now: number };

const WINDOW_MIN = 60; // must match SERIES_WINDOW_MIN on the server
const POLL_MS = 5000;

// Alpha-2 country code → flag emoji (regional indicators); unknown / "ZZ" → 🌐.
function flag(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc) || cc.toUpperCase() === "ZZ") return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

function niceMax(v: number): number {
  if (v <= 1) return 1;
  if (v <= 2) return 2;
  if (v <= 5) return 5;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

const bucketOf = (ms: number) => Math.floor(ms / 60_000) * 60_000;

/** Turn a bucket→count map into a dense oldest→newest array over the last `minutes`. */
function densify(map: Map<number, number>, now: number, minutes = WINDOW_MIN): number[] {
  const end = bucketOf(now);
  const out: number[] = [];
  for (let i = minutes - 1; i >= 0; i--) out.push(map.get(end - i * 60_000) ?? 0);
  return out;
}

function denseOne(points: SeriesPoint[], now: number): number[] {
  const m = new Map<number, number>();
  for (const p of points) m.set(p.t, p.c);
  return densify(m, now);
}

export function LiveAudienceDashboard({
  galleries,
  baseUrl,
}: {
  galleries: { token: string; title: string; enabled: boolean }[];
  baseUrl: string;
}) {
  const [data, setData] = useState<Poll>({ live: {}, series: {}, now: Date.now() });
  const [fetchedAt, setFetchedAt] = useState(0);
  const [tick, setTick] = useState(0);
  const [ok, setOk] = useState(true);
  const firstLoad = useRef(true);

  // Poll live counts + series every 5s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/galleries/live", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const d = (await res.json()) as Partial<Poll>;
        if (!alive) return;
        setData({ live: d.live || {}, series: d.series || {}, now: typeof d.now === "number" ? d.now : Date.now() });
        setFetchedAt(Date.now());
        setOk(true);
        firstLoad.current = false;
      } catch {
        if (alive) setOk(false);
      }
    };
    load();
    const iv = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);

  // 1s ticker just for the "updated Ns ago" label.
  useEffect(() => {
    const iv = window.setInterval(() => setTick((t) => (t + 1) % 3600), 1000);
    return () => window.clearInterval(iv);
  }, []);

  const { live, series, now } = data;

  const totalNow = useMemo(
    () => Object.values(live).reduce((s, v) => s + (v?.count || 0), 0),
    [live],
  );
  const liveGalleries = useMemo(
    () => Object.values(live).filter((v) => (v?.count || 0) > 0).length,
    [live],
  );

  // Site-wide dense series (sum across galleries per minute); tip pinned to the live total.
  const siteSeries = useMemo(() => {
    const m = new Map<number, number>();
    for (const pts of Object.values(series)) for (const p of pts) m.set(p.t, (m.get(p.t) ?? 0) + p.c);
    const dense = densify(m, now);
    dense[dense.length - 1] = Math.max(dense[dense.length - 1], totalNow);
    return dense;
  }, [series, now, totalNow]);

  const peak60 = useMemo(() => Math.max(0, ...siteSeries), [siteSeries]);

  const sorted = useMemo(() => {
    return [...galleries].sort((a, b) => {
      const ca = live[a.token]?.count ?? 0;
      const cb = live[b.token]?.count ?? 0;
      if (cb !== ca) return cb - ca;
      const sa = (series[a.token]?.length ?? 0) > 0 ? 1 : 0;
      const sb = (series[b.token]?.length ?? 0) > 0 ? 1 : 0;
      if (sb !== sa) return sb - sa;
      return a.title.localeCompare(b.title);
    });
  }, [galleries, live, series]);

  const secondsAgo = fetchedAt ? Math.max(0, Math.round((Date.now() - fetchedAt) / 1000)) : null;
  void tick; // re-render each second so `secondsAgo` stays fresh

  return (
    <div className="space-y-6">
      {/* Hero: big readers-now number + live graph */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex flex-wrap items-end justify-between gap-4 p-5 sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-faint">
              <span className="relative flex h-2 w-2">
                {totalNow > 0 && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 motion-safe:animate-ping" />
                )}
                <span
                  className={`relative inline-flex h-2 w-2 rounded-full ${totalNow > 0 ? "bg-emerald-500" : "bg-fg-faint"}`}
                />
              </span>
              Reading now
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-5xl font-extrabold tabular-nums text-fg sm:text-6xl">{totalNow}</span>
              <span className="text-sm text-fg-muted">
                {totalNow === 1 ? "reader" : "readers"} right now
              </span>
            </div>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <div className="text-2xl font-bold tabular-nums text-fg">{liveGalleries}</div>
              <div className="text-xs text-fg-faint">galleries live</div>
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums text-fg">{peak60}</div>
              <div className="text-xs text-fg-faint">peak · 60 min</div>
            </div>
          </div>
        </div>

        <div className="px-2 pb-2 sm:px-3 sm:pb-3">
          <LiveAreaChart values={siteSeries} height={176} live showAxis />
          <div className="flex justify-between px-2 pb-1 text-[10px] text-fg-faint">
            <span>60 min ago</span>
            <span>30 min ago</span>
            <span>now</span>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-border px-5 py-2 text-xs text-fg-faint">
          <span>Auto-refreshing every {POLL_MS / 1000}s</span>
          <span>
            {ok ? (
              secondsAgo === null
                ? "Connecting…"
                : secondsAgo <= 1
                  ? "Updated just now"
                  : `Updated ${secondsAgo}s ago`
            ) : (
              <span className="text-amber-600 dark:text-amber-400">Reconnecting…</span>
            )}
          </span>
        </div>
      </div>

      {/* Per-gallery breakdown */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-fg-muted">By gallery</h2>
        {galleries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-4 text-sm text-fg-muted">
            No galleries yet.{" "}
            <Link href="/admin/galleries" className="adm-link font-semibold">
              Create one
            </Link>{" "}
            and share its secret link to see live readers here.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {sorted.map((g) => {
              const info = live[g.token];
              const count = info?.count ?? 0;
              const dense = denseOne(series[g.token] ?? [], now);
              dense[dense.length - 1] = Math.max(dense[dense.length - 1], count);
              const hasHistory = (series[g.token]?.length ?? 0) > 0;
              return (
                <li
                  key={g.token}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 sm:gap-4 sm:p-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold text-fg">{g.title}</span>
                      {!g.enabled && (
                        <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-fg-faint">
                          Disabled
                        </span>
                      )}
                    </div>
                    <div className="mt-1 truncate text-xs text-fg-muted">
                      {count > 0 && info ? (
                        <>
                          {Object.entries(info.countries)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 6)
                            .map(([cc, n]) => `${flag(cc)} ${n}`)
                            .join("  ")}
                          <span className="text-fg-faint">
                            {"   ·   "}
                            {Object.entries(info.devices)
                              .sort((a, b) => b[1] - a[1])
                              .map(([d, n]) => `${n} ${d}`)
                              .join(" · ")}
                          </span>
                        </>
                      ) : hasHistory ? (
                        <span className="text-fg-faint">Quiet now · had readers in the last hour</span>
                      ) : (
                        <span className="text-fg-faint">No readers yet</span>
                      )}
                    </div>
                  </div>

                  <div className="hidden w-28 shrink-0 sm:block">
                    <LiveAreaChart values={dense} height={34} />
                  </div>

                  <div className="w-12 shrink-0 text-right">
                    <div
                      className={`text-xl font-bold tabular-nums ${count > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-fg-faint"}`}
                    >
                      {count}
                    </div>
                    <div className="text-[10px] text-fg-faint">now</div>
                  </div>

                  <a
                    href={`${baseUrl.replace(/\/$/, "")}/g/${g.token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs font-semibold hover:bg-surface-2"
                  >
                    Open
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-fg-faint">
        Counts are anonymous — a reader is someone with the gallery open in the last ~35 seconds (country is
        coarse, from Vercel&apos;s geo header; no IP or personal data is stored). The graph shows peak concurrent
        readers per minute over the last hour.
      </p>
    </div>
  );
}

/** Dependency-free live area chart. Vertical units map 1:1 to px (fixed height,
 *  stretched horizontally), so the stroke stays crisp and overlaid HTML lines up. */
function LiveAreaChart({
  values,
  height = 168,
  live = false,
  showAxis = false,
}: {
  values: number[];
  height?: number;
  live?: boolean;
  showAxis?: boolean;
}) {
  const rawId = useId();
  const gid = `lac-${rawId.replace(/[^a-zA-Z0-9]/g, "")}`;
  const vals = values.length >= 2 ? values : [values[0] ?? 0, values[0] ?? 0];
  const W = 600;
  const padX = 6;
  const top = 8;
  const bottom = height - 8;
  const yMax = niceMax(Math.max(1, ...vals));
  const x = (i: number) => padX + (i / (vals.length - 1)) * (W - padX * 2);
  const y = (v: number) => bottom - (Math.max(0, v) / yMax) * (bottom - top);
  const line = vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${line} L${x(vals.length - 1).toFixed(1)},${bottom.toFixed(1)} L${x(0).toFixed(1)},${bottom.toFixed(1)} Z`;
  const lastVal = vals[vals.length - 1];

  return (
    <div className="relative w-full" style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        className="block"
        aria-hidden
      >
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgb(var(--section-accent))" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(var(--section-accent))" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path
          d={line}
          fill="none"
          stroke="rgb(var(--section-accent))"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {showAxis && (
        <div className="pointer-events-none absolute inset-0 select-none">
          <span className="absolute left-1.5 top-0 text-[10px] tabular-nums text-fg-faint">{yMax}</span>
          <span className="absolute left-1.5 text-[10px] tabular-nums text-fg-faint" style={{ top: bottom - 7 }}>
            0
          </span>
        </div>
      )}

      {live && (
        <span
          className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${(x(vals.length - 1) / W) * 100}%`, top: y(lastVal) }}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full rounded-full bg-[rgb(var(--section-accent))] opacity-60 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-[rgb(var(--section-accent))]" />
          </span>
        </span>
      )}
    </div>
  );
}
