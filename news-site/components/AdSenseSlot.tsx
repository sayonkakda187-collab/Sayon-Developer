import { ADSENSE_PUBLISHER_ID } from "@/lib/ads";

/**
 * A reserved Google AdSense placement (SEPARATE from the AdsKeeper `AdSlot`).
 *
 * This is LAYOUT PREP: until AdSense approval, no real `<ins class="adsbygoogle">`
 * markup ships. While disabled (the default — see lib/adsense.ts) it renders
 * NOTHING, so there are no empty gaps. While enabled it reserves `minHeight` (to
 * avoid layout shift) and shows the "Advertisement" label; a dev/preview hint
 * marks where the unit will go. Pass `enabled` resolved once per page so a single
 * settings read covers every slot.
 */
export function AdSenseSlot({
  enabled,
  slot,
  minHeight = 280,
  className,
}: {
  enabled: boolean;
  /** Position id, e.g. "in-article" | "article-end" | "home-mid" (future wiring). */
  slot: string;
  minHeight?: number;
  className?: string;
}) {
  if (!enabled) return null;

  // Show the labeled hint where it helps review — local dev + Vercel preview —
  // but keep production clean (just reserved space + the Advertisement label).
  const showHint =
    process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  return (
    <div
      className={`mx-auto my-8 w-full max-w-prose ${className ?? ""}`}
      role="complementary"
      aria-label="Advertisement"
      data-adsense-slot={slot}
    >
      <p className="mb-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-fg-faint">
        Advertisement
      </p>
      <div
        className="flex items-center justify-center overflow-hidden rounded-xl border border-border bg-surface"
        style={{ minHeight }}
      >
        {/* Reserved for a Google AdSense unit ({ADSENSE_PUBLISHER_ID}). Real
            <ins class="adsbygoogle"> markup is added after AdSense approval. */}
        {showHint && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center">
            <span className="text-sm font-semibold text-fg-muted">AdSense slot · {slot}</span>
            <span className="text-xs text-fg-faint">
              Reserved — units added after approval ({ADSENSE_PUBLISHER_ID})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
