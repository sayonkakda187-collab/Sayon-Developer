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
  // Set when nothing has painted yet, so the slot reserves no height and leaves
  // no blank gap. The container STAYS mounted — see the note in the effect.
  const [empty, setEmpty] = useState(false);
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
            setEmpty(false);
            ro?.disconnect();
          }
        });
        ro.observe(slot);
      }

      // Grace period. Afterwards, if nothing has painted, RELEASE the reserved
      // height so no blank gap is left — but keep the container in the DOM and
      // the ResizeObserver running.
      //
      // ⚠️ This used to UNMOUNT the slot, which silently broke any widget that
      // paints late. AdsKeeper units can be configured to display on a schedule
      // (2071266 is set to a 40-second display frequency), and a unit that had
      // not painted within 8s had its container deleted — so the network could
      // never fill it at all. Removing the container is unrecoverable; dropping
      // the reserved height is not.
      timer = window.setTimeout(() => {
        if (!slot.isConnected) return;
        if (slot.offsetHeight >= 30) setFilled(true);
        else setEmpty(true);
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

  if (!live) return null;

  // AdsKeeper's standard container, verbatim. Height is reserved only while the
  // ad is on its way: released once it lands, and released again if it never
  // does — so an empty slot takes up no space but is still there to be filled.
  return (
    <div
      ref={slotRef}
      data-type="_mgwidget"
      data-widget-id={widgetId}
      className={className}
      style={filled || empty ? undefined : { minHeight }}
    />
  );
}
