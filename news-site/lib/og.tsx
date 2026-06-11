import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { siteConfig } from "@/lib/site";

// Shared branded share-card (next/og) used by every opengraph-image route. Navy
// background + gold accent + Playfair masthead, headline auto-sized to fit.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

const NAVY = "#1b3a5f";
const GOLD = "#b8893b";
const LIGHT = "#aec6e2";
const INK = "#f4f1ea";

// The vendored Playfair woff is read from a plain filesystem path (passing a URL
// object to fs.readFile breaks in the bundled route — the polyfilled URL isn't
// recognized). `next.config.mjs` outputFileTracingIncludes ships it on Vercel.
let fontPromise: Promise<Buffer> | null = null;
export function loadPlayfair(): Promise<Buffer> {
  if (!fontPromise) fontPromise = readFile(join(process.cwd(), "lib", "og-playfair-700.woff"));
  return fontPromise;
}

/** Headline size that keeps long titles inside the card. */
function titleSize(len: number): number {
  if (len <= 34) return 72;
  if (len <= 58) return 60;
  if (len <= 88) return 50;
  if (len <= 124) return 42;
  return 36;
}

/** The card element. `kicker` = category (or a tagline); `title` = headline. */
export function OgCard({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: NAVY,
        padding: "66px 76px",
        fontFamily: "Playfair Display",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", fontSize: 36, color: LIGHT, letterSpacing: 1 }}>The Daily Ledger</div>
        <div style={{ display: "flex", width: 132, height: 5, background: GOLD, marginTop: 18 }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column" }}>
        {kicker ? (
          <div style={{ display: "flex", fontSize: 26, color: GOLD, textTransform: "uppercase", letterSpacing: 4, marginBottom: 20 }}>
            {kicker}
          </div>
        ) : null}
        <div style={{ display: "flex", fontSize: titleSize(title.length), color: INK, lineHeight: 1.1 }}>{title}</div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", fontSize: 24, color: LIGHT, opacity: 0.85 }}>
          {siteConfig.url.replace(/^https?:\/\//, "")}
        </div>
        <div style={{ display: "flex", width: 230, height: 4, background: GOLD, opacity: 0.7 }} />
      </div>
    </div>
  );
}
