"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AdSlot } from "@/components/AdSlot";
import { ADS } from "@/lib/ads";

// In-content AdsKeeper widget ids interspersed among the images. Each id appears
// ONCE on this page (a widget fills only one slot per page). GALLERY_FEED (2047583)
// is a DEDICATED gallery Feed widget (its own earnings reporting) and leads the
// feed rotation; the rest are reused from the article/home placements, which live
// on different pages, so they fill independently here. Layout: a header unit up
// top, feed units woven into the grid, a recommendation unit at the end. All
// AdsKeeper — no pop networks.
const TOP_AD = ADS.HOME;
const FEED_ADS = [ADS.GALLERY_FEED, ADS.IN_ARTICLE, ADS.IN_ARTICLE_2, ADS.IN_ARTICLE_3] as const;
const END_AD = ADS.RECOMMENDED;

export function GalleryView({ title, images }: { title: string; images: string[] }) {
  const [active, setActive] = useState<number | null>(null);

  // While the viewer is open: lock scroll, close on Esc, arrow-key navigation.
  useEffect(() => {
    if (active === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
      else if (e.key === "ArrowRight")
        setActive((i) => (i === null ? i : Math.min(images.length - 1, i + 1)));
      else if (e.key === "ArrowLeft")
        setActive((i) => (i === null ? i : Math.max(0, i - 1)));
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [active, images.length]);

  // Weave the grid: after every 5th image, drop in the next unused feed ad
  // (each ad id used once, so we never exceed one-slot-per-widget-per-page).
  const cells: ReactNode[] = [];
  let adCursor = 0;
  images.forEach((src, i) => {
    cells.push(
      <button
        key={`img-${i}`}
        type="button"
        onClick={() => setActive(i)}
        className="group relative aspect-square overflow-hidden rounded-xl bg-surface-2"
        aria-label={`Open image ${i + 1}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </button>,
    );
    if ((i + 1) % 5 === 0 && adCursor < FEED_ADS.length) {
      const id = FEED_ADS[adCursor++];
      cells.push(
        <div key={`ad-${i}`} className="col-span-full">
          <AdSlot widgetId={id} minHeight={120} />
        </div>,
      );
    }
  });

  return (
    <>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>

      <AdSlot widgetId={TOP_AD} minHeight={120} />

      {images.length === 0 ? (
        <p className="py-16 text-center text-fg-muted">This gallery has no images yet.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{cells}</div>
      )}

      <div className="mt-6">
        <AdSlot widgetId={END_AD} minHeight={250} />
      </div>

      {/* Tap-to-enlarge viewer */}
      {active !== null && images[active] ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Image viewer"
          onClick={() => setActive(null)}
        >
          <button
            type="button"
            onClick={() => setActive(null)}
            aria-label="Close"
            className="fixed right-3 top-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition-colors hover:bg-white/20"
          >
            <span aria-hidden>×</span>
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[active]}
            alt=""
            className="max-h-[90vh] max-w-full rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </>
  );
}
