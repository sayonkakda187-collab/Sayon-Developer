import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getApprovedComments,
  getArticleBySlug,
  getRelatedArticles,
  incrementViews,
} from "@/lib/queries";
import { Markdown } from "@/components/Markdown";
import { ArticleCard } from "@/components/ArticleCard";
import { CommentForm } from "@/components/CommentForm";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";

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

  await incrementViews(article.id);
  const [related, comments] = await Promise.all([
    getRelatedArticles({
      categoryId: article.categoryId,
      excludeId: article.id,
    }),
    getApprovedComments(article.id),
  ]);

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:py-16">
      <article>
        <header className="mx-auto max-w-prose">
          {article.category && (
            <Link
              href={`/category/${article.category.slug}`}
              className="text-xs font-semibold uppercase tracking-[0.15em] text-accent"
            >
              {article.category.name}
            </Link>
          )}
          <h1 className="mt-3 text-balance font-display text-4xl font-bold leading-[1.08] tracking-tight sm:text-5xl">
            {article.title}
          </h1>
          <p className="mt-5 text-pretty text-lg leading-relaxed text-fg-muted sm:text-xl">
            {article.excerpt}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-faint">
            <span className="font-medium text-fg">By {siteConfig.name}</span>
            <span aria-hidden>·</span>
            <time dateTime={article.publishedAt?.toISOString()}>
              {formatDate(article.publishedAt)}
            </time>
            <span aria-hidden>·</span>
            <span>{readingMinutes(article.content)} min read</span>
            <span aria-hidden>·</span>
            <span>{formatNumber(article.views + 1)} views</span>
          </div>
        </header>

        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            width={1200}
            height={675}
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="mt-8 aspect-[16/9] w-full rounded-2xl object-cover sm:mt-10"
          />
        )}

        <div className="mx-auto mt-2 max-w-prose">
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
        </div>
      </article>

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
          <div className="mb-8 flex items-center gap-3">
            <span className="h-7 w-1.5 rounded-full bg-accent" aria-hidden />
            <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Related stories
            </h2>
          </div>
          <div className="grid gap-x-8 gap-y-12 sm:grid-cols-3">
            {related.map((item) => (
              <ArticleCard key={item.id} article={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
