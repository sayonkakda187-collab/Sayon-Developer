"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getAudienceStats } from "@/app/admin/audience-actions";
import { WorldBubbleMap } from "./WorldBubbleMap";
import { CountryFlag } from "./CountryFlag";
import { LiveReaders } from "./LiveReaders";
import { countryColor, countryName } from "@/lib/countries";
import { deviceColor, deviceLabel, normalizeDevice, DEVICE_ORDER } from "@/lib/devices";
import { GlobeIcon } from "./icons";
import { formatNumber } from "@/lib/site";

type Stat = { countryCode: string; count: number };
type DeviceStat = { device: string; count: number };
type ArticleOpt = { id: string; title: string };

const RANGES = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "All time", value: 0 },
];

export function AudienceDashboard({
  initialStats,
  initialTotal,
  initialDevices,
  initialDeviceTotal,
  articles,
}: {
  initialStats: Stat[];
  initialTotal: number;
  initialDevices: DeviceStat[];
  initialDeviceTotal: number;
  articles: ArticleOpt[];
}) {
  const [scope, setScope] = useState<string>("all"); // "all" or an articleId
  const [days, setDays] = useState(0);
  const [stats, setStats] = useState<Stat[]>(initialStats);
  const [total, setTotal] = useState(initialTotal);
  const [devices, setDevices] = useState<DeviceStat[]>(initialDevices);
  const [deviceTotal, setDeviceTotal] = useState(initialDeviceTotal);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const firstRun = useRef(true);

  // Re-fetch when scope / range change (the first render already has server data).
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    let cancelled = false;
    setLoading(true);
    getAudienceStats({ articleId: scope === "all" ? undefined : scope, days }).then((res) => {
      if (cancelled) return;
      setStats(res.stats);
      setTotal(res.total);
      setDevices(res.devices.stats);
      setDeviceTotal(res.devices.total);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [scope, days]);

  const filteredArticles = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? articles.filter((a) => a.title.toLowerCase().includes(q)) : articles;
  }, [articles, query]);

  const max = Math.max(1, ...stats.map((s) => s.count));
  const scopeLabel = scope === "all" ? "All articles" : articles.find((a) => a.id === scope)?.title ?? "Article";
  // Stable display order (phones → desktop → tablet) for the device breakdown;
  // `devices` itself is already sorted by count, so devices[0] is the top device.
  const orderedDevices = DEVICE_ORDER.map((d) =>
    devices.find((x) => normalizeDevice(x.device) === d),
  ).filter((x): x is DeviceStat => !!x && x.count > 0);
  const topDevice = devices[0] ?? null;

  return (
    <div>
      <div className="adm-page-h">
        <h1>Audience</h1>
        <p>Where your readers are and what they read on — visitor countries + device mix (privacy-respecting: aggregate counts only, via Vercel’s free geo header + the request User-Agent).</p>
      </div>

      {/* Real-time readers (always on, independent of the scope/range filters) */}
      <LiveReaders />

      {/* Controls */}
      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className="adm-field" style={{ marginTop: 0, flex: "1 1 280px", maxWidth: 420 }}>
            <span>Scope</span>
            {articles.length > 8 && (
              <input
                className="adm-input"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search articles…"
                aria-label="Filter articles"
                style={{ marginBottom: 6 }}
              />
            )}
            <select className="adm-input" value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Audience scope">
              <option value="all">All articles (overall)</option>
              {filteredArticles.map((a) => (
                <option key={a.id} value={a.id}>{a.title}</option>
              ))}
            </select>
          </label>

          <div className="adm-field" style={{ marginTop: 0 }}>
            <span>Date range</span>
            <div className="adm-seg" role="tablist" aria-label="Date range">
              {RANGES.map((r) => (
                <button key={r.value} type="button" role="tab" aria-selected={days === r.value} className={`adm-seg-btn ${days === r.value ? "on" : ""}`} onClick={() => setDays(r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <Skeleton />
      ) : stats.length === 0 ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill"><GlobeIcon className="h-[36px] w-[36px]" /></div>
            <h2 className="adm-serif">No visitor data yet</h2>
            <p>
              Countries will appear here as people read your articles{scope !== "all" ? " (for this one)" : ""}
              {days ? " in this period" : ""}. Real geo data only starts once visitors hit the live site.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Summary */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 16 }}>
            <SummaryTile label="Visitors" value={formatNumber(total)} sub={scopeLabel} />
            <SummaryTile label="Countries" value={formatNumber(stats.length)} sub={days ? `last ${days} days` : "all time"} />
            <SummaryTile
              label="Top country"
              value={
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                  <CountryFlag code={stats[0].countryCode} width={24} /> {countryName(stats[0].countryCode)}
                </span>
              }
              sub={`${formatNumber(stats[0].count)} · ${total ? Math.round((stats[0].count / total) * 100) : 0}%`}
            />
            {topDevice && (
              <SummaryTile
                label="Top device"
                value={
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <span style={{ color: deviceColor(topDevice.device), display: "inline-flex" }}>
                      <DeviceIcon type={topDevice.device} />
                    </span>
                    {deviceLabel(topDevice.device)}
                  </span>
                }
                sub={`${formatNumber(topDevice.count)} · ${deviceTotal ? Math.round((topDevice.count / deviceTotal) * 100) : 0}%`}
              />
            )}
          </div>

          <div className="adm-grid-2">
            <div className="adm-card adm-card-pad">
              <div className="adm-card-title">Where readers are</div>
              <div className="adm-card-sub" style={{ marginBottom: 10 }}>Bubble size ∝ visitors · {scopeLabel}</div>
              <WorldBubbleMap stats={stats} total={total} />
            </div>

            <div className="adm-card adm-card-pad">
              <div className="adm-card-title">Countries</div>
              <div className="adm-card-sub" style={{ marginBottom: 8 }}>{formatNumber(stats.length)} {stats.length === 1 ? "country" : "countries"} · {formatNumber(total)} visitors</div>
              <div style={{ maxHeight: 420, overflowY: "auto" }}>
                {stats.map((s, i) => {
                  const pct = total ? Math.round((s.count / total) * 100) : 0;
                  return (
                    <div key={s.countryCode} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: "1px solid var(--adm-bd)" }}>
                      <span style={{ width: 18, textAlign: "right", color: "var(--adm-muted-2)", fontSize: 11.5, flex: "none", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
                      <span style={{ width: 24, display: "inline-flex", justifyContent: "center", flex: "none" }}><CountryFlag code={s.countryCode} width={22} /></span>
                      <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "var(--adm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontSize: 13.5 }}>
                        {countryName(s.countryCode)}
                      </span>
                      <div className="adm-bar-track" style={{ flex: "0 0 80px", maxWidth: 80 }}>
                        <div className="adm-bar-fill" style={{ width: `${Math.round((s.count / max) * 100)}%`, background: countryColor(s.countryCode, i) }} />
                      </div>
                      <span style={{ flex: "none", width: 92, textAlign: "right", color: "var(--adm-muted)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                        <b style={{ color: "var(--adm-ink)" }}>{formatNumber(s.count)}</b> · {pct}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Devices — how readers access (mobile vs desktop vs tablet). Renders
              once the new per-device data starts arriving; historical reads from
              before this feature have country data but no device split. */}
          {orderedDevices.length > 0 && (
            <div className="adm-card adm-card-pad" style={{ marginTop: 16 }}>
              <div className="adm-card-title">Devices</div>
              <div className="adm-card-sub" style={{ marginBottom: 12 }}>
                How readers access · {formatNumber(deviceTotal)} {deviceTotal === 1 ? "view" : "views"} · {scopeLabel}
              </div>

              {/* Proportional split bar (mobile / desktop / tablet) */}
              <div style={{ display: "flex", height: 16, borderRadius: 999, overflow: "hidden", background: "var(--adm-bd)" }}>
                {orderedDevices.map((d) => {
                  const pct = deviceTotal ? (d.count / deviceTotal) * 100 : 0;
                  return (
                    <div
                      key={d.device}
                      title={`${deviceLabel(d.device)} · ${Math.round(pct)}%`}
                      style={{ width: `${pct}%`, background: deviceColor(d.device) }}
                    />
                  );
                })}
              </div>

              {/* Legend with per-device counts + share */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginTop: 14 }}>
                {orderedDevices.map((d) => {
                  const pct = deviceTotal ? Math.round((d.count / deviceTotal) * 100) : 0;
                  return (
                    <div key={d.device} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ width: 34, height: 34, borderRadius: 9, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", background: deviceColor(d.device), flex: "none" }}>
                        <DeviceIcon type={d.device} />
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 14 }}>{deviceLabel(d.device)}</div>
                        <div style={{ color: "var(--adm-muted)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
                          <b style={{ color: "var(--adm-ink)" }}>{formatNumber(d.count)}</b> · {pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value, sub }: { label: string; value: ReactNode; sub: string }) {
  return (
    <div className="adm-card adm-card-pad" style={{ padding: "12px 14px" }}>
      <div className="adm-card-sub" style={{ marginTop: 0 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--adm-ink)", letterSpacing: "-0.3px", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{value}</div>
      <div className="adm-gsub" style={{ marginTop: 2 }}>{sub}</div>
    </div>
  );
}

/** Small device glyph (phone / monitor / tablet), inherits color via currentColor. */
function DeviceIcon({ type }: { type: string }) {
  const d = normalizeDevice(type);
  if (d === "mobile") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  }
  if (d === "tablet") {
    return (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M11 18h2" />
      </svg>
    );
  }
  // desktop / monitor
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="4" width="20" height="13" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

function Skeleton() {
  const box = { background: "rgba(120,130,150,.14)", borderRadius: 8 } as const;
  return (
    <div className="adm-grid-2">
      {[0, 1].map((i) => (
        <div key={i} className="adm-card adm-card-pad">
          <div style={{ ...box, width: "40%", height: 14, marginBottom: 14 }} />
          <div style={{ ...box, width: "100%", height: i === 0 ? 200 : 320, borderRadius: 10 }} />
        </div>
      ))}
    </div>
  );
}
