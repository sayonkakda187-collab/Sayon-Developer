import Script from "next/script";

/**
 * Adsterra Popunder.
 *
 * Same shape as the Social Bar: one self-executing loader, no container to
 * place, so mounting it once is the whole integration. See
 * `AdsterraSocialBar.tsx` for the full reasoning behind `afterInteractive` — in
 * short, it is the App Router equivalent of "right before </body>", the parser
 * never waits on it, and it cannot delay first paint.
 *
 * It must run in the PAGE's own context, not in an iframe like the 300x250
 * banner: a popunder works by intercepting real clicks on the document, and a
 * sandboxed iframe sees none of them.
 *
 * Public pages only, never /admin. That matters more here than for the other
 * units: a popunder firing while the owner clicks around the editor would be
 * disruptive, and self-generated popunder traffic is exactly what ad networks
 * treat as invalid.
 */
const POPUNDER_SRC =
  "https://pl31425113.profitableratecpmnetwork.com/7d/cd/4f/7dcd4f37698db216942eaddc37aac84e.js";

export function AdsterraPopunder() {
  return (
    <Script
      id="adsterra-popunder"
      src={POPUNDER_SRC}
      strategy="afterInteractive"
      async
    />
  );
}
