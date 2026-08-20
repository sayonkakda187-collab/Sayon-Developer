"use client";

import { useEffect, useRef, useState } from "react";
import {
  BANNER_INVOKE_HOST,
  bannerLive,
  httpsSrc,
  type AdsterraBanner as BannerConfig,
} from "@/lib/adsterra";

/**
 * Adsterra FIXED-SIZE DISPLAY BANNER (the `atOptions` snippet).
 *
 * Adsterra's banner snippet sets a GLOBAL `atOptions` object that its
 * `invoke.js` reads on load — so two banners pasted on the same page overwrite
 * each other and only one renders. To avoid that entirely, each banner is
 * rendered inside its own `srcdoc` iframe: every unit gets a fresh global scope,
 * so any number of banners coexist on one page.
 *
 * Loads LAZILY (200px before it scrolls into view) and reserves its exact
 * height up-front, so it never causes layout shift. Unconfigured → renders
 * nothing.
 */
export function AdsterraBanner({
  banner,
  className,
}: {
  banner: BannerConfig;
  className?: string;
}) {
  const live = bannerLive(banner);
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

  if (!live) return null;

  const invoke = httpsSrc(`${BANNER_INVOKE_HOST}/${banner.key}/invoke.js`);
  // Self-contained document for this one banner. JSON.stringify keeps the key
  // safely quoted, and the fresh scope means `atOptions` can't collide.
  const srcDoc = `<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>
</head><body>
<script type="text/javascript">
  atOptions = {
    'key' : ${JSON.stringify(banner.key)},
    'format' : 'iframe',
    'height' : ${banner.height},
    'width' : ${banner.width},
    'params' : {}
  };
<\/script>
<script type="text/javascript" src="${invoke}"><\/script>
</body></html>`;

  return (
    <div
      className={`mx-auto my-8 w-full ${className ?? ""}`}
      role="complementary"
      aria-label="Advertisement"
    >
      <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
        Advertisement
      </p>
      <div
        ref={wrapRef}
        className="mx-auto max-w-full overflow-hidden"
        style={{ width: banner.width, height: banner.height }}
      >
        {load && (
          <iframe
            title="Advertisement"
            srcDoc={srcDoc}
            width={banner.width}
            height={banner.height}
            scrolling="no"
            frameBorder={0}
            style={{ border: 0, display: "block", maxWidth: "100%" }}
          />
        )}
      </div>
    </div>
  );
}
