"use client";

import { useEffect, useRef, useState } from "react";
import { adSlotLive } from "@/lib/ads";

declare global {
  interface Window {
    // AdsKeeper command queue (populated by the head preloader).
    _mgq?: unknown[][];
  }
}

/**
 * Sticky footer ad — a slim, DISMISSIBLE bar pinned to the bottom of the
 * viewport holding one AdsKeeper "IAB DISPLAY STANDARD AD UNIT" (a fixed-size
 * banner; a small anchor size like 320×50 / 728×90 fits best). Mounted ONCE
 * site-wide in the public layout, so it rides along on the home page + every
 * article — the highest-viewability spot left, and lighter than an interstitial.
 *
 * It reveals itself (slides up) ONLY once the ad actually fills, so a reader
 * never sees an empty bar; if the network returns nothing it stays hidden. A
 * small × dismisses it for the browsing session.
 *
 * Renders nothing when ads are off or the id is still a placeholder (clean
 * production); a labeled placeholder bar shows only in local dev + Vercel
 * preview so the position is reviewable before the real id is wired.
 */
export function AdStickyFooter({ widgetId }: { widgetId: string }) {
  const live = adSlotLive(widgetId);
  // Show the labeled placeholder where it helps review — local dev + Vercel
  // preview — but never to real visitors on production.
  const showPlaceholder =
    !live &&
    (process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_VERCEL_ENV === "preview");
  const slotRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!live) return;
    // Tell AdsKeeper to scan the DOM and fill the container.
    window._mgq = window._mgq || [];
    window._mgq.push(["_mgc.load"]);

    let ro: ResizeObserver | undefined;
    // The bar stays hidden until the ad gives the slot real height — then we
    // slide it into view. No fill → it never appears (no empty bar).
    const check = () => {
      const el = slotRef.current;
      if (el && el.offsetHeight >= 30) {
        setFilled(true);
        ro?.disconnect();
      }
    };
    if (typeof ResizeObserver !== "undefined" && slotRef.current) {
      ro = new ResizeObserver(check);
      ro.observe(slotRef.current);
    }
    // Backstop for a late fill / browsers without ResizeObserver.
    const timer = window.setTimeout(check, 8000);

    return () => {
      ro?.disconnect();
      window.clearTimeout(timer);
    };
  }, [live, widgetId]);

  if (dismissed) return null;
  if (!live && !showPlaceholder) return null;

  // Slide up once filled (live); the dev/preview placeholder shows immediately.
  const revealed = live ? filled : true;

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 transition-transform duration-300 ${
        revealed ? "translate-y-0" : "translate-y-full"
      }`}
      role="complementary"
      aria-label="Advertisement"
    >
      <div className="mx-auto max-w-5xl border-t border-border bg-surface shadow-lg">
        <div className="flex items-center justify-between px-2 py-0.5">
          <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-fg-faint">
            Advertisement
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Close ad"
            className="flex h-5 w-5 items-center justify-center rounded-full text-fg-muted hover:opacity-70"
          >
            <span aria-hidden className="text-sm leading-none">
              ×
            </span>
          </button>
        </div>
        <div className="flex justify-center px-2 pb-1.5">
          {live ? (
            <div ref={slotRef} data-type="_mgwidget" data-widget-id={widgetId} />
          ) : (
            <span className="py-3 text-xs text-fg-muted">
              Sticky footer ad — set ADS.STICKY_FOOTER to your IAB widget id
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
