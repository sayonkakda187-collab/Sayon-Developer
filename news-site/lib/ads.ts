/**
 * Google AdSense publisher id.
 *
 * All ad-network code was removed at the owner's request — AdsKeeper, Adsterra
 * and the reserved AdSense slots are gone, and no ad renders anywhere on the
 * site. This constant is NOT an ad: it backs the
 * `<meta name="google-adsense-account">` tag in the root layout, which is how
 * Google verifies who owns the domain, and it must match the `google.com,
 * pub-…, DIRECT` line in public/ads.txt.
 *
 * Kept deliberately so the AdSense application is not invalidated. Deleting it
 * would cost that verification and nothing else would improve.
 */
export const ADSENSE_PUBLISHER_ID = "ca-pub-5470257305108580";
