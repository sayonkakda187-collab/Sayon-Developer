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

// 1) SITE IDs — one per website REGISTERED in AdsKeeper.
//
//    Each registered site gets its own loader id AND its own widget ids; a
//    widget from one site does NOT serve on another. Both domains are attached
//    in Vercel (old Facebook posts still link to the legacy one), so the loader
//    and the widget set are chosen per REQUEST HOST — see adsForHost() below.
/** ledgerdailynews.com — current primary domain. */
export const SITE_ID_PRIMARY = "1108814";
/** dailyledger.today — previous domain, still serving old shared links. */
export const SITE_ID_LEGACY = "1097964";
/** Default when the host is unknown (previews, localhost). */
export const ADSKEEPER_SITE_ID = SITE_ID_PRIMARY;

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
export const ADS_LEGACY = {
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
  /** Below the "Key Points" box. Placeholder: every in-content widget on THIS
   *  site is already used elsewhere on the article page, and a widget fills only
   *  one slot per page — this needs its own id. */
  AFTER_KEY_POINTS: "REPLACE_WITH_AFTER_KEY_POINTS_ID",
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
  /** SECOND site-wide INTERSTITIAL (AdsKeeper widget 2047757) — a self-triggering
   *  full-screen pop-up, SAME format as INTERSTITIAL above. Rendered site-wide via
   *  <AdOverlay> in the public layout AND on the /g/<token> gallery pages. Each
   *  interstitial is frequency-capped in its dashboard settings, so the two never
   *  fire at once. Fills only on the authorized production domain. */
  INTERSTITIAL_2: "2047757",
  /** Site-wide STICKY FOOTER — a slim, dismissible bar pinned to the bottom of
   *  the viewport (home + every article), rendered once via <AdStickyFooter> in
   *  the public layout. Holds an AdsKeeper "IAB DISPLAY STANDARD AD UNIT" (a
   *  fixed-size banner — a small anchor size like 320×50 / 728×90 fits best). It
   *  reveals only once the ad fills, so there's never an empty bar, and a × lets
   *  the reader dismiss it. Fills only on a domain authorized in your AdsKeeper
   *  account (production); elsewhere AdsKeeper returns nothing and the bar stays
   *  hidden. */
  STICKY_FOOTER: "2044386",
  /** PRIVATE-GALLERY in-feed unit (AdsKeeper Feed widget 2047583) — a DEDICATED
   *  Feed widget for the secret /g/<token> gallery pages, woven into the image
   *  grid by <GalleryView>. Dedicated (not reused) so the galleries' ad earnings
   *  report on their own in AdsKeeper. Appears once per gallery page (a widget
   *  fills only one slot per page); fills only on the authorized domain. */
  GALLERY_FEED: "2047583",
  /** PRIVATE-GALLERY in-site NOTIFICATIONS (AdsKeeper widgets 2047612 + 2047642)
   *  — self-displaying floating "in-site notification" widgets, rendered as
   *  <AdOverlay> on the /g/<token> gallery pages ONLY (not site-wide). These are
   *  the SAME format as the site-wide NOTIFICATION (2044288), so a gallery page
   *  can run several notifications at once — AdsKeeper realistically shows one at
   *  a time (each is frequency-capped). NOT in-content Feed units — do NOT put
   *  them in an <AdSlot>. */
  GALLERY_NOTIFICATION_1: "2047612",
  GALLERY_NOTIFICATION_2: "2047642",
  /** SITE-WIDE in-content FEED unit (AdsKeeper Feed widget 2047761) — a native
   *  in-content card row rendered ONCE near the bottom of every public page
   *  (home / article / category / search) via <AdSlot> in the public layout, and
   *  on the /g/<token> gallery pages. A widget fills only one slot per page, and
   *  this id is used only here, so it fills independently on each page. Collapses
   *  cleanly if unfilled; only serves on the authorized production domain. */
  /** DESKTOP SIDEBAR rail beside the article body. Placeholder: every in-content
   *  widget on THIS site already appears elsewhere on the article page, and a
   *  widget fills only one slot per page — this needs its own id. */
  SIDEBAR_1: "REPLACE_WITH_SIDEBAR_1_ID",
  SITEWIDE_FEED: "2047761",
} as const;

/**
 * Widgets for ledgerdailynews.com (AdsKeeper site 1108814).
 *
 * AdsKeeper approved this domain as a SEPARATE website, so it starts with its
 * own widget inventory — the legacy ids above belong to dailyledger.today and
 * would never fill here. Only one widget exists so far, so every other slot is
 * a placeholder and collapses cleanly (no empty boxes).
 *
 * 2070887 is a FEED / in-content widget, mapped to SITEWIDE_FEED because that
 * is the single placement rendered on EVERY public page — home, article,
 * category, search and the galleries — so one widget covers the whole site.
 * To fill the remaining slots, create more widgets under site 1108814 and paste
 * their ids here (keep the formats matching: Feed/Header -> <AdSlot> slots,
 * In-site Notification / Interstitial -> the *NOTIFICATION* / *INTERSTITIAL*
 * keys, IAB display -> STICKY_FOOTER).
 */
export const ADS_PRIMARY = {
  /** AdsKeeper HEADER WIDGET (4 columns desktop / 2 mobile, "Interesting for
   *  you"). Its dashboard entry states it "should be placed above the page
   *  content", which on an article means above the headline and cover — so it
   *  goes here and nowhere else. Do NOT also map it to HOME: that slot sits
   *  below the hero, which is not a header position. */
  IN_ARTICLE_TOP: "2070978",
  /** In-body unit. Empty — awaiting an In-content / Feed widget. The only other
   *  id this site has (2071266) is an In-site Notification and belongs on
   *  NOTIFICATION, not here. */
  /** Placement 2 — mid-article, centred by text length (see buildArticleParts).
   *
   *  ⚠️ All three in-body slots share ONE id (2071423), which is deliberate.
   *  AdsKeeper's own install snippet says the container "can be added in multiple
   *  places on page <body> where you want your widgets to appear", so a single
   *  widget is meant to serve several positions. This replaces the previous
   *  patchwork of 2071391 / 2071409 / 2071266 in the article body — one widget,
   *  three positions, one earnings line to read.
   *
   *  If AdsKeeper turns out to fill only the first of the three, give the other
   *  two their own ids; the slots are unchanged either way. */
  IN_ARTICLE: "2071423",
  /** Placement 1 — below the title/meta block, before the first body paragraph. */
  AFTER_KEY_POINTS: "2071423",
  IN_ARTICLE_2: "REPLACE_WITH_IN_ARTICLE_2_ID",
  IN_ARTICLE_3: "REPLACE_WITH_IN_ARTICLE_3_ID",
  /** Placement 3 — end of the article content, before the comments. */
  RECOMMENDED: "2071423",
  /** HEADER WIDGET 2070978 on the HOMEPAGE — same id as IN_ARTICLE_TOP, which is
   *  fine and intended: a widget fills one slot per PAGE, and these are different
   *  pages. AdsKeeper types it "Header widget — a responsive single-row ad unit
   *  that should be placed ABOVE the page content", so it renders at the very top
   *  of the homepage, above the hero. */
  HOME: "2070978",
  HOME_FEED: "2071391",
  /** ⚠️ LEAVE EMPTY unless a widget genuinely positions ITSELF.
   *
   *  <AdOverlay> renders a bare container at the very END of the layout, after
   *  the footer. That is only correct for a format that then repositions itself
   *  (fixed/absolute). A widget that renders INLINE instead appears stranded
   *  below the footer — which is exactly what happened when 2071266 was assigned
   *  here: AdsKeeper types it "In-site notification", but it renders inline, so
   *  readers got a "Promoted content" block under the copyright line.
   *
   *  The dashboard TYPE is not sufficient evidence. Before putting an id here,
   *  confirm ON THE LIVE SITE that the widget floats rather than rendering in
   *  place. If it renders inline, it belongs in an in-content slot above. */
  NOTIFICATION: "REPLACE_WITH_NOTIFICATION_ID",
  /** INTERSTITIAL 2071426 — the full-screen unit that fires on internal link
   *  transitions. Mounted ONCE site-wide through <AdOverlay> in the public
   *  layout, so it arms on every public page; the widget decides when to show
   *  from its own dashboard settings.
   *
   *  ⚠️ <AdOverlay> renders a bare container at the END of the layout, after the
   *  footer. That is right for a format that builds its own overlay, which is
   *  what an interstitial does by definition. But if this one renders INLINE
   *  instead — as this account's notification widgets do — it will appear as a
   *  block below the copyright line rather than as a pop-up. Check that on the
   *  live site; if it lands inline, it belongs in an in-content slot instead. */
  INTERSTITIAL: "2071426",
  INTERSTITIAL_2: "REPLACE_WITH_INTERSTITIAL_2_ID",
  /** ALERT unit 2071425 — a floating bar pinned to the bottom of the viewport on
   *  every public page (homepage, articles, category, search), via
   *  <AdStickyFooter> in the public layout.
   *
   *  Deliberately NOT on NOTIFICATION. That slot mounts through <AdOverlay>,
   *  which puts a bare container in normal flow AFTER the footer — fine for a
   *  format that repositions itself, but this account's notification widgets
   *  render INLINE, which is what stranded an ad under the copyright line.
   *  <AdStickyFooter> is position:fixed, so an inline render still appears as a
   *  floating bar, reveals only once the ad fills, and can be dismissed. */
  STICKY_FOOTER: "2071425",
  GALLERY_FEED: "2071391",
  GALLERY_NOTIFICATION_1: "REPLACE_WITH_GALLERY_NOTIFICATION_1_ID",
  GALLERY_NOTIFICATION_2: "REPLACE_WITH_GALLERY_NOTIFICATION_2_ID",
  /** Approved Feed / in-content widget for ledgerdailynews.com. */
  /** SIDEBAR WIDGET 2071408 — a tall unit for a narrow column, so it renders in
   *  the desktop rail beside the article body (<AdRail>). DESKTOP ONLY: the rail
   *  never mounts below 1024px, so phones never receive the container and the
   *  impression is never served to a reader who cannot see it. */
  SIDEBAR_1: "2071408",
  /** FEED widget 2071410 — the site-wide unit above the footer, rendered once in
   *  (public)/layout.tsx so it appears on EVERY public page. It is the only ad
   *  that reaches /category and /search, which otherwise carry none.
   *
   *  Because it is on every page, its id must not be reused by any other slot.
   *  On an article it lands after the comments and related stories, so it is the
   *  lowest-viewability unit of the set — the value here is the listing pages. */
  SITEWIDE_FEED: "2071410",
} as const;

/** Back-compat alias + the source of the placement-name type. */
export const ADS = ADS_PRIMARY;

/**
 * Ordered widget ids for the AFTER-EACH-SECTION slots in the article body — one
 * ad below every "## " section of the story, in this order.
 *
 * ⚠️ THE LENGTH OF THIS LIST IS THE MAXIMUM NUMBER OF SECTION ADS AN ARTICLE CAN
 * SHOW. An AdsKeeper widget fills only ONE container per page, so repeating an id
 * to cover more sections does not produce more ads — the extra containers simply
 * stay empty and remove themselves. To put an ad under every section of a story
 * with N sections, this needs N DISTINCT In-content / Feed widget ids.
 *
 * Ids used elsewhere on the article page (IN_ARTICLE_TOP above the headline,
 * RECOMMENDED at the end) must NOT be repeated here, for the same reason. Only
 * in-content formats belong here — an In-site Notification or Interstitial
 * positions itself and will never fill an in-body container.
 */
export const SECTION_ADS_LEGACY: readonly string[] = [
  ADS_LEGACY.IN_ARTICLE, // 2019813
  ADS_LEGACY.IN_ARTICLE_2, // 2019769
  ADS_LEGACY.IN_ARTICLE_3, // 2044290
];

/** Section-ad ids for ledgerdailynews.com. Empty until Feed widgets exist under
 *  site 1108814 — one per section you want covered. */
export const SECTION_ADS_PRIMARY: readonly string[] = [];

export type AdSiteConfig = {
  siteId: string;
  ads: typeof ADS_PRIMARY;
  /** Ids for the after-each-section article slots, in order. */
  sectionAds: readonly string[];
};

/**
 * Pick the AdsKeeper site + widget set for a request host. Pure and
 * client-safe; server components pass `headers().get("host")`.
 *
 * An unknown host (Vercel preview, localhost) falls back to the primary site —
 * AdsKeeper serves nothing off an authorized domain anyway, so slots collapse.
 */
export function adsForHost(host?: string | null): AdSiteConfig {
  const h = (host || "").toLowerCase();
  if (h.includes("dailyledger.today")) {
    return {
      siteId: SITE_ID_LEGACY,
      ads: ADS_LEGACY as unknown as typeof ADS_PRIMARY,
      sectionAds: SECTION_ADS_LEGACY,
    };
  }
  return { siteId: SITE_ID_PRIMARY, ads: ADS_PRIMARY, sectionAds: SECTION_ADS_PRIMARY };
}

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
export function adsHeadEnabled(siteId: string = ADSKEEPER_SITE_ID): boolean {
  return ADS_ENABLED && !isPlaceholder(siteId);
}

/** Whether a specific placement should render a real ad. */
export function adSlotLive(widgetId: string): boolean {
  return ADS_ENABLED && !isPlaceholder(widgetId);
}
