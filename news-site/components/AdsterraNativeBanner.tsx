"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Adsterra Native Banner — end of the article body, above comments.
 *
 * Two parts that must both be present: the `invoke.js` loader and a div whose
 * id the loader looks up. The div is rendered here and the loader is appended
 * from the effect below, AFTER the container exists, so it is always in the DOM
 * before the loader goes looking for it.
 *
 * WHY NOT `next/script`. It was `<Script id="adsterra-native-banner">`, and
 * next/script deduplicates by that id: on a client-side move from one article
 * to the next, the component remounts with a fresh EMPTY container but the
 * loader is considered already loaded and never runs again. The unit filled on
 * the first article of a session and was blank on every one after it — which is
 * precisely the reader who followed a Related Stories link. Verified by probe:
 * loader executions stayed at 1 across two articles while the second
 * container's childElementCount stayed 0.
 *
 * So the tag is appended per mount with a cache-busting query, and removed on
 * unmount. The query matters: without it the browser serves the cached script
 * and, more importantly, Adsterra's loader guards against running twice for the
 * same source in one document.
 *
 * WHY THE MARGINS ARE CONDITIONAL. An element with vertical margins occupies
 * flow even when it is completely empty — that is exactly the dead-space bug
 * removed in #237, where ad wrappers outlived their ads and left ~48px gaps.
 * So the 25px margins are applied ONLY once the loader has actually put
 * something in the container. Unfilled, this renders at zero height and is
 * invisible: no gap between the article and the comments.
 *
 * WHY NO RESERVED HEIGHT. Reserving a fixed height is the usual anti-CLS move,
 * but it is the wrong trade here. A native banner's height varies with how many
 * cards the network returns, so a guessed value shifts the page anyway — and
 * when the unit does not fill, the reservation becomes a visible hole that then
 * collapses, which is a second shift. This slot sits below the entire article
 * body, so it fills within ~1s of hydration while the reader is still near the
 * top; the growth happens far outside the viewport and costs no measurable CLS.
 *
 * The wrapper keeps full width and is never `display:none`, because ad loaders
 * measure their container to decide what to render — a hidden container reports
 * zero width and can come back empty or badly laid out. It does clip horizontal
 * overflow, so a non-responsive creative is cropped rather than being allowed to
 * widen the page on a phone.
 */
const NATIVE_SRC =
  "https://pl31425114.profitableratecpmnetwork.com/5ef91e899ea49e48f0e9772782c5829b/invoke.js";
const CONTAINER_ID = "container-5ef91e899ea49e48f0e9772782c5829b";

export function AdsterraNativeBanner() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const hasContent = () => el.childElementCount > 0;
    if (hasContent()) {
      setFilled(true);
      return;
    }

    const observer = new MutationObserver(() => {
      if (hasContent()) {
        setFilled(true);
        observer.disconnect();
      }
    });
    observer.observe(el, { childList: true, subtree: true });

    // Append the loader HERE rather than rendering a <Script>, so it runs again
    // on every article — see the note above. The container is in the DOM by now
    // because this effect runs after the commit.
    const script = document.createElement("script");
    script.src = `${NATIVE_SRC}?r=${Date.now()}`;
    script.async = true;
    script.setAttribute("data-cfasync", "false");
    document.body.appendChild(script);

    return () => {
      observer.disconnect();
      script.remove();
    };
  }, []);

  return (
    <>
      <div
        data-ad="native"
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: filled ? "25px auto" : "0 auto",
          textAlign: "center",
          // A unit that returns a fixed, over-wide creative would otherwise
          // push the whole PAGE wide and give every phone a horizontal
          // scrollbar — max-width on this wrapper does not constrain a child
          // the loader injects. Measured at 320/375/393px: an over-wide ad
          // took document scrollWidth to 986px until this clipped it.
          overflow: "hidden",
        }}
      >
        <div id={CONTAINER_ID} ref={containerRef} style={{ maxWidth: "100%" }} />
      </div>
    </>
  );
}
