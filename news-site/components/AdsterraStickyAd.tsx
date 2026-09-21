import { AdsterraStickyBanner } from "./AdsterraStickyBanner";
import { AdsterraIframeBanner } from "./AdsterraIframeBanner";

/**
 * The sticky bottom ad: the dismissible shell plus the unit it carries.
 *
 * Mounted once from the public layout, so it persists across every public page
 * and survives client-side navigation without reloading the ad.
 *
 * ⚠️ THIS KEY IS THE SAME UNIT AS THE IN-ARTICLE 300x250.
 * On an article page both slots therefore request the same Adsterra placement.
 * Networks serve one impression per placement per page view, so the second one
 * will usually come back empty — and duplicate requests for one placement are
 * the kind of thing that gets counted as invalid traffic. Create a SECOND
 * 300x250 unit in the Adsterra dashboard and paste its key here; that one edit
 * is the entire fix. Left as supplied so nothing silently differs from what was
 * asked for.
 */
const STICKY_AD_KEY = "1ce7df5a6fe903c1855de1e1365ce08d";
const STICKY_AD_WIDTH = 300;
const STICKY_AD_HEIGHT = 250;

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
