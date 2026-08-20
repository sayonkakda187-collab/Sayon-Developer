"use client";

import { useEffect, useRef, useState } from "react";
import { NATIVE, nativeLive, httpsSrc } from "@/lib/adsterra";

/**
 * Adsterra NATIVE BANNER — the `invoke.js` script plus the empty container div
 * Adsterra gives you. The script finds the container by id and fills it with a
 * row of native cards.
 *
 * Loads LAZILY (IntersectionObserver, 200px before it scrolls into view) so it
 * never competes with the article for bandwidth, and mounts the script only
 * once. If the unit isn't configured, nothing renders at all.
 *
 * The wrapper carries an "Advertisement" label (good practice, and required by
 * most networks) and matches the site's surface/border tokens in light + dark.
 */
export function AdsterraNative({ className }: { className?: string }) {
  const live = nativeLive();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [load, setLoad] = useState(false);

  useEffect(() => {
    if (!live || load || !wrapRef.current) return;
    const el = wrapRef.current;
    if (typeof IntersectionObserver === "undefined") {
      setLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLoad(true);
          io.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [live, load]);

  // Inject the invoke script once the slot is near the viewport. Appended to the
  // document (not the container) because Adsterra's script looks the container
  // up by id — it must already exist in the DOM, which it does by this point.
  useEffect(() => {
    if (!load) return;
    const id = "adsterra-native-invoke";
    if (document.getElementById(id)) return;
    const s = document.createElement("script");
    s.id = id;
    s.async = true;
    s.setAttribute("data-cfasync", "false");
    s.src = httpsSrc(NATIVE.src);
    document.body.appendChild(s);
  }, [load]);

  if (!live) return null;

  return (
    <div
      className={`mx-auto my-8 w-full max-w-prose ${className ?? ""}`}
      role="complementary"
      aria-label="Advertisement"
    >
      <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
        Advertisement
      </p>
      <div ref={wrapRef} className="overflow-hidden rounded-xl">
        {/* Adsterra fills this by id; it must stay empty and keep the exact id. */}
        <div id={NATIVE.containerId} />
      </div>
    </div>
  );
}
