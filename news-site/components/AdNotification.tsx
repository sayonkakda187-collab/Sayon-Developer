"use client";

import { useEffect, useRef } from "react";
import { adSlotLive } from "@/lib/ads";

declare global {
  interface Window {
    // AdsKeeper command queue (populated by the head preloader).
    _mgq?: unknown[][];
  }
}

/**
 * AdsKeeper IN-SITE NOTIFICATION unit (e.g. widget 2044288).
 *
 * Unlike `AdSlot` — an in-content box with reserved height + an "Advertisement"
 * label — an in-site notification is a **floating overlay** that AdsKeeper
 * positions itself, per the widget's own dashboard settings (Position, Frequency,
 * Activate-after-scroll). So this renders ONLY the bare widget container and fires
 * the loader once: no wrapper, no reserved space, no label, no layout shift.
 *
 * Mounted ONCE site-wide in the public layout, so it can appear on every public
 * page (home + every article). It actually displays only on a domain authorized in
 * your AdsKeeper account (production); on other domains AdsKeeper returns nothing,
 * so the container stays invisible. Renders nothing when ads are disabled.
 */
export function AdNotification({ widgetId }: { widgetId: string }) {
  const triggered = useRef(false);

  useEffect(() => {
    if (!adSlotLive(widgetId) || triggered.current) return;
    triggered.current = true;
    // Tell AdsKeeper to scan the DOM and fill any widget containers (incl. this one).
    window._mgq = window._mgq || [];
    window._mgq.push(["_mgc.load"]);
  }, [widgetId]);

  if (!adSlotLive(widgetId)) return null;
  return <div data-type="_mgwidget" data-widget-id={widgetId} />;
}
