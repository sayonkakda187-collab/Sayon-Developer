import { AdsterraIframeBanner } from "./AdsterraIframeBanner";

/**
 * Adsterra 300x250 display banner, placed inside the article body after the
 * 2nd paragraph (see `lib/articleSplit.ts`).
 *
 * The iframe isolation — and why it is not optional for this ad format — lives
 * in `AdsterraIframeBanner`.
 *
 * LAYOUT: the unit is a fixed 300x250, so the exact height is reserved up front
 * and the slot cannot shift the page whether or not it fills. (This is the
 * opposite call from the Native Banner, which collapses when unfilled — there
 * the height is unknown, here it is not.)
 */
const AD_KEY = "1ce7df5a6fe903c1855de1e1365ce08d";
const AD_WIDTH = 300;
const AD_HEIGHT = 250;

export function AdsterraBanner300x250() {
  return (
    <div
      data-ad="banner-300x250"
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: AD_HEIGHT,
        margin: "20px auto",
        maxWidth: "100%",
        // A 300px unit is narrower than the column, but clip anyway so a
        // creative that ignores its declared size cannot widen the page.
        overflow: "hidden",
      }}
    >
      <AdsterraIframeBanner adKey={AD_KEY} width={AD_WIDTH} height={AD_HEIGHT} />
    </div>
  );
}
