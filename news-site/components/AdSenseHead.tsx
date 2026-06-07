import Script from "next/script";
import { ADSENSE_PUBLISHER_ID } from "@/lib/ads";

/**
 * Google AdSense ACCOUNT script — site verification + review (NOT ad units).
 *
 * Mounted in the ROOT layout so it lands in the SERVER-RENDERED HTML <head> of
 * every page, which is what Google's site verifier/crawler looks for.
 * `strategy="beforeInteractive"` is the Next.js mechanism that injects a script
 * into the initial HTML <head> from the server (the App Router requires
 * beforeInteractive scripts to live in the root layout). The AdsKeeper loader, by
 * contrast, uses `afterInteractive` — injected client-side, where a verifier
 * might not see it — which is fine for AdsKeeper but not for verification.
 *
 * Async + non-blocking, and independent of AdsKeeper (AdSense allows other
 * networks, so both coexist). No `<ins class="adsbygoogle">` units are added yet
 * — those come after approval.
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
