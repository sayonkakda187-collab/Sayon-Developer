/**
 * Adsterra 300x250 display banner, in-article.
 *
 * WHY THIS IS IN AN IFRAME AND NOT A <Script>.
 * This is Adsterra's classic `atOptions` + `invoke.js` format, and invoke.js
 * renders the unit with `document.write()`. Called while the parser is running
 * that is fine; called AFTER load — which is exactly when next/script's
 * `afterInteractive` runs it — `document.write()` opens a new document and
 * WIPES THE PAGE. Dropping this script onto the page the way the Social Bar and
 * Native Banner are loaded would blank the article.
 *
 * Giving it its own document via `srcDoc` fixes that at the root: the write
 * happens during that iframe's initial parse, where it is the intended
 * behaviour, and it can only ever affect the iframe.
 *
 * Three more things fall out of the same decision:
 *   - `atOptions` is a PAGE-LEVEL global in Adsterra's design, so two banners on
 *     one page would overwrite each other's config. Each iframe has its own
 *     window, so each unit keeps its own.
 *   - React never sees the ad's DOM. No hydration mismatch is possible, because
 *     nothing inside the iframe is React's to reconcile.
 *   - This component ships ZERO client JavaScript — it is a server component
 *     rendering plain markup.
 *
 * LAYOUT. The unit is a fixed 300x250, so the exact height is reserved up front
 * and the slot cannot shift the page whether or not it fills. (This is the
 * opposite call from the Native Banner, which collapses when unfilled — there
 * the height is unknown, here it is not.)
 *
 * SANDBOX. `allow-top-navigation` is deliberately NOT granted, so a malicious
 * or misbehaving creative cannot redirect the reader away from the article.
 * Clicks still open normally via `allow-popups` +
 * `allow-popups-to-escape-sandbox`.
 */
const AD_KEY = "1ce7df5a6fe903c1855de1e1365ce08d";
const AD_WIDTH = 300;
const AD_HEIGHT = 250;
const AD_SRC = `https://www.highrevenueformat.com/${AD_KEY}/invoke.js`;

const AD_DOCUMENT = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>
</head>
<body>
<script>
  atOptions = {
    'key' : '${AD_KEY}',
    'format' : 'iframe',
    'height' : ${AD_HEIGHT},
    'width' : ${AD_WIDTH},
    'params' : {}
  };
<\/script>
<script src="${AD_SRC}"><\/script>
</body>
</html>`;

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
      <iframe
        title="Advertisement"
        srcDoc={AD_DOCUMENT}
        width={AD_WIDTH}
        height={AD_HEIGHT}
        loading="lazy"
        scrolling="no"
        frameBorder={0}
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        style={{
          display: "block",
          width: AD_WIDTH,
          height: AD_HEIGHT,
          maxWidth: "100%",
          border: 0,
        }}
      />
    </div>
  );
}
