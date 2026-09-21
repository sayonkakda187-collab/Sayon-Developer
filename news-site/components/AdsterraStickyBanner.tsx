"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dismissible sticky banner pinned to the bottom of the viewport, carrying an
 * ad unit passed in as `children`.
 *
 * The ad itself is rendered by the SERVER (the public layout passes
 * `<AdsterraIframeBanner>` in), so no ad markup ships through this client
 * component — only the shell that positions and dismisses it.
 *
 * THREE-STATE RENDER, to avoid both a hydration mismatch and a flash.
 * Whether the reader already dismissed the bar lives in `sessionStorage`, which
 * does not exist during server rendering. Reading it in a `useState` initialiser
 * would make the server and client disagree on the very first render. So both
 * start in `checking` — identical markup, no mismatch — and an effect then
 * decides. While checking, the bar is laid out but `opacity: 0`, which keeps it
 * from flashing at someone who already closed it AND keeps it measurable: ad
 * loaders size themselves from their container, and a `display: none` container
 * reports zero width.
 *
 * BODY PADDING. The bar is `position: fixed`, so it is out of flow and would sit
 * on top of the footer. This is why the padding is measured rather than derived
 * from the ad's declared height: the bar is the ad plus the close-button strip,
 * the bottom inset and the safe-area inset. The real rendered height is measured (`ResizeObserver`,
 * so it stays right if the creative resizes) and applied as `padding-bottom` on
 * `<body>`, then removed again on dismiss or unmount. Measuring rather than
 * hard-coding matters because an unfilled unit is shorter than a filled one.
 */
const DISMISS_KEY = "adsterra-sticky-dismissed";

export function AdsterraStickyBanner({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"checking" | "visible" | "dismissed">("checking");
  const barRef = useRef<HTMLDivElement>(null);

  // Decide visibility after hydration, never during it.
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = sessionStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode / blocked storage: just show the bar.
    }
    setStatus(dismissed ? "dismissed" : "visible");
  }, []);

  // Keep <body> padded by however tall the bar actually is.
  useEffect(() => {
    const el = barRef.current;
    if (status !== "visible" || !el) {
      document.body.style.paddingBottom = "";
      return;
    }
    const apply = () => {
      document.body.style.paddingBottom = `${Math.ceil(el.getBoundingClientRect().height)}px`;
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.body.style.paddingBottom = "";
    };
  }, [status]);

  if (status === "dismissed") return null;

  const shown = status === "visible";

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // Not persisting is fine — it still closes for this page view.
    }
    setStatus("dismissed");
  };

  return (
    <div
      ref={barRef}
      data-ad="sticky-bottom"
      role="complementary"
      aria-label="Advertisement"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        zIndex: 99999,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        // The top strip exists so the ✕ has somewhere to live that is NOT on top
        // of the ad. A 320-wide unit is full-bleed on a 320px phone, so a button
        // in the bar's corner would otherwise cover the creative. 30px clears
        // the 28px button; the bottom inset keeps it off the home indicator.
        padding: "30px 0 calc(6px + env(safe-area-inset-bottom, 0px))",
        background: "rgba(var(--bg), 0.96)",
        boxShadow: "0 -2px 12px rgba(0, 0, 0, 0.14)",
        backdropFilter: "blur(6px)",
        // A creative that ignores its declared width must not be able to widen
        // the page and give every phone a horizontal scrollbar.
        overflow: "hidden",
        opacity: shown ? 1 : 0,
        pointerEvents: shown ? "auto" : "none",
        transition: "opacity 150ms ease",
      }}
    >
      {children}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Close advertisement"
        title="Close advertisement"
        style={{
          position: "absolute",
          top: 1,
          right: 8,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 28,
          // Padding pushes the touch target out to ~44px without a 44px circle.
          border: "1px solid rgba(var(--border), 1)",
          borderRadius: "9999px",
          background: "rgba(var(--bg), 0.92)",
          color: "rgb(var(--fg-muted))",
          fontSize: 15,
          lineHeight: 1,
          cursor: "pointer",
          padding: 0,
        }}
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
