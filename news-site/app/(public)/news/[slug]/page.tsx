import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import {
  getApprovedComments,
  getArticleBySlug,
  getReadNext,
  incrementViews,
} from "@/lib/queries";
import { Markdown } from "@/components/Markdown";
import { ArticleCard } from "@/components/ArticleCard";
import { CommentForm } from "@/components/CommentForm";
import { Reveal } from "@/components/Reveal";
import { ShareButtons } from "@/components/ShareButtons";
import { ReadingProgress } from "@/components/ReadingProgress";
import { AdSlot } from "@/components/AdSlot";
import { AdSenseSlot } from "@/components/AdSenseSlot";
import { ADS } from "@/lib/ads";
import { adsenseEnabled } from "@/lib/adsense";
import { parseKeyPoints } from "@/lib/keyPoints";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";

type Props = { params: { slug: string } };

type ArticlePart = { type: "md"; content: string } | { type: "ad" } | { type: "adsense" };

// Homepage (with required UTM for Unsplash) for the cover credit line's source link.
const COVER_SOURCE_HOME: Record<string, string> = {
  Unsplash: "https://unsplash.com/?utm_source=the_daily_ledger&utm_medium=referral",
  Pexels: "https://www.pexels.com",
  Pixabay: "https://pixabay.com",
  "Wikimedia Commons": "https://commons.wikimedia.org",
};

/**
 * Split the article body so a single in-article ad can sit after the opening
 * (~4th paragraph) on long-enough pieces; short pieces (<4 paragraphs) get none.
 * The cut never lands inside a ``` code fence. The prominent top-of-page ad and
 * the end-of-article recommendation are rendered separately (above the headline
 * and after the body), not here.
 */
function buildArticleParts(content: string): ArticlePart[] {
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  const n = blocks.length;
  if (n === 0) return [{ type: "md", content }];

  const fenceCount = (s: string) => (s.match(/```/g) || []).length;
  // Move the cut forward until the leading slice has balanced code fences.
  const balancedCut = (idx: number): number => {
    let i = idx;
    while (i < n && fenceCount(blocks.slice(0, i).join("\n\n")) % 2 !== 0) i++;
    return i < n ? i : -1;
  };

  // One mid-article slot after the opening, only when the body is long enough.
  let cut = n >= 4 ? balancedCut(3) : -1;
  if (cut < 1 || cut >= n) cut = -1;
  if (cut === -1) return [{ type: "md", content }];

  return [
    { type: "md", content: blocks.slice(0, cut).join("\n\n") },
    { type: "ad" },
    // Reserved Google AdSense slot, after the ~3rd paragraph (renders nothing
    // unless AdSense slots are enabled — see lib/adsense.ts).
    { type: "adsense" },
    { type: "md", content: blocks.slice(cut).join("\n\n") },
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const article = await getArticleBySlug(params.slug);
  if (!article) return { title: "Article not found" };
  return {
    title: article.title,
    description: article.excerpt,
    alternates: { canonical: `/news/${article.slug}` },
    openGraph: {
      title: article.title,
      description: article.excerpt,
      type: "article",
      url: `/news/${article.slug}`,
      publishedTime: article.publishedAt?.toISOString(),
      modifiedTime: article.updatedAt.toISOString(),
      // og:image / twitter:image come from the branded opengraph-image.tsx card
      // (per-article headline + category) — do not set images here or it overrides it.
    },
  };
}

function readingMinutes(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default async function ArticlePage({ params }: Props) {
  const article = await getArticleBySlug(params.slug);
  if (!article) notFound();

  // Visitor country (Vercel's free geo header) + a coarse device class
  // (mobile/desktop/tablet) parsed from the User-Agent — privacy-respecting: only
  // aggregate per-country and per-device counts are stored, never the IP or the
  // raw UA string. Missing → Unknown country / Desktop.
  const h = headers();
  await incrementViews(
    article.id,
    h.get("x-vercel-ip-country"),
    userAgent({ headers: h }).device.type,
  );
  const [related, comments] = await Promise.all([
    getReadNext({
      categoryId: article.categoryId,
      excludeId: article.id,
    }),
    getApprovedComments(article.id),
  ]);

  const shareUrl = `${siteConfig.url}/news/${article.slug}`;

  // NewsArticle structured data (schema.org) — helps Google News/Search render
  // the story with headline, image, dates, author, and publisher logo. Server-
  // rendered so crawlers read it in the raw HTML without executing JS.
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt,
    ...(article.coverImage ? { image: [article.coverImage] } : {}),
    datePublished: (article.publishedAt ?? article.createdAt).toISOString(),
    dateModified: article.updatedAt.toISOString(),
    author: { "@type": "Organization", name: siteConfig.name, url: siteConfig.url },
    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      logo: { "@type": "ImageObject", url: `${siteConfig.url}/icons/icon-512` },
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": shareUrl },
  };

  // "Key Points" bullets (empty → box doesn't render) and whether the reserved
  // AdSense slots should render (resolved once, passed to each slot).
  const keyPoints = parseKeyPoints(article.keyPoints);
  const adsOn = await adsenseEnabled();

  const metaItems = (
    <>
      <span className="font-semibold">By {siteConfig.name}</span>
      <span aria-hidden>·</span>
      <time dateTime={article.publishedAt?.toISOString()}>
        {formatDate(article.publishedAt)}
      </time>
      <span aria-hidden>·</span>
      <span>{readingMinutes(article.content)} min read</span>
      <span aria-hidden>·</span>
      <span>{formatNumber(article.views + 1)} views</span>
    </>
  );

  const parts = buildArticleParts(article.content);

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReadingProgress />

      {/* Top-of-page ad — placed ABOVE the headline + cover (just under the site
          header) for maximum visibility, per the requested layout. It collapses
          cleanly if AdsKeeper returns no ad, so it never leaves an empty box. */}
      <div className="px-4 sm:px-6">
        <AdSlot name="IN_ARTICLE_TOP" widgetId={ADS.IN_ARTICLE_TOP} minHeight={300} />
      </div>

      {/* Immersive hero (headline over cover) */}
      {article.coverImage ? (
        <header className="relative isolate">
          <div className="relative h-[58vh] min-h-[380px] w-full sm:h-[66vh]">
            <Image
              src={article.coverImage}
              alt={article.title}
              fill
              priority
              sizes="100vw"
              style={{ viewTransitionName: "shared-article-image" }}
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
            {article.coverCredit && (
              <p className="absolute bottom-1.5 right-2 text-[10px] font-medium text-white/55">
                Photo:{" "}
                {article.coverCreditUrl ? (
                  <a href={article.coverCreditUrl} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">
                    {article.coverCredit}
                  </a>
                ) : (
                  article.coverCredit
                )}{" "}
                ·{" "}
                {(() => {
                  const src = article.coverImageSource ?? "Pexels"; // legacy covers were Pexels
                  const href = COVER_SOURCE_HOME[src];
                  return href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow" className="underline-offset-2 hover:underline">
                      {src}
                    </a>
                  ) : (
                    src
                  );
                })()}
              </p>
            )}
          </div>
          <div className="absolute inset-x-0 bottom-0">
            <div className="mx-auto max-w-5xl px-4 pb-8 sm:px-6 sm:pb-12 lg:px-8">
              {article.category && (
                <Link
                  href={`/category/${article.category.slug}`}
                  className="inline-block text-xs font-bold uppercase tracking-[0.18em] text-accent-bright motion-safe:animate-fade-up"
                >
                  {article.category.name}
                </Link>
              )}
              <h1 className="mt-3 max-w-4xl text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight text-white motion-safe:animate-fade-up [animation-delay:90ms] sm:text-5xl lg:text-6xl">
                {article.title}
              </h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-white/75 motion-safe:animate-fade-up [animation-delay:170ms]">
                {metaItems}
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="mx-auto max-w-3xl px-4 pt-12 sm:px-6 lg:pt-16">
          <div className="mx-auto max-w-prose">
            {article.category && (
              <Link
                href={`/category/${article.category.slug}`}
                className="text-xs font-bold uppercase tracking-[0.18em] text-accent-link"
              >
                {article.category.name}
              </Link>
            )}
            <h1 className="mt-3 text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
              {article.title}
            </h1>
            <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-faint">
              {metaItems}
            </div>
          </div>
        </header>
      )}

      {/* Reading column */}
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
        <div className="mx-auto max-w-prose">
          <p className="mb-9 border-l-[3px] border-accent pl-5 text-xl font-medium leading-relaxed text-fg-muted motion-safe:animate-fade-up sm:text-2xl">
            {article.excerpt}
          </p>

          {keyPoints.length > 0 && (
            <aside
              className="mb-9 rounded-xl border border-border bg-surface p-5 motion-safe:animate-fade-up sm:p-6"
              aria-label="Key points"
            >
              <h2 className="font-display text-xs font-bold uppercase tracking-[0.16em] text-accent-link">
                Key Points
              </h2>
              <ul className="mt-3 space-y-2.5">
                {keyPoints.map((point, i) => (
                  <li key={i} className="flex gap-3 text-pretty leading-snug text-fg-muted">
                    <span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-none rounded-full bg-accent" />
                    <span>{point}</span>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          <ShareButtons url={shareUrl} title={article.title} className="mb-8" />

          {/* Body with an optional single in-article ad after the opening (only
              on longer pieces; placeholder until you add an IN_ARTICLE widget id).
              The story always renders first; the ad lazy-loads and collapses
              cleanly when unfilled. */}
          {parts.map((p, i) =>
            p.type === "md" ? (
              <Markdown key={i} content={p.content} />
            ) : p.type === "ad" ? (
              <AdSlot key={i} name="IN_ARTICLE" widgetId={ADS.IN_ARTICLE} />
            ) : (
              <AdSenseSlot key={i} enabled={adsOn} slot="in-article" />
            ),
          )}

          {article.tags.length > 0 && (
            <div className="mt-12 flex flex-wrap gap-2">
              {article.tags.map((tag) => (
                <span
                  key={tag.id}
                  className="rounded-full bg-surface-2 px-3 py-1 text-xs font-medium text-fg-muted"
                >
                  #{tag.name}
                </span>
              ))}
            </div>
          )}

          <div className="mt-10 border-t border-border pt-6">
            <ShareButtons url={shareUrl} title={article.title} />
          </div>
        </div>

        {/* END-OF-ARTICLE recommendation — the AdsKeeper "Interesting for you"
            widget lives here, AFTER the story ends (never above it). */}
        <AdSlot name="RECOMMENDED" widgetId={ADS.RECOMMENDED} minHeight={300} />

        <section
          id="comments"
          aria-label="Comments"
          className="mx-auto mt-14 max-w-prose border-t border-border pt-10"
        >
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Comments <span className="text-fg-faint">({comments.length})</span>
          </h2>

          {comments.length === 0 ? (
            <p className="mt-4 text-fg-muted">
              No comments yet. Be the first to share your thoughts.
            </p>
          ) : (
            <ul className="mt-6 space-y-4">
              {comments.map((c) => (
                <li
                  key={c.id}
                  className="rounded-xl border border-border bg-surface p-5"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-semibold text-fg">{c.authorName}</span>
                    <time
                      dateTime={c.createdAt.toISOString()}
                      className="text-xs text-fg-faint"
                    >
                      {formatDate(c.createdAt)}
                    </time>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap leading-relaxed text-fg-muted">
                    {c.content}
                  </p>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-10">
            <h3 className="font-display text-lg font-semibold">Leave a comment</h3>
            <p className="mt-1 text-sm text-fg-faint">
              Comments are reviewed before they appear.
            </p>
            <CommentForm articleId={article.id} />
          </div>
        </section>

        {/* Reserved Google AdSense slot — end of article, above Related Stories. */}
        <AdSenseSlot enabled={adsOn} slot="article-end" minHeight={300} />

        {related.length > 0 && (
          <section className="mt-16 border-t border-border pt-10">
            <Reveal>
              <h2 className="mb-6 font-display text-2xl font-bold tracking-tight sm:text-3xl">
                Related Stories
              </h2>
            </Reveal>
            <div className="grid gap-x-5 gap-y-8 sm:grid-cols-3">
              {related.map((item, i) => (
                <Reveal key={item.id} delay={i * 60}>
                  <ArticleCard article={item} />
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
