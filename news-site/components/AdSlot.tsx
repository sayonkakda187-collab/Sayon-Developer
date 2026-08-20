"use client";

import { useEffect, useRef, useState } from "react";
import { adSlotLive } from "@/lib/ads";

declare global {
  interface Window {
    // AdsKeeper command queue (populated by the head preloader). Pushing
    // ["_mgc.load"] tells it to scan the DOM and fill any widget containers.
    _mgq?: unknown[][];
  }
}

/**
 * One AdsKeeper ad placement — AdsKeeper's STANDARD widget container, nothing
 * custom around it.
 *
 * What ships is exactly what the dashboard's install snippet gives you:
 *
 *   <div data-type="_mgwidget" data-widget-id="…" style="min-height:…px">
 *   …then _mgq.push(["_mgc.load"])
 *
 * No wrapper box, no border, no background, no "Advertisement" caption, no width
 * clamp — the widget renders in whatever the network serves, at the full width of
 * wherever it is placed. AdsKeeper's own creatives carry their sponsored
 * labelling, so nothing here needs to add one.
 *
 * Two behaviours are kept because they are invisible and prevent broken pages,
 * not styling:
 *   • the `_mgc.load` call is made when the slot nears the viewport rather than
 *     at page load, so an ad far down the page doesn't compete with the story;
 *   • `min-height` (the same reservation AdsKeeper's snippet sets) is released
 *     once the ad lands, and the slot removes itself if the network returns
 *     nothing — otherwise an unfilled unit leaves a tall blank gap mid-article.
 *
 * With no widget id set, this renders nothing at all.
 */
export function AdSlot({
  widgetId,
  minHeight = 300,
  className,
}: {
  widgetId: string;
  /** Height reserved while the ad loads — AdsKeeper's snippet suggests 300. */
  minHeight?: number;
  className?: string;
}) {
  const live = adSlotLive(widgetId);
  const slotRef = useRef<HTMLDivElement>(null);
  // Set when the network returns no ad, so the slot leaves no blank gap.
  const [unfilled, setUnfilled] = useState(false);
  // Set once the ad lands, releasing the reserved height so the container hugs it.
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    if (!live || !slotRef.current) return;
    const slot = slotRef.current;
    let triggered = false;
    let timer: number | undefined;
    let io: IntersectionObserver | undefined;
    let ro: ResizeObserver | undefined;

    const load = () => {
      window._mgq = window._mgq || [];
      window._mgq.push(["_mgc.load"]);

      // The container's height jumps the moment AdsKeeper injects the ad.
      if (typeof ResizeObserver !== "undefined") {
        ro = new ResizeObserver(() => {
          if (slot.offsetHeight >= 30) {
            setFilled(true);
            ro?.disconnect();
          }
        });
        ro.observe(slot);
      }

      // Grace period: afterwards it either has content (also a backstop for
      // browsers without ResizeObserver) or the slot removes itself.
      timer = window.setTimeout(() => {
        if (!slot.isConnected) return;
        if (slot.offsetHeight >= 30) setFilled(true);
        else setUnfilled(true);
      }, 8000);
    };

    if (typeof IntersectionObserver === "undefined") {
      load();
    } else {
      io = new IntersectionObserver(
        (entries) => {
          if (!triggered && entries.some((e) => e.isIntersecting)) {
            triggered = true;
            load();
            io?.disconnect();
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(slot);
    }

    return () => {
      io?.disconnect();
      ro?.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [live, widgetId]);

  if (!live || unfilled) return null;

  // AdsKeeper's standard container, verbatim.
  return (
    <div
      ref={slotRef}
      data-type="_mgwidget"
      data-widget-id={widgetId}
      className={className}
      style={filled ? undefined : { minHeight }}
    />
  );
}
