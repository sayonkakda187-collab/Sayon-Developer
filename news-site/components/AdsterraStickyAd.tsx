import { AdsterraStickyBanner } from "./AdsterraStickyBanner";
import { AdsterraIframeBanner } from "./AdsterraIframeBanner";

/**
 * The sticky bottom ad: the dismissible shell plus the unit it carries.
 *
 * Mounted once from the public layout, so it persists across every public page
 * and survives client-side navigation without reloading the ad.
 *
 * Its own dedicated 320x50 unit — deliberately NOT the in-article 300x250's key.
 * Networks serve one impression per placement per page view, so sharing a key
 * would leave one of the two slots empty on every article and risk the duplicate
 * requests being counted as invalid traffic.
 *
 * 320x50 is also the right shape for a sticky bar: at 300x250 this bar took
 * ~38% of a phone viewport; at 50px tall the whole bar is ~86px including the
 * close-button strip and the safe-area inset.
 */
const STICKY_AD_KEY = "10f231c9c9d4bd9f6ce53142686d202f";
const STICKY_AD_WIDTH = 320;
const STICKY_AD_HEIGHT = 50;

export function AdsterraStickyAd() {
  return (
    <AdsterraStickyBanner>
      <AdsterraIframeBanner
        adKey={STICKY_AD_KEY}
        width={STICKY_AD_WIDTH}
        height={STICKY_AD_HEIGHT}
        // Visible the moment the page loads, so lazy-loading would only delay
        // its own first paint.
        loading="eager"
      />
    </AdsterraStickyBanner>
  );
}
