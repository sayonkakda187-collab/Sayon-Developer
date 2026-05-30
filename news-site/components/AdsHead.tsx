import Script from "next/script";
import { ADSKEEPER_SITE_ID, adsHeadEnabled } from "@/lib/ads";

/**
 * Loads the AdsKeeper preloader script once, site-wide. Mounted in the public
 * layout so it loads across the public site (and never in /admin), persisting
 * across client-side navigations. Renders nothing until ads are enabled with a
 * real SITE ID, so the live site stays clean while IDs are still placeholders.
 *
 * `afterInteractive` lets the page content paint first; the loader is async and
 * non-blocking. Individual ad containers are rendered by <AdSlot>.
 */
export function AdsHead() {
  if (!adsHeadEnabled()) return null;
  return (
    <Script
      id="adskeeper-loader"
      src={`https://jsc.adskeeper.com/site/${ADSKEEPER_SITE_ID}.js`}
      strategy="afterInteractive"
      async
    />
  );
}
