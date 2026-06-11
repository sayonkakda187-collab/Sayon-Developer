import { prisma } from "@/lib/db";
import { siteConfig } from "@/lib/site";

// Google News sitemap: ONLY articles published in the last 48 hours (max 1000),
// in the official news-sitemap format. Auto-updates as articles publish.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const base = siteConfig.url.replace(/\/$/, "");
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);

  const articles = await prisma.article.findMany({
    where: { status: "published", publishedAt: { gte: since } },
    orderBy: { publishedAt: "desc" },
    take: 1000,
    select: { slug: true, title: true, publishedAt: true },
  });

  const entries = articles
    .map(
      (a) => `  <url>
    <loc>${xmlEscape(`${base}/news/${a.slug}`)}</loc>
    <news:news>
      <news:publication>
        <news:name>The Daily Ledger</news:name>
        <news:language>en</news:language>
      </news:publication>
      <news:publication_date>${(a.publishedAt ?? new Date()).toISOString()}</news:publication_date>
      <news:title>${xmlEscape(a.title)}</news:title>
    </news:news>
  </url>`,
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">
${entries}
</urlset>`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Short cache so freshly-published stories appear quickly.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
