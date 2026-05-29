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
import { formatDate, formatNumber } from "@/lib/site";

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
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <article>
        {article.category && (
          <Link
            href={`/category/${article.category.slug}`}
            className="text-sm font-semibold uppercase tracking-wider text-red-700 hover:underline"
          >
            {article.category.name}
          </Link>
        )}
        <h1 className="mt-2 font-serif text-3xl font-extrabold leading-tight sm:text-4xl">
          {article.title}
        </h1>
        <p className="mt-4 text-lg text-gray-600">{article.excerpt}</p>
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
          <time dateTime={article.publishedAt?.toISOString()}>
            {formatDate(article.publishedAt)}
          </time>
          <span aria-hidden>·</span>
          <span>{formatNumber(article.views + 1)} views</span>
        </div>

        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            width={1200}
            height={675}
            priority
            className="mt-6 aspect-[16/9] w-full rounded-xl object-cover"
          />
        )}

        <Markdown content={article.content} />

        {article.tags.length > 0 && (
          <div className="mt-10 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600"
              >
                #{tag.name}
              </span>
            ))}
          </div>
        )}
      </article>

      <section
        id="comments"
        aria-label="Comments"
        className="mt-12 border-t border-gray-200 pt-8"
      >
        <h2 className="font-serif text-2xl font-bold">
          Comments{" "}
          <span className="text-gray-400">({comments.length})</span>
        </h2>

        {comments.length === 0 ? (
          <p className="mt-3 text-gray-500">
            No comments yet. Be the first to share your thoughts.
          </p>
        ) : (
          <ul className="mt-6 space-y-6">
            {comments.map((c) => (
              <li key={c.id} className="border-b border-gray-100 pb-6 last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-semibold text-gray-900">
                    {c.authorName}
                  </span>
                  <time
                    dateTime={c.createdAt.toISOString()}
                    className="text-xs text-gray-400"
                  >
                    {formatDate(c.createdAt)}
                  </time>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-gray-700">
                  {c.content}
                </p>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-8">
          <h3 className="font-serif text-lg font-bold">Leave a comment</h3>
          <p className="mt-1 text-sm text-gray-500">
            Comments are reviewed before they appear.
          </p>
          <CommentForm articleId={article.id} />
        </div>
      </section>

      {related.length > 0 && (
        <section className="mt-12 border-t border-gray-200 pt-8">
          <h2 className="mb-6 font-serif text-2xl font-bold">Related stories</h2>
          <div className="grid gap-8 sm:grid-cols-3">
            {related.map((item) => (
              <ArticleCard key={item.id} article={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
