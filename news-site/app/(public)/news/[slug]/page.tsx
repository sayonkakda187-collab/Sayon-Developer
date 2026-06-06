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

type ArticlePart = { type: "md"; content: string } | { type: "ad"; slot: "top" | "mid" };

/**
 * Split the article body into segments interleaved with in-article ads, keeping
 * the reader-first layout (headline + cover + opening render first — never an ad
 * above the story):
 *   • an EARLY slot right AFTER the first paragraph (so an ad is visible as the
 *     reader starts), and
 *   • the existing slot after the opening (~4th paragraph).
 * Both ads appear only on longer pieces (≥6 paragraphs) and stay ≥3 paragraphs
 * apart so they never stack; medium pieces (4–5) keep just the later slot;
 * short pieces (<4) get neither. Cuts never land inside a ``` code fence.
 */
function buildArticleParts(content: string): ArticlePart[] {
  const blocks = content.split(/\n{2,}/).filter((b) => b.trim().length > 0);
  const n = blocks.length;
  if (n === 0) return [{ type: "md", content }];

  const fenceCount = (s: string) => (s.match(/```/g) || []).length;
  // Move a cut forward until the leading slice has balanced code fences; -1 = none.
  const balancedCut = (idx: number): number => {
    let i = idx;
    while (i < n && fenceCount(blocks.slice(0, i).join("\n\n")) % 2 !== 0) i++;
    return i < n ? i : -1;
  };

  let topCut = -1;
  let midCut = -1;
  if (n >= 6) {
    topCut = balancedCut(1); // after the first paragraph
    midCut = balancedCut(4); // after the opening, ≥3 paragraphs later
  } else if (n >= 4) {
    midCut = balancedCut(3); // existing behaviour for medium articles
  }

  // Keep cuts strictly inside the body; drop the early one if the two would crowd.
  if (topCut < 1 || topCut >= n) topCut = -1;
  if (midCut < 1 || midCut >= n) midCut = -1;
  if (topCut !== -1 && midCut !== -1 && midCut - topCut < 3) topCut = -1;

  const cuts = [
    ...(topCut !== -1 ? [{ at: topCut, slot: "top" as const }] : []),
    ...(midCut !== -1 ? [{ at: midCut, slot: "mid" as const }] : []),
  ].sort((a, b) => a.at - b.at);

  if (cuts.length === 0) return [{ type: "md", content }];

  const parts: ArticlePart[] = [];
  let prev = 0;
  for (const c of cuts) {
    parts.push({ type: "md", content: blocks.slice(prev, c.at).join("\n\n") });
    parts.push({ type: "ad", slot: c.slot });
    prev = c.at;
  }
  parts.push({ type: "md", content: blocks.slice(prev).join("\n\n") });
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

  const parts = buildArticleParts(article.content);

  return (
    <main>
      {/* Reader-first: the headline + cover + byline lead — no ad above the
          story. Ads flow in-article and at the end (see below). */}
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

          {/* Body interleaved with in-article ads. EARLY slot right after the
              first paragraph (visible as the reader starts), the existing slot
              after the opening — both kept apart so they never stack; short
              articles get fewer/none. The story always renders first; ads
              lazy-load and collapse cleanly when unfilled. */}
          {parts.map((p, i) =>
            p.type === "md" ? (
              <Markdown key={i} content={p.content} />
            ) : p.slot === "top" ? (
              <AdSlot key={i} name="IN_ARTICLE_TOP" widgetId={ADS.IN_ARTICLE_TOP} minHeight={180} />
            ) : (
              <AdSlot key={i} name="IN_ARTICLE" widgetId={ADS.IN_ARTICLE} />
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
