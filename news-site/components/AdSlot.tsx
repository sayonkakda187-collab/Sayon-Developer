"use client";

import { useEffect, useRef, useState } from "react";
import { ADS, adSlotLive } from "@/lib/ads";

declare global {
  interface Window {
    // AdsKeeper command queue (populated by the head preloader). Pushing
    // ["_mgc.load"] tells it to scan the DOM and fill any widget containers.
    _mgq?: unknown[][];
  }
}

/** Config key a placeholder maps to, shown in dev so you know what to fill in. */
type AdName = keyof typeof ADS;

/**
 * One AdsKeeper ad placement.
 *
 * - Live (ADS_ENABLED + a real widget id): renders the AdsKeeper body container
 *   and triggers the loader when the slot nears the viewport (lazy, no layout
 *   shift — height is reserved via `minHeight`). If the network does NOT fill
 *   the slot within a short grace period, the whole unit collapses (renders
 *   nothing) so it never leaves an empty "Advertisement" box — important now
 *   that a slot can sit above the headline.
 * - Not live: a labeled dashed placeholder box where it's useful for review
 *   (local dev + Vercel *preview* deployments) so you can see where ads will go,
 *   and NOTHING on the real production site so visitors see a clean page.
 *
 * Always carries a small "Advertisement" label (good practice; many networks
 * require it) and matches the site's surface/border tokens in light + dark.
 */
export function AdSlot({
  widgetId,
  name,
  minHeight = 280,
  className,
}: {
  widgetId: string;
  /** Config key (e.g. "HOME"); only used to label the dev placeholder. */
  name?: AdName;
  /** Reserved height (px) to prevent layout shift while the ad loads. */
  minHeight?: number;
  className?: string;
}) {
  const live = adSlotLive(widgetId);
  // Show the labeled placeholder where it helps review — local dev and Vercel
  // preview deployments — but never to real visitors on the production domain.
  // (Vercel auto-exposes NEXT_PUBLIC_VERCEL_ENV = "production" | "preview".)
  const showPlaceholder =
    !live &&
    (process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_VERCEL_ENV === "preview");
  const wrapRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  // Flips true when the network returns no ad, collapsing the slot cleanly.
  const [unfilled, setUnfilled] = useState(false);

  useEffect(() => {
    if (!live || !wrapRef.current) return;
    const wrap = wrapRef.current;
    let triggered = false;
    let timer: number | undefined;
    let io: IntersectionObserver | undefined;

    const load = () => {
      window._mgq = window._mgq || [];
      window._mgq.push(["_mgc.load"]);
      // Grace period for AdsKeeper to fill the slot. If the inner widget
      // container is still effectively empty afterwards, collapse the unit so
      // no orphan "Advertisement" box is left behind.
      timer = window.setTimeout(() => {
        const el = slotRef.current;
        if (el && el.isConnected && el.offsetHeight < 30) setUnfilled(true);
      }, 8000);
    };

    // Lazy: only ask the loader to fill this slot once it's near the viewport.
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
        { rootMargin: "200px" }
      );
      io.observe(wrap);
    }

    return () => {
      io?.disconnect();
      if (timer) window.clearTimeout(timer);
    };
  }, [live, widgetId]);

  // Not live and not in a review context → render nothing (clean page).
  if (!live && !showPlaceholder) return null;
  // Live but the network returned no ad → collapse cleanly.
  if (unfilled) return null;

  return (
    <div
      className={`mx-auto my-8 w-full max-w-prose ${className ?? ""}`}
      role="complementary"
      aria-label="Advertisement"
    >
      <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
        Advertisement
      </p>
      {live ? (
        <div
          ref={wrapRef}
          className="overflow-hidden rounded-xl border border-border bg-surface"
          style={{ minHeight }}
        >
          <div ref={slotRef} data-type="_mgwidget" data-widget-id={widgetId} />
        </div>
      ) : (
        // Placeholder (dev + preview only) so you can see the slot before IDs.
        <div
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-surface-2 px-4 text-center"
          style={{ minHeight }}
        >
          <span className="text-sm font-semibold text-fg-muted">
            Ad placement{name ? ` · ADS.${name}` : ""}
          </span>
          <span className="text-xs text-fg-faint">
            Add your AdsKeeper widget ID in{" "}
            <code className="rounded bg-surface px-1 py-0.5">lib/ads.ts</code> and
            set <code className="rounded bg-surface px-1 py-0.5">ADS_ENABLED</code>
          </span>
        </div>
      )}
    </div>
  );
}
