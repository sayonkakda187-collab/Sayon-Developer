import type { Metadata } from "next";
import Image from "next/image";
import { Link } from "next-view-transitions";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import {
  getApprovedComments,
  getArticleBySlug,
  getRelatedArticles,
  incrementViews,
} from "@/lib/queries";
import { Markdown } from "@/components/Markdown";
import { ArticleCard } from "@/components/ArticleCard";
import { CommentForm } from "@/components/CommentForm";
import { Reveal } from "@/components/Reveal";
import { AdSlot } from "@/components/AdSlot";
import { ADS } from "@/lib/ads";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";

type Props = { params: { slug: string } };

/**
 * Split markdown into two halves at a paragraph boundary nearest the middle, so
 * the in-article ad sits between paragraphs (never mid-sentence). Returns null
 * for short articles (fewer than 4 blocks) to avoid crowding, and keeps fenced
 * code blocks intact by only cutting where the ``` fences are balanced.
 */
function splitForMidAd(content: string): [string, string] | null {
  const blocks = content.split(/\n{2,}/);
  if (blocks.length < 4) return null;

  const total = content.length;
  const fenceCount = (s: string) => (s.match(/```/g) || []).length;

  let acc = 0;
  let idx = 0;
  for (let i = 0; i < blocks.length; i++) {
    acc += blocks[i].length + 2; // +2 approximates the blank line we split on
    if (acc >= total / 2) {
      idx = i + 1;
      break;
    }
  }
  // Keep at least one block on each side of the ad.
  idx = Math.min(Math.max(idx, 1), blocks.length - 1);

  // If the cut would land inside a code fence, walk forward until balanced.
  while (idx < blocks.length && fenceCount(blocks.slice(0, idx).join("\n\n")) % 2 !== 0) {
    idx++;
  }
  if (idx >= blocks.length) return null;

  return [blocks.slice(0, idx).join("\n\n"), blocks.slice(idx).join("\n\n")];
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
      images: article.coverImage ? [{ url: article.coverImage }] : undefined,
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

  // Visitor country from Vercel's free geo header (privacy-respecting: only an
  // aggregate per-country count is stored, never the IP). Missing → "Unknown".
  await incrementViews(article.id, headers().get("x-vercel-ip-country"));
  const [related, comments] = await Promise.all([
    getRelatedArticles({
      categoryId: article.categoryId,
      excludeId: article.id,
    }),
    getApprovedComments(article.id),
  ]);

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

  const midSplit = splitForMidAd(article.content);

  return (
    <main>
      {/* TOP ad — first thing in view the moment the article opens. Centered
          and responsive: full width with edge padding on mobile, capped and
          centered on larger screens. AdsKeeper reserves min-height 300px for
          this widget (no layout shift). */}
      <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
        <AdSlot name="TOP" widgetId={ADS.TOP} minHeight={300} />
      </div>

      {/* Immersive hero */}
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
                · Pexels
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

          {midSplit ? (
            <>
              <Markdown content={midSplit[0]} />
              {/* IN-ARTICLE ad — between paragraphs, near the middle. */}
              <AdSlot name="IN_ARTICLE" widgetId={ADS.IN_ARTICLE} />
              <Markdown content={midSplit[1]} />
            </>
          ) : (
            <Markdown content={article.content} />
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

        {/* SIDEBAR/RELATED ad — this layout is single-column (no sidebar), so
            the slot sits just above "Related Stories". */}
        <AdSlot name="SIDEBAR" widgetId={ADS.SIDEBAR} minHeight={320} />

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
