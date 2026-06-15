"use client";

import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/site";
import { eachDate, formatRange } from "@/lib/fbInsightsRange";
import { AnimatedBars, type SeriesPoint } from "@/components/admin/PageControlCharts";
import type { Range } from "@/components/admin/FacebookPageInsights";

type AdBreakDay = { date: string; impressions: number };
type Status = "ok" | "needs_monetization" | "unavailable" | "reconnect";
type State = { status: Status; days: AdBreakDay[] } | "loading" | "error";

const BLUE = "#2563eb";

/** 0-filled daily series across the range, for the bar chart. */
function fill(range: Range, days: AdBreakDay[]): SeriesPoint[] {
  const m = new Map(days.map((d) => [d.date, d.impressions]));
  return eachDate(range.from, range.to).map((d) => ({ date: d, value: m.get(d) ?? 0 }));
}

/**
 * Analytics-tab card: this Page's DAILY video ad-break ad IMPRESSIONS (in-stream ad
 * views) as a blue bar chart over the range. Clearly labeled as IMPRESSIONS, not $
 * earnings. Defensive states: needs monetization access, metric not available
 * (retired), or reconnect — each explained, never a broken/empty box. `apiBase` lets
 * the read-only Manager Portal point this at the portal endpoint.
 */
export function VideoAdBreakChart({ pageDbId, range, apiBase }: { pageDbId: string; range: Range; apiBase: string }) {
  const [state, setState] = useState<State>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    fetch(`${apiBase}/video-adbreaks?detail=${encodeURIComponent(pageDbId)}&from=${range.from}&to=${range.to}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setState(j.ok ? { status: j.status as Status, days: (j.days ?? []) as AdBreakDay[] } : "error");
      })
      .catch(() => !cancelled && setState("error"));
    return () => {
      cancelled = true;
    };
  }, [pageDbId, range.from, range.to, apiBase]);

  return (
    <section className="adm-card adm-card-pad" style={{ marginTop: 14 }}>
      <div className="adm-card-title" style={{ fontSize: 14 }}>Video ad-break impressions</div>
      <div className="adm-fb-sub" style={{ marginTop: 1 }}>
        Ad views served in this Page’s video ad breaks · {formatRange(range.from, range.to)} — <strong>impressions, not earnings</strong>
      </div>

      {state === "loading" ? (
        <div className="adm-pc-skel" style={{ height: 120, marginTop: 12, borderRadius: 12 }} />
      ) : state === "error" ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>Couldn’t load video ad-break impressions — try again.</p>
      ) : state.status === "reconnect" ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>This Page’s token can’t read insights right now — reconnect it to see ad-break impressions.</p>
      ) : state.status === "unavailable" ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>
          Not available — Facebook isn’t returning this metric for the Page (it may have been retired).
        </p>
      ) : state.status === "needs_monetization" ? (
        <p className="adm-card-sub" style={{ marginTop: 10 }}>
          Video ad-break impressions need <strong>monetization access</strong> on this Page’s token — the Page must be enrolled
          in in-stream ads and the token granted that access. Nothing to show for this range.
        </p>
      ) : (
        <>
          <div style={{ fontWeight: 800, fontSize: 22, color: BLUE, marginTop: 8, fontVariantNumeric: "tabular-nums" }}>
            {formatNumber(state.days.reduce((s, d) => s + d.impressions, 0))}
            <span className="adm-fb-sub" style={{ fontSize: 12, fontWeight: 600, marginLeft: 8 }}>impressions total</span>
          </div>
          <div style={{ marginTop: 10 }}>
            <AnimatedBars data={fill(range, state.days)} color={BLUE} formatValue={(v) => `${formatNumber(v)} impressions`} />
          </div>
        </>
      )}
    </section>
  );
}
