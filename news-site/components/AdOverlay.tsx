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
 * AdsKeeper SELF-DISPLAYING OVERLAY unit — e.g. an in-site notification (a floating
 * card) or an interstitial / "promoted content" pop-up (shown after N internal
 * clicks). These formats **position and trigger themselves** per the widget's own
 * dashboard settings, so this renders ONLY the bare widget container and fires the
 * loader once: no wrapper, no reserved space, no "Advertisement" label, no layout
 * shift (unlike `AdSlot`, which is for in-content boxes).
 *
 * Mounted ONCE site-wide in the public layout so the format can appear on every
 * public page (home + every article). It actually shows only on a domain authorized
 * in your AdsKeeper account (production); elsewhere AdsKeeper returns nothing, so the
 * container stays invisible. Renders nothing when ads are disabled.
 */
export function AdOverlay({ widgetId }: { widgetId: string }) {
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
