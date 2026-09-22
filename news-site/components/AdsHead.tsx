import Script from "next/script";
import { headers } from "next/headers";
import { adsForHost, adsHeadEnabled } from "@/lib/ads";

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
  // Each domain is its own registered AdsKeeper site, so the loader id is
  // resolved from the request host — the wrong loader would serve nothing.
  const { siteId } = adsForHost(headers().get("host"));
  if (!adsHeadEnabled(siteId)) return null;
  return (
    <Script
      id="adskeeper-loader"
      src={`https://jsc.adskeeper.com/site/${siteId}.js`}
      strategy="afterInteractive"
      async
    />
  );
}
