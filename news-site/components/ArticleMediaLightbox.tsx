"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { adSlotLive } from "@/lib/ads";
import { AdSlot } from "@/components/AdSlot";

type Media = { src: string; alt: string; kind: "image" | "video" };

/**
 * Wraps the article content and turns a tap on any in-content image/video (or
 * the cover) into a full-screen viewer that ALSO carries an ad — the "tap media
 * → ad" experience, done safely IN-PAGE (a dismissible overlay, never a popup or
 * redirect), so it carries none of the Facebook / ad-network blacklist risk that
 * pop-under networks do. The enlarged image is the reader payoff; the ad beneath
 * it is the monetization.
 *
 * Scope + safety of the click handler:
 *  - the cover hero opts in via `data-lightbox-src` on its gradient overlay;
 *  - body images/videos inside this scope open too, EXCEPT ones inside a link
 *    (those navigate) or inside an ad unit (`[data-type="_mgwidget"]`).
 *
 * Gated exactly like <AdSlot>: only active when the lightbox ad id is live
 * (production) or in a review context (local dev / Vercel preview). Otherwise it
 * is completely inert — the listener is never attached, images behave normally,
 * and the article renders unchanged.
 */
export function ArticleMediaLightbox({
  widgetId,
  children,
}: {
  widgetId: string;
  children: React.ReactNode;
}) {
  const live = adSlotLive(widgetId);
  const showPlaceholder =
    !live &&
    (process.env.NODE_ENV !== "production" ||
      process.env.NEXT_PUBLIC_VERCEL_ENV === "preview");
  const active = live || showPlaceholder;

  const scopeRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreRef = useRef<Element | null>(null);
  const [media, setMedia] = useState<Media | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Delegated click → open the viewer for a tapped content image/video/cover.
  useEffect(() => {
    const root = scopeRef.current;
    if (!active || !root) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || e.defaultPrevented) return;

      // Cover hero: its gradient overlay carries the original cover URL.
      const cover = target.closest<HTMLElement>("[data-lightbox-src]");
      if (cover?.dataset.lightboxSrc) {
        e.preventDefault();
        restoreRef.current = document.activeElement;
        setMedia({
          src: cover.dataset.lightboxSrc,
          alt: cover.dataset.lightboxAlt || "",
          kind: "image",
        });
        return;
      }

      const el = target.closest<HTMLElement>("img, video");
      if (!el || !root.contains(el)) return;
      // Link images navigate; ad images belong to the network — leave both alone.
      if (el.closest("a") || el.closest('[data-type="_mgwidget"]')) return;
      const src =
        el instanceof HTMLImageElement
          ? el.currentSrc || el.src
          : el instanceof HTMLVideoElement
            ? el.currentSrc || el.src
            : "";
      if (!src) return;
      e.preventDefault();
      restoreRef.current = document.activeElement;
      setMedia({
        src,
        alt: (el.getAttribute("alt") || "").trim(),
        kind: el.tagName === "VIDEO" ? "video" : "image",
      });
    };

    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [active]);

  // While open: lock body scroll, close on Esc, move focus in and restore it out.
  useEffect(() => {
    if (!media) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMedia(null);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      if (restoreRef.current instanceof HTMLElement) restoreRef.current.focus();
    };
  }, [media]);

  return (
    <div ref={scopeRef} data-lightbox-active={active ? "" : undefined} style={{ display: "contents" }}>
      {children}
      {mounted && media
        ? createPortal(
            <div
              className="fixed inset-0 z-[60] flex flex-col overflow-y-auto overscroll-contain bg-black/85 backdrop-blur-sm"
              role="dialog"
              aria-modal="true"
              aria-label="Image viewer"
              onClick={() => setMedia(null)}
            >
              <button
                ref={closeRef}
                type="button"
                onClick={() => setMedia(null)}
                aria-label="Close"
                className="fixed right-3 top-3 z-10 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white backdrop-blur transition-colors hover:bg-white/20"
              >
                <span aria-hidden>×</span>
              </button>
              <div
                className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center gap-4 px-4 py-16"
                onClick={(e) => e.stopPropagation()}
              >
                {media.kind === "video" ? (
                  <video
                    src={media.src}
                    controls
                    autoPlay
                    playsInline
                    className="max-h-[70vh] w-auto max-w-full rounded-lg"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.src}
                    alt={media.alt}
                    className="max-h-[70vh] w-auto max-w-full rounded-lg object-contain"
                  />
                )}
                {media.alt ? (
                  <p className="max-w-prose text-center text-sm text-white/70">{media.alt}</p>
                ) : null}
                {/* The ad that monetizes the tap — on a surface card so its label
                    and any unfilled/placeholder state read correctly over the
                    dark backdrop. AdSlot collapses cleanly if nothing fills. */}
                <div className="w-full max-w-md rounded-2xl bg-surface px-2 shadow-2xl">
                  <AdSlot widgetId={widgetId} name="LIGHTBOX" minHeight={250} />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
