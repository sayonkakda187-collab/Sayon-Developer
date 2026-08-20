"use client";

import { useEffect, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { ADS, adSlotRenders } from "@/lib/ads";

type RailSlot = { name: keyof typeof ADS; widgetId: string };

/** Below this width there is no room for a sidebar, so the rail never mounts. */
const DESKTOP = "(min-width: 1024px)";

/**
 * Sticky DESKTOP-ONLY ad rail beside the article body — the stacked units the
 * reference layout shows on the right, each with its own disclosure label.
 *
 * Two deliberate behaviours:
 *
 * 1. **It mounts only on desktop widths** (matchMedia in an effect, not a CSS
 *    `hidden lg:block`). AdsKeeper's loader scans the whole DOM when any slot
 *    asks it to fill, so a `display:none` container would still be filled — the
 *    impression would be served to a reader who can never see it, which is
 *    exactly the kind of thing that gets a site's ad account flagged. Keeping
 *    the containers out of the DOM entirely on phones avoids that.
 * 2. **It renders nothing when none of its slots would show anything** (all
 *    widget ids still placeholders, or ads off). The article's flex row then has
 *    a single child, so the story column stays centred — no empty right column.
 *
 * A rail slot that IS live but goes unfilled collapses itself (see <AdSlot>);
 * the column is `auto`-width so it shrinks to nothing when that happens.
 */
export function AdRail({ slots, className }: { slots: RailSlot[]; className?: string }) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const shown = slots.filter((s) => adSlotRenders(s.widgetId));
  if (!desktop || shown.length === 0) return null;

  return (
    // The <aside> is a flex item, so it stretches to the full height of the
    // article row — that tall box is what the sticky unit below travels inside.
    <aside className={`w-[300px] flex-none ${className ?? ""}`} aria-label="Advertisements">
      {shown.map((s, i) => {
        const last = i === shown.length - 1;
        return (
          <div
            key={s.name}
            // Upper units sit in normal flow at the top of the rail; the LAST
            // one is sticky, so exactly one unit rides along with the reader.
            // (Making the whole stack sticky would overflow the viewport and
            // leave the lower unit permanently clipped.)
            className={last ? "sticky top-24" : "mb-6"}
          >
            <AdSlot name={s.name} widgetId={s.widgetId} variant="rail" minHeight={300} />
          </div>
        );
      })}
    </aside>
  );
}
