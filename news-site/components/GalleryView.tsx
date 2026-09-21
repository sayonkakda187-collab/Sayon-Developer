"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

export function GalleryView({
  title,
  images,
  videos = [],
}: {
  title: string;
  images: string[];
  videos?: string[];
}) {
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
  });

  return (
    <>
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        {title}
      </h1>


      {videos.length > 0 && (
        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {videos.map((src, i) => (
            <video
              key={`vid-${i}`}
              src={src}
              controls
              playsInline
              preload="metadata"
              className="w-full rounded-xl bg-black"
            />
          ))}
        </section>
      )}

      {images.length > 0 ? (
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{cells}</div>
      ) : videos.length === 0 ? (
        <p className="py-16 text-center text-fg-muted">This gallery is empty.</p>
      ) : null}


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
