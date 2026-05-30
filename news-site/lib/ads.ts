/*
 * AdsKeeper ad configuration — the ONLY file you edit to go live.
 * ---------------------------------------------------------------------------
 * AdsKeeper has two parts and this app wires up both for you:
 *   1) A head preloader script, loaded once site-wide
 *      (https://jsc.adskeeper.com/site/SITE_ID.js) — see components/AdsHead.tsx.
 *   2) A body widget container per placement
 *      (<div data-type="_mgwidget" data-widget-id="WIDGET_ID">) — see
 *      components/AdSlot.tsx. Each placement uses its own unique WIDGET_ID.
 *
 * ── HOW TO GO LIVE (paste your IDs here, then flip the flag) ────────────────
 *   1. SITE ID — In the AdsKeeper dashboard, your head loader URL looks like
 *      https://jsc.adskeeper.com/site/123456.js. That number (123456) is your
 *      SITE ID. Paste it into ADSKEEPER_SITE_ID below.
 *   2. WIDGET IDs — AdsKeeper dashboard → "Add Widget". Create ONE widget for
 *      each placement (Top, In-article, Sidebar/Related). Each widget you save
 *      gives you a WIDGET ID. Paste them into ADS.TOP / ADS.IN_ARTICLE /
 *      ADS.SIDEBAR below (the data-widget-id value of each container).
 *   3. ENABLE — set ADS_ENABLED to true.
 *
 * That's it. Until you do all three, real visitors see NOTHING (the site stays
 * clean — no empty/broken ad boxes); in local dev you'll see labeled dashed
 * placeholder boxes showing exactly where each ad will appear.
 *
 * Note: these IDs are public by design (they ship in the page HTML), so it's
 * fine to commit them here. No database, auth, or backend change is involved.
 */

// 1) Your AdsKeeper SITE ID (the number in the head loader URL). ← REPLACE
export const ADSKEEPER_SITE_ID = "REPLACE_WITH_SITE_ID";

// 2) One WIDGET ID per on-page placement. ← REPLACE each with the widget id
//    from AdsKeeper dashboard → Add Widget.
export const ADS = {
  /** Top of the article, just under the headline/lede. */
  TOP: "REPLACE_WITH_WIDGET_ID",
  /** Injected into the middle of the article body, between paragraphs. */
  IN_ARTICLE: "REPLACE_WITH_WIDGET_ID",
  /** Sidebar / related area — here, just above "Related Stories". */
  SIDEBAR: "REPLACE_WITH_WIDGET_ID",
} as const;

// 3) Master on/off switch. Leave false until your IDs above are real.
//    Typed as `boolean` (not the literal `false`) so the on/off branches in
//    AdSlot/AdsHead type-check cleanly when you flip it.
export const ADS_ENABLED: boolean = false;

// ── Helpers (no need to edit below) ─────────────────────────────────────────

const PLACEHOLDER_PREFIX = "REPLACE_WITH";

/** True while an id is still the shipped placeholder (or empty). */
export function isPlaceholder(id: string | null | undefined): boolean {
  return !id || id.startsWith(PLACEHOLDER_PREFIX);
}

/** Whether the head preloader should mount: ads on AND a real site id set. */
export function adsHeadEnabled(): boolean {
  return ADS_ENABLED && !isPlaceholder(ADSKEEPER_SITE_ID);
}

/** Whether a specific placement should render a real ad. */
export function adSlotLive(widgetId: string): boolean {
  return ADS_ENABLED && !isPlaceholder(widgetId);
}
