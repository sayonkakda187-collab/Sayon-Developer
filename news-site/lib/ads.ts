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

// 2) One WIDGET ID per on-page placement.
//    NOTE: AdsKeeper widgets (MGID platform) are one-per-placement — a widget id
//    may appear in only ONE container PER PAGE (across different pages it's fine).
//    So the homepage HOME and the article IN_ARTICLE_TOP intentionally SHARE
//    2030046 — they live on different pages (/ vs /news/[slug]), so each fills
//    independently — while the article's TOP, MID and END units use different ids
//    (2030046 / 2044273 / 2029928) since they share a page (a widget fills only
//    one slot per page). All three article slots are now live.
export const ADS = {
  /** TOP-of-page article unit — rendered ABOVE the headline + cover (just under
   *  the site header) for maximum visibility. Uses 2030046 — the SAME Header
   *  Widget as the homepage HOME slot — so opening a full story shows the same
   *  card row at the top (4 cards desktop / 2 mobile), matching the homepage.
   *  It's a different page from HOME (/news/[slug] vs /), so sharing the id is
   *  fine; the article's END unit (RECOMMENDED) uses a different id since a
   *  widget fills only ONE slot per page. */
  IN_ARTICLE_TOP: "2030046",
  /** Optional in-article unit, injected between paragraphs AFTER the opening
   *  (~4th paragraph) on longer pieces. Uses 2044273 — distinct from the TOP and
   *  END ids, so all three article slots fill independently on the same page. */
  IN_ARTICLE: "2044273",
  /** End-of-article unit AFTER the story body. Uses 2029928 — distinct from the
   *  top slot's id, since a widget fills only ONE slot per page. Fills once that
   *  widget is Active/serving in AdsKeeper; until then the slot collapses cleanly
   *  (no empty box). */
  RECOMMENDED: "2029928",
  /** Homepage — rendered at the VERY TOP, above the featured hero (the first
   *  thing on landing). Uses 2030046 — a Header Widget (responsive single row:
   *  4 cards on desktop, 2 on mobile). Fills once that widget is Active/serving
   *  in AdsKeeper; until then the slot collapses cleanly (no empty box). */
  HOME: "2030046",
} as const;

// 3) Master on/off switch. Leave false until your IDs above are real.
//    Typed as `boolean` (not the literal `false`) so the on/off branches in
//    AdSlot/AdsHead type-check cleanly when you flip it.
export const ADS_ENABLED: boolean = true;

/*
 * Google AdSense ACCOUNT script — site verification + review. SEPARATE from the
 * AdsKeeper integration above; AdSense permits other networks, so both run side
 * by side. This is ONLY the account script (no `<ins class="adsbygoogle">` ad
 * units yet — those come after approval). It loads site-wide from the ROOT
 * layout's served <head> so Google's crawler can verify the site — see
 * components/AdSenseHead.tsx. ALWAYS on (verification needs it present); it is
 * intentionally NOT gated by ADS_ENABLED. The publisher id is public by design
 * (it ships in the page HTML) and must match the `google.com, pub-… , DIRECT`
 * line in public/ads.txt.
 */
export const ADSENSE_PUBLISHER_ID = "ca-pub-5470257305108580";

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
