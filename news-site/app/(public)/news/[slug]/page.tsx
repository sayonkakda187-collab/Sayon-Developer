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
import { AdSlot } from "@/components/AdSlot";
import { AdsterraNative } from "@/components/AdsterraNative";
import { AdSenseSlot } from "@/components/AdSenseSlot";
import { adsForHost, adSlotLive } from "@/lib/ads";
import { adsenseEnabled } from "@/lib/adsense";
import { parseKeyPoints } from "@/lib/keyPoints";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";

type Props = { params: { slug: string } };

type ArticlePart =
  | { type: "md"; content: string }
  | { type: "ad" }
  | { type: "ad2" }
  | { type: "ad3" }
  | { type: "adsense" }
  /** An after-a-section slot; `slot` indexes into the host's sectionAds list. */
  | { type: "section"; slot: number };

// Homepage (with required UTM for Unsplash) for the cover credit line's source link.
const COVER_SOURCE_HOME: Record<string, string> = {
  Unsplash: "https://unsplash.com/?utm_source=the_daily_ledger&utm_medium=referral",
  Pexels: "https://www.pexels.com",
  Pixabay: "https://pixabay.com",
  "Wikimedia Commons": "https://commons.wikimedia.org",
};

/**
 * One ad below every "## " section of the story.
 *
 * Sections are the H2 headings the articles are written with ("Trump Delays 50%
 * Tariffs", "Consumers Could Feel the Effects", …). A slot goes after each
 * section EXCEPT the last — an ad there would sit directly above the
 * end-of-article unit, stacking two ads back to back.
 *
 * ⚠️ Capped at `sectionAdCount`, the number of DISTINCT widget ids the host has
 * for these slots. An AdsKeeper widget fills only one container per page, so
 * emitting more containers than ids would just add empty ones. Sections beyond
 * the cap simply run on without an ad.
 *
 * Returns null when the piece has fewer than two headings — nothing to divide —
 * so the caller can fall back to paragraph-based placement.
 */
function buildSectionParts(blocks: string[], sectionAdCount: number): ArticlePart[] | null {
  // A heading block starts with "## " (H2). "###" and deeper stay inside a section.
  const isHeading = (b: string) => /^##\s+\S/.test(b.trim()) && !/^###/.test(b.trim());
  const headings = blocks.reduce<number[]>((acc, b, i) => (isHeading(b) ? [...acc, i] : acc), []);
  if (headings.length < 2) return null;

  // Section boundaries: intro (before the first heading, may be empty) then one
  // run per heading. Cuts land ON a heading, so each ad closes the section above.
  const bounds = headings[0] === 0 ? headings : [0, ...headings];
  const parts: ArticlePart[] = [];
  let used = 0;
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = i + 1 < bounds.length ? bounds[i + 1] : blocks.length;
    const body = blocks.slice(start, end).join("\n\n");
    if (body.trim()) parts.push({ type: "md", content: body });
    // No ad after the final section — it would collide with the end-of-article unit.
    const isLast = i === bounds.length - 1;
    if (!isLast && used < sectionAdCount) {
      parts.push({ type: "section", slot: used });
      // The reserved AdSense slot rides along with the first in-body ad, exactly
      // as it does in the paragraph-based layout.
      if (used === 0) parts.push({ type: "adsense" });
      used++;
    }
  }
  return used > 0 ? parts : null;
}

/**
 * Split the article body to inject in-article ads between paragraphs, scaled to
 * length so short reads stay clean and long reads carry more:
 *   • a first slot after the opening (~4th paragraph) on pieces with ≥4 paragraphs;
 *   • a second slot ~⅔ through, only on longer pieces (≥8 paragraphs);
 *   • a third slot ~85% through, only on VERY long pieces (≥12 paragraphs).
 * Each is kept ≥3 paragraphs clear of the previous one, so ads never crowd. Short
 * pieces (<4 paragraphs) get none. A cut never lands inside a ``` code fence. The
 * prominent top-of-page ad and the end-of-article recommendation are rendered
 * separately (above the headline and after the body), not here.
 */
function buildArticleParts(content: string, sectionAdCount = 0, inBodyAdCount = 3): ArticlePart[] {
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim().length > 0);

  // Preferred layout: one ad BELOW EACH "## " section of the story. Only used
  // when the piece actually has sections to divide (2+ headings) and there are
  // widget ids to fill the slots — otherwise fall through to the paragraph-based
  // placement below, so a heading-less article still carries its ads.
  if (sectionAdCount > 0) {
    const sectioned = buildSectionParts(blocks, sectionAdCount);
    if (sectioned) return sectioned;
  }

  const n = blocks.length;
  if (n === 0) return [{ type: "md", content }];

  // A slice of the body as one markdown part. The reserved Google AdSense slot
  // (renders nothing unless enabled — see lib/adsense.ts) rides with the first ad.
  const md = (a: number, b?: number): ArticlePart => ({ type: "md", content: blocks.slice(a, b).join("\n\n") });
  const fenceCount = (s: string) => (s.match(/```/g) || []).length;
  // Move the cut forward until the leading slice has balanced code fences.
  const balancedCut = (idx: number): number => {
    let i = idx;
    while (i < n && fenceCount(blocks.slice(0, i).join("\n\n")) % 2 !== 0) i++;
    return i < n ? i : -1;
  };

  // With only ONE in-body widget to fill, that single ad belongs in the MIDDLE of
  // the story rather than just after the opening — otherwise the whole lower half
  // runs without one. (The multi-slot ladder below is for sites with several ids:
  // its first cut sits early precisely because more ads follow it.)
  if (inBodyAdCount <= 1) {
    if (n < 4) return [{ type: "md", content }];
    const mid = balancedCut(Math.round(n / 2));
    if (mid < 1 || mid >= n) return [{ type: "md", content }];
    return [md(0, mid), { type: "ad" }, { type: "adsense" }, md(mid)];
  }

  // First mid-article slot after the opening, only when the body is long enough.
  let cut = n >= 4 ? balancedCut(3) : -1;
  if (cut < 1 || cut >= n) cut = -1;
  if (cut === -1) return [{ type: "md", content }];

  // Optional SECOND slot ~⅔ in — only on longer pieces, ≥3 blocks past the first
  // cut, and with ≥2 blocks of story still after it.
  let cut2 = -1;
  if (n >= 8) {
    const b = balancedCut(Math.max(cut + 3, Math.round(n * 0.66)));
    if (b > cut && b <= n - 2) cut2 = b;
  }
  // Optional THIRD slot deeper still (~85%) — only on VERY long pieces (≥12
  // paragraphs), ≥3 blocks past the second, so three ads never crowd.
  let cut3 = -1;
  if (cut2 !== -1 && n >= 12) {
    const b = balancedCut(Math.max(cut2 + 3, Math.round(n * 0.85)));
    if (b > cut2 && b <= n - 2) cut3 = b;
  }

  const parts: ArticlePart[] = [md(0, cut), { type: "ad" }, { type: "adsense" }];
  let prev = cut;
  if (cut2 !== -1) {
    parts.push(md(prev, cut2), { type: "ad2" });
    prev = cut2;
  }
  if (cut3 !== -1) {
    parts.push(md(prev, cut3), { type: "ad3" });
    prev = cut3;
  }
  parts.push(md(prev));
  return parts;
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
  const { ads, sectionAds } = adsForHost(h.get("host"));
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

  // How many of the three in-body slots this domain can actually fill. One → the
  // single ad is centred in the story; several → the staggered ladder.
  const inBodyAdCount = [ads.IN_ARTICLE, ads.IN_ARTICLE_2, ads.IN_ARTICLE_3].filter(adSlotLive).length;
  const parts = buildArticleParts(article.content, sectionAds.length, inBodyAdCount);

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
        <AdSlot widgetId={ads.IN_ARTICLE_TOP} minHeight={300} />
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

          {/* Ad directly below the Key Points box. Deliberately OUTSIDE the
              keyPoints check — an article with no key points still shows it here,
              in the same spot right after the standfirst. */}
          <AdSlot widgetId={ads.AFTER_KEY_POINTS} minHeight={250} className="mb-9" />

          <ShareButtons url={shareUrl} title={article.title} className="mb-8" />

          {/* Body with its in-article ads. Preferred layout is one unit below
              each "## " section; a piece with no sections falls back to the
              paragraph-based placement. Every unit lazy-loads and removes itself
              when the network returns nothing. */}
          {parts.map((p, i) =>
            p.type === "md" ? (
              <Markdown key={i} content={p.content} />
            ) : p.type === "section" ? (
              <AdSlot key={i} widgetId={sectionAds[p.slot]} />
            ) : p.type === "ad" ? (
              <AdSlot key={i} widgetId={ads.IN_ARTICLE} />
            ) : p.type === "ad2" ? (
              <AdSlot key={i} widgetId={ads.IN_ARTICLE_2} />
            ) : p.type === "ad3" ? (
              <AdSlot key={i} widgetId={ads.IN_ARTICLE_3} />
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
        <AdSlot widgetId={ads.RECOMMENDED} minHeight={300} />

        {/* Adsterra native row, also AFTER the story ends. Lazy-loaded and
            silent until configured in lib/adsterra.ts. */}
        <AdsterraNative />

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
