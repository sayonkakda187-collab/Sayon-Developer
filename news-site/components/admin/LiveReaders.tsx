"use client";

import { useEffect, useRef, useState } from "react";
import { getLiveReaders, type LiveData } from "@/app/admin/audience-actions";
import { CountryFlag } from "./CountryFlag";
import { countryName } from "@/lib/countries";

function ago(s: number): string {
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s ago` : `${m}m ago`;
}

/**
 * Real-time "who's reading right now" panel. Polls getLiveReaders every 5s while
 * the Audience tab is open (stops on unmount), with a 1s local ticker so the
 * "Xs ago" times count up smoothly between polls. "Reading now" = reads in the
 * last 5 minutes (the standard real-time proxy) — no IP/PII, country only.
 */
export function LiveReaders() {
  const [data, setData] = useState<LiveData | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    const load = async () => {
      try {
        const d = await getLiveReaders();
        if (!alive.current) return;
        setData(d);
        setFetchedAt(Date.now());
      } catch {
        /* transient — keep last snapshot */
      }
    };
    load();
    const poll = setInterval(load, 5000);
    const tick = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      alive.current = false;
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  // Seconds since the last fetch, added to the server-side ages for a live count-up.
  const elapsed = Math.max(0, Math.floor((Date.now() - fetchedAt) / 1000));
  const active = data?.active ?? 0;

  return (
    <div className="adm-card adm-card-pad adm-live" style={{ marginBottom: 16 }}>
      <div className="adm-live-head">
        <span className="adm-live-dot" aria-hidden />
        <span className="adm-live-title">Live readers</span>
        <span className="adm-live-count">{active}</span>
        <span className="adm-live-sub">reading now · last 5 min · updates live</span>
      </div>

      {data == null ? (
        <p className="adm-card-sub" style={{ marginTop: 12 }}>Connecting…</p>
      ) : active === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 12 }}>
          No one’s reading right now — this updates automatically as visitors open your articles.
        </p>
      ) : (
        <div className="adm-live-grid">
          {/* Live feed of recent reads */}
          <div className="adm-live-feed">
            {data.feed.map((r) => (
              <div key={r.id} className="adm-live-row">
                <CountryFlag code={r.countryCode} width={20} />
                <span className="adm-live-rowtitle">{r.title}</span>
                <span className="adm-live-rowtime">{ago(r.secondsAgo + elapsed)}</span>
              </div>
            ))}
          </div>

          {/* What's being read + where from, right now */}
          <div className="adm-live-side">
            {data.topArticles.length > 0 && (
              <>
                <div className="adm-live-sidehd">Most-read right now</div>
                {data.topArticles.map((a) => (
                  <div key={a.slug} className="adm-live-toprow">
                    <span className="adm-live-toptitle">{a.title}</span>
                    <span className="adm-live-topcount">{a.count}</span>
                  </div>
                ))}
              </>
            )}
            {data.countries.length > 0 && (
              <div className="adm-live-flags">
                {data.countries.map((c) => (
                  <span key={c.countryCode} className="adm-live-flag" title={`${countryName(c.countryCode)} · ${c.count}`}>
                    <CountryFlag code={c.countryCode} width={18} />
                    <span>{c.count}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
