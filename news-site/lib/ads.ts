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
//    independently — while the article's TOP, two MID and END units use different
//    ids (2030046 / 2019813 / 2019769 / 2029928) since they share a page (a widget
//    fills only one slot per page). All four are IN-CONTENT widgets (Header/Feed) —
//    the format that renders as inline native cards in the body. The second MID unit
//    only appears on longer pieces (see buildArticleParts in the article page).
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
   *  (~4th paragraph) on longer pieces. Uses 2019813 — a HEADER in-content widget
   *  (renders inline native cards), distinct from the TOP and END ids so all
   *  article slots fill independently on the same page. */
  IN_ARTICLE: "2019813",
  /** Optional SECOND in-article unit, deeper in the body (~⅔ through) on longer
   *  pieces (8+ paragraphs), kept well clear of IN_ARTICLE so two ads never crowd.
   *  Uses 2019769 — a FEED in-content widget, distinct so it fills alongside the rest. */
  IN_ARTICLE_2: "2019769",
  /** Optional THIRD in-article unit, ~85% through, only on VERY long pieces (12+
   *  paragraphs). Uses 2044290 — an In-content/Feed widget (renders inline native
   *  cards on mobile + desktop), distinct so it fills alongside the other slots. */
  IN_ARTICLE_3: "2044290",
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
  /** Homepage IN-FEED unit — a native card band injected INTO the "Latest
   *  Stories" grid (after the 6th card, and only when the feed is long enough to
   *  keep stories on both sides of it). Sits well below the top HOME unit so the
   *  two never crowd. Reuses 2019769 — the same FEED in-content widget as the
   *  article IN_ARTICLE_2 slot; that's fine because a widget fills only ONE slot
   *  PER PAGE and these live on DIFFERENT pages (/ vs /news/[slug]), exactly like
   *  HOME and IN_ARTICLE_TOP already share 2030046. Want this unit's earnings
   *  reported separately from IN_ARTICLE_2? Create a dedicated Feed widget in
   *  AdsKeeper and paste its id here. */
  HOME_FEED: "2019769",
  /** Site-wide IN-SITE NOTIFICATION (AdsKeeper widget 2044288) — a FLOATING
   *  overlay AdsKeeper positions itself per its dashboard settings (Position: TOP,
   *  Frequency: 30 min). NOT an in-content slot: it's rendered once site-wide via
   *  <AdOverlay> in the public layout, so it can appear on EVERY public page
   *  (home + every article). Only displays on a domain authorized in your AdsKeeper
   *  account (production); elsewhere AdsKeeper returns nothing. */
  NOTIFICATION: "2044288",
  /** Site-wide INTERSTITIAL / "promoted content" pop-up (AdsKeeper widget 2044291) —
   *  a self-triggering overlay shown after the reader's Nth click on internal links
   *  (per its dashboard settings: after 2 interactions, once / 60 min). Works on
   *  mobile + desktop (taps count as clicks). Rendered once site-wide via <AdOverlay>
   *  in the public layout. Only displays on an authorized domain (production). */
  INTERSTITIAL: "2044291",
  /** Site-wide STICKY FOOTER — a slim, dismissible bar pinned to the bottom of
   *  the viewport (home + every article), rendered once via <AdStickyFooter> in
   *  the public layout. Holds an AdsKeeper "IAB DISPLAY STANDARD AD UNIT" (a
   *  fixed-size banner — a small anchor size like 320×50 / 728×90 fits best). It
   *  reveals only once the ad fills, so there's never an empty bar, and a × lets
   *  the reader dismiss it. Fills only on a domain authorized in your AdsKeeper
   *  account (production); elsewhere AdsKeeper returns nothing and the bar stays
   *  hidden. */
  STICKY_FOOTER: "2044386",
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
