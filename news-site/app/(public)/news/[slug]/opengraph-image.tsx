import { ImageResponse } from "next/og";
import { getArticleBySlug } from "@/lib/queries";
import { OG_SIZE, OG_CONTENT_TYPE, OgCard, loadPlayfair } from "@/lib/og";

// Per-article branded 1200x630 share card. Node runtime (needs Prisma); Next +
// the CDN cache the generated image. Auto-updates when the article changes.
export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "The Daily Ledger";

export default async function Image({ params }: { params: { slug: string } }) {
  const article = await getArticleBySlug(params.slug);
  const title = article?.title ?? "The Daily Ledger";
  const kicker = article?.category?.name ?? "The Daily Ledger";
  const font = await loadPlayfair();

  return new ImageResponse(<OgCard kicker={kicker} title={title} />, {
    ...OG_SIZE,
    fonts: [{ name: "Playfair Display", data: font, weight: 700, style: "normal" }],
  });
}
