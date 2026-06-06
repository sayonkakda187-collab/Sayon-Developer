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
 *   2. WIDGET IDs — AdsKeeper dashboard → "Add Widget". Create ONE widget per
 *      placement (In-article, end-of-article Recommendation, Home). Each widget
 *      you save gives you a WIDGET ID. Paste them into ADS.IN_ARTICLE /
 *      ADS.RECOMMENDED / ADS.HOME below (the data-widget-id of each container).
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
export const ADSKEEPER_SITE_ID = "1097964";

// 2) One WIDGET ID per on-page placement. ← REPLACE each with the widget id
//    from AdsKeeper dashboard → Add Widget.
//    NOTE: AdsKeeper widgets (MGID platform) are one-per-placement — a widget id
//    may appear in only ONE container per page. So only RECOMMENDED is live for
//    now; create a separate widget for IN_ARTICLE / HOME before they fill
//    (reusing 2019769 in another slot is not supported and would leave it unfilled).
export const ADS = {
  /** TOP-of-page article unit — rendered ABOVE the headline + cover (just under
   *  the site header) for maximum visibility. Its own widget id (distinct from
   *  RECOMMENDED, since a widget fills only ONE slot per page). LIVE — but if
   *  AdsKeeper hasn't activated/filled this widget yet the slot collapses to
   *  nothing (no empty box). For a clean top banner, use a banner/in-page
   *  AdsKeeper widget format here rather than a recommendation grid. */
  IN_ARTICLE_TOP: "2029928",
  /** Optional in-article unit, injected between paragraphs AFTER the opening
   *  (~4th paragraph) on longer pieces. Placeholder until you add one. */
  IN_ARTICLE: "REPLACE_WITH_WIDGET_ID",
  /** End-of-article "Interesting for you" recommendation widget (what to read
   *  next) — rendered AFTER the story body. The one widget known to fill. */
  RECOMMENDED: "2019769",
  /** Homepage — rendered at the VERY TOP, above the featured hero. Needs its own
   *  widget id (placeholder renders nothing in prod until you add one). */
  HOME: "REPLACE_WITH_WIDGET_ID",
} as const;

// 3) Master on/off switch. Leave false until your IDs above are real.
//    Typed as `boolean` (not the literal `false`) so the on/off branches in
//    AdSlot/AdsHead type-check cleanly when you flip it.
export const ADS_ENABLED: boolean = true;

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
