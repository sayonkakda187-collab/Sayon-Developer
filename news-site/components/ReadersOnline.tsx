"use client";

import { useEffect, useRef } from "react";

/**
 * Whos.Amung.Us live reader counter — the publisher's own snippet, placed above
 * the footer on public pages.
 *
 * Not an ad: it reports how many people are reading right now, and feeds the
 * whos.amung.us dashboard. Kept OFF /admin deliberately, for the same reason the
 * ad units are: the owner refreshing the editor would otherwise be counted as
 * readers, and an inflated number is worse than no number.
 *
 * WHY THIS IS BUILT IN AN EFFECT rather than two <script> tags in the layout.
 * Two reasons, both learned the hard way on this codebase:
 *
 *   1. ORDER. The config (`_wau.push`) must run BEFORE the loader, or the loader
 *      finds nothing to render. React hoists `<script async src>` into <head>,
 *      which would put the loader EARLIER in the document than an inline config
 *      left in the body — the opposite of what the snippet assumes. Appending
 *      both here makes the order explicit instead of depending on hoisting.
 *   2. DUPLICATES. `next/script` deduplicates by id, and the id here is also the
 *      ANCHOR the loader looks up to decide where the widget goes. The guard
 *      below is what keeps a second copy from appearing.
 *
 * It lives in the public LAYOUT, which does not unmount between articles, so it
 * mounts once per full page load and keeps counting across client-side
 * navigation. That is the right trade for a live "who is reading now" counter.
 * ⚠️ It does mean a reader moving between articles without a reload is not
 * re-counted as a new page view — the live figure is right, a page-view total
 * would under-count. Use the admin Audience tab for per-article view counts.
 */

const ANCHOR_ID = "_waug8v";
const CONFIG = 'var _wau = _wau || []; _wau.push(["dynamic", "mpvf2lcvjj", "g8v", "c4302bffffff", "small"]);';
// Explicit https. The snippet ships protocol-relative ("//waust.at/d.js"), which
// is a legacy form: it resolves to the page's scheme, so it breaks on anything
// not served over http(s). The site is HTTPS-only, so naming it costs nothing.
const LOADER_SRC = "https://waust.at/d.js";

export function ReadersOnline() {
  const slotRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;
    // Already mounted (a second instance, or a fast re-render) — one counter is
    // all the service expects, and a duplicate anchor id would be ambiguous.
    if (document.getElementById(ANCHOR_ID)) return;

    // The config script IS the anchor: the loader finds this id to decide where
    // to draw. Appending it inside our own slot is what positions the widget.
    const config = document.createElement("script");
    config.id = ANCHOR_ID;
    config.text = CONFIG;
    slot.appendChild(config);

    const loader = document.createElement("script");
    loader.async = true;
    loader.src = LOADER_SRC;
    document.body.appendChild(loader);

    return () => {
      config.remove();
      loader.remove();
    };
  }, []);

  return (
    <div
      aria-hidden
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "4px 16px 0",
        // No reserved height: the widget is tiny and arrives within a second, so
        // reserving space would leave a visible gap on every page where the
        // service is slow or blocked.
        minHeight: 0,
      }}
    >
      <span ref={slotRef} />
    </div>
  );
}
