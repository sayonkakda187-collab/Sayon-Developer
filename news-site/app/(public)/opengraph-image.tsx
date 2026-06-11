import { ImageResponse } from "next/og";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard, loadPlayfair } from "@/lib/og";
import { siteConfig } from "@/lib/site";

// Default branded share card for the homepage, category pages, and any public
// page without its own (the per-article route overrides this for /news/[slug]).
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = siteConfig.name;

export default async function Image() {
  const font = await loadPlayfair();
  return new ImageResponse(<OgCard kicker="Independent News" title={siteConfig.description} />, {
    ...OG_SIZE,
    fonts: [{ name: "Playfair Display", data: font, weight: 700, style: "normal" }],
  });
}
