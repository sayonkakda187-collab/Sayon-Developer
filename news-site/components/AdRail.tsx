"use client";

import { useEffect, useState } from "react";
import { AdSlot } from "@/components/AdSlot";
import { adSlotLive } from "@/lib/ads";

/** Below this width there is no room for a sidebar, so the rail never mounts. */
const DESKTOP = "(min-width: 1024px)";

/**
 * Sticky DESKTOP-ONLY ad rail beside the article body — the column an AdsKeeper
 * "Sidebar widget" is built for (a tall unit in a narrow column).
 *
 * Two deliberate behaviours:
 *
 * 1. **It mounts only at desktop widths** (matchMedia in an effect, not a CSS
 *    `hidden lg:block`). AdsKeeper's loader scans the whole DOM when any slot
 *    asks it to fill, so a `display:none` container would still be filled — the
 *    impression served to a reader who can never see it. Keeping the container
 *    out of the DOM on phones avoids paying for invisible impressions.
 * 2. **It renders nothing when no slot is live**, so the article's flex row has a
 *    single child and the story column stays centred exactly as it is today —
 *    never an empty right-hand column.
 */
export function AdRail({ widgetIds }: { widgetIds: string[] }) {
  const [desktop, setDesktop] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP);
    const sync = () => setDesktop(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const shown = widgetIds.filter(adSlotLive);
  if (!desktop || shown.length === 0) return null;

  return (
    // A plain <div>, not an <aside>: each <AdSlot> is already its own labelled
    // region. As a flex item it stretches to the row's full height, which is the
    // tall box the sticky unit below travels inside.
    <div className="w-[300px] flex-none">
      {shown.map((id, i) => (
        <div
          key={id}
          // Upper units sit in normal flow; the LAST is sticky, so exactly one
          // rides along with the reader. A fully sticky stack would overflow the
          // viewport and leave the lower unit permanently clipped.
          className={i === shown.length - 1 ? "sticky top-24" : "mb-6"}
        >
          <AdSlot widgetId={id} minHeight={600} />
        </div>
      ))}
    </div>
  );
}
