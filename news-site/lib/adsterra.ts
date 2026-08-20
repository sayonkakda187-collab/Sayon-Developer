/*
 * Adsterra ad configuration — the ONLY file you edit to go live.
 * ---------------------------------------------------------------------------
 * Adsterra runs ALONGSIDE the existing AdsKeeper setup (lib/ads.ts); the two are
 * completely independent and neither is touched by the other.
 *
 * ── HOW TO GO LIVE ─────────────────────────────────────────────────────────
 * In the Adsterra dashboard each ad unit gives you a snippet. Paste the pieces
 * below, then flip ADSTERRA_ENABLED to true. Until then NOTHING renders — the
 * site stays clean (no empty boxes, no stray scripts).
 *
 * Adsterra gives you one of THREE snippet shapes. Match yours:
 *
 * 1) SOCIAL BAR / POPUNDER / IN-PAGE PUSH  — a single self-displaying script:
 *      <script src='//pl12345678.profitablecpmgate.com/ab/cd/ef/abcdef.js'></script>
 *    → copy just the src value into SOCIAL_BAR / POPUNDER below.
 *
 * 2) NATIVE BANNER — an invoke.js script PLUS an empty container div:
 *      <script async data-cfasync="false" src="//pl123.../abcd1234/invoke.js"></script>
 *      <div id="container-abcd1234"></div>
 *    → src → NATIVE.src, and the div's id → NATIVE.containerId.
 *
 * 3) DISPLAY BANNER (fixed size) — an `atOptions` block PLUS an invoke.js script:
 *      atOptions = { 'key':'abcd…', 'format':'iframe', 'height':250, 'width':300 }
 *      <script src="//www.highperformanceformat.com/abcd…/invoke.js"></script>
 *    → key/width/height go into BANNERS below (the invoke host is derived from
 *      the key, and each banner renders inside its own iframe so several units
 *      on one page never clobber each other's `atOptions` global).
 *
 * These IDs are public by design (they ship in the page HTML), so committing
 * them here is fine. No database, auth, or backend involvement.
 */

// ── 1) Master switch. Leave false until the IDs below are real. ─────────────
//
// Currently OFF and no keys are set: the previous 728x90 unit was approved for
// dailyledger.today and the site now publishes as ledgerdailynews.com, so that
// unit was removed to be used on a different site. Adsterra ad units belong to
// ONE registered website — reusing a unit across domains does not serve. To run
// Adsterra here again, register ledgerdailynews.com in Adsterra, create fresh
// units, paste the keys below and flip this to true. All the wiring below is
// intact, so that is the only change needed.
export const ADSTERRA_ENABLED: boolean = false;

// ── 2) Self-displaying, site-wide formats (script src only) ─────────────────
/** Social Bar — a floating bar/notification Adsterra positions itself. */
export const SOCIAL_BAR_SRC = "REPLACE_WITH_SOCIAL_BAR_SRC";
/** Popunder — opens a background tab on interaction. ⚠️ Aggressive: it is the
 *  biggest earner but the biggest UX cost, and it permanently disqualifies the
 *  site from Google AdSense. Leave as-is to keep it off. */
export const POPUNDER_SRC = "REPLACE_WITH_POPUNDER_SRC";
/** In-Page Push — push-style notification cards rendered in the page. */
export const IN_PAGE_PUSH_SRC = "REPLACE_WITH_IN_PAGE_PUSH_SRC";

// ── 3) Native Banner (invoke.js + its container div) ────────────────────────
export const NATIVE = {
  src: "REPLACE_WITH_NATIVE_INVOKE_SRC",
  /** The id of the empty <div> Adsterra gave you, e.g. "container-abcd1234". */
  containerId: "REPLACE_WITH_NATIVE_CONTAINER_ID",
} as const;

// ── 4) Fixed-size display banners (atOptions) ───────────────────────────────
/** One entry per placement. Use DIFFERENT keys for units on the SAME page. */
export const BANNERS = {
  /** Inside the article body. 300x250 works on mobile + desktop. */
  ARTICLE: { key: "REPLACE_WITH_BANNER_KEY", width: 300, height: 250 },
  /** Bottom of every public page. 728x90 desktop leaderboard. */
  FOOTER: { key: "REPLACE_WITH_FOOTER_BANNER_KEY", width: 728, height: 90 },
} as const;

/** Host that serves the atOptions `invoke.js`. Adsterra normally uses
 *  highperformanceformat.com for fixed-size banners; if YOUR snippet shows a
 *  different host, change it here to match exactly. */
export const BANNER_INVOKE_HOST = "//www.highperformanceformat.com";

export type AdsterraBanner = { key: string; width: number; height: number };

// ── Helpers (no need to edit below) ─────────────────────────────────────────

const PLACEHOLDER_PREFIX = "REPLACE_WITH";

/** True while a value is still the shipped placeholder (or empty). */
export function isPlaceholder(v: string | null | undefined): boolean {
  return !v || v.startsWith(PLACEHOLDER_PREFIX);
}

/** Whether a single self-displaying script should mount. */
export function scriptLive(src: string): boolean {
  return ADSTERRA_ENABLED && !isPlaceholder(src);
}

/** Whether the native banner is fully configured. */
export function nativeLive(): boolean {
  return ADSTERRA_ENABLED && !isPlaceholder(NATIVE.src) && !isPlaceholder(NATIVE.containerId);
}

/** Whether a fixed-size banner placement is fully configured. */
export function bannerLive(b: AdsterraBanner): boolean {
  return ADSTERRA_ENABLED && !isPlaceholder(b.key) && b.width > 0 && b.height > 0;
}

/** Normalize a protocol-relative Adsterra src ("//host/x.js") to https. */
export function httpsSrc(src: string): string {
  return src.startsWith("//") ? `https:${src}` : src;
}
