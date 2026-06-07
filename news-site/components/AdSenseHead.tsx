import Script from "next/script";
import { ADSENSE_PUBLISHER_ID } from "@/lib/ads";

/**
 * Google AdSense ACCOUNT script — loads the AdSense library site-wide (NOT ad
 * units; those come after approval).
 *
 * NOTE: site VERIFICATION does NOT rely on this tag. `next/script` is loaded by
 * the Next.js runtime and isn't guaranteed to appear as a static <script> in the
 * RAW server HTML <head> that Google's (no-JS) crawler reads — so verification is
 * handled by the server-rendered `<meta name="google-adsense-account">` tag in
 * app/layout.tsx (`metadata.other`). This script just loads the AdSense library
 * early so ad units work once they're added post-approval.
 *
 * Async + non-blocking, and independent of AdsKeeper (AdSense allows other
 * networks, so both coexist).
 */
export function AdSenseHead() {
  return (
    // The lint rule's message points to `pages/_document.js`; in the App Router
    // the documented home for a beforeInteractive script IS the root layout
    // (where this is mounted), so the warning is a false positive here.
    // eslint-disable-next-line @next/next/no-before-interactive-script-outside-document
    <Script
      id="google-adsense-account"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_PUBLISHER_ID}`}
      strategy="beforeInteractive"
      crossOrigin="anonymous"
      async
    />
  );
}
