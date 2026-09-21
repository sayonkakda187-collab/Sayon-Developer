/**
 * One Adsterra `atOptions` + `invoke.js` unit, isolated in its own document.
 *
 * WHY THE IFRAME — this is the whole reason this component exists.
 * invoke.js renders with `document.write()`. During parsing that is fine;
 * called AFTER load — which is when any next/script strategy would run it —
 * `document.write()` opens a new document and WIPES THE PAGE. Its own `srcDoc`
 * document puts the write back inside an initial parse, where it is the
 * intended behaviour, and confines it to the iframe.
 *
 * It also fixes three things that would otherwise bite:
 *   - `atOptions` is a PAGE-LEVEL global in Adsterra's design, so two units on
 *     one page would overwrite each other's config. Each iframe has its own
 *     `window`, so each unit keeps its own — which is what makes more than one
 *     of these possible at all.
 *   - React never sees the ad's DOM, so no hydration mismatch is possible.
 *   - No client JavaScript ships for the ad itself.
 *
 * SANDBOX: `allow-top-navigation` is deliberately NOT granted, so a misbehaving
 * creative cannot redirect the reader away from the page. Clicks still open via
 * `allow-popups` + `allow-popups-to-escape-sandbox`.
 */
export type AdsterraIframeBannerProps = {
  /** The unit's key from the Adsterra dashboard. */
  adKey: string;
  width: number;
  height: number;
  /**
   * `lazy` for a unit further down the page; `eager` for one that is visible
   * immediately (a lazy sticky banner would just delay its own first paint).
   */
  loading?: "lazy" | "eager";
};

function adDocument(adKey: string, width: number, height: number) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;padding:0;overflow:hidden;background:transparent}</style>
</head>
<body>
<script>
  atOptions = {
    'key' : '${adKey}',
    'format' : 'iframe',
    'height' : ${height},
    'width' : ${width},
    'params' : {}
  };
<\/script>
<script src="https://www.highrevenueformat.com/${adKey}/invoke.js"><\/script>
</body>
</html>`;
}

export function AdsterraIframeBanner({
  adKey,
  width,
  height,
  loading = "lazy",
}: AdsterraIframeBannerProps) {
  return (
    <iframe
      title="Advertisement"
      srcDoc={adDocument(adKey, width, height)}
      width={width}
      height={height}
      loading={loading}
      scrolling="no"
      frameBorder={0}
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ display: "block", width, height, maxWidth: "100%", border: 0 }}
    />
  );
}
