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
import { isNonHumanView } from "@/lib/botDetect";
import { Markdown } from "@/components/Markdown";
import { ArticleCard } from "@/components/ArticleCard";
import { CommentForm } from "@/components/CommentForm";
import { Reveal } from "@/components/Reveal";
import { ShareButtons } from "@/components/ShareButtons";
import { ReadingProgress } from "@/components/ReadingProgress";
import { parseKeyPoints } from "@/lib/keyPoints";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";

// Homepage (with required UTM for Unsplash) for the cover credit line's source link.
const COVER_SOURCE_HOME: Record<string, string> = {
  Unsplash: "https://unsplash.com/?utm_source=the_daily_ledger&utm_medium=referral",
  Pexels: "https://www.pexels.com",
  Pixabay: "https://pixabay.com",
  "Wikimedia Commons": "https://commons.wikimedia.org",
};
type Props = { params: { slug: string } };

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
      // Prefer the article's REAL cover photo for the link/social preview, so a
      // shared link — including one pasted into a Facebook comment — shows the news
      // image. With NO cover, omit images and Next falls back to the branded
      // opengraph-image.tsx card (headline on the brand background).
      ...(article.coverImage ? { images: [{ url: article.coverImage }] } : {}),
    },
    // Same choice for X/Twitter link previews (large image when there's a cover).
    ...(article.coverImage
      ? {
          twitter: {
            card: "summary_large_image" as const,
            title: article.title,
            description: article.excerpt ?? undefined,
            images: [article.coverImage],
          },
        }
      : {}),
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
  //
  // Only count REAL human page views: skip bots, link scrapers (e.g. Facebook's
  // crawler), uptime monitors, and prefetches — so the Admin views / Audience /
  // Live-readers numbers reflect actual people (and line up with AdsKeeper).
  // (This does NOT affect the private-gallery Live Audience — that's separate.)
  const h = headers();
  if (!isNonHumanView(h)) {
    await incrementViews(
      article.id,
      h.get("x-vercel-ip-country"),
      userAgent({ headers: h }).device.type,
    );
  }
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

  // How many of the three in-body slots this domain can actually fill. One → the
  // single ad is centred in the story; several → the staggered ladder.

  return (
    <main>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ReadingProgress />


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

      {/* Reading column + the desktop sidebar rail. `justify-center` keeps the
          story centred on its own whenever the rail renders nothing (no live
          sidebar id, or a phone), so there is never an empty right column. */}
      <div className="mx-auto flex max-w-[1180px] justify-center gap-8 px-4 py-10 sm:px-6 lg:py-14">
        <div className="w-full min-w-0 max-w-3xl">
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

            {/* Ad directly below the Key Points box. Deliberately OUTSIDE the
                keyPoints check — an article with no key points still shows it here,
                in the same spot right after the standfirst. */}

            <ShareButtons url={shareUrl} title={article.title} className="mb-8" />

            <Markdown content={article.content} />

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

      </div>
    </main>
  );
}
