import Image from "next/image";
import Link from "next/link";
import type { ArticleWithCategory } from "@/lib/queries";
import { formatDate } from "@/lib/site";

export function ArticleCard({ article }: { article: ArticleWithCategory }) {
  return (
    <article className="group flex flex-col">
      <Link
        href={`/news/${article.slug}`}
        className="block overflow-hidden rounded-lg bg-gray-100"
        aria-label={article.title}
      >
        {article.coverImage ? (
          <Image
            src={article.coverImage}
            alt={article.title}
            width={1200}
            height={675}
            className="aspect-[16/9] w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="aspect-[16/9] w-full bg-gray-100" />
        )}
      </Link>

      <div className="mt-3 flex flex-1 flex-col">
        {article.category && (
          <Link
            href={`/category/${article.category.slug}`}
            className="text-xs font-semibold uppercase tracking-wider text-red-700 hover:underline"
          >
            {article.category.name}
          </Link>
        )}
        <h3 className="mt-1 font-serif text-lg font-bold leading-snug">
          <Link href={`/news/${article.slug}`} className="hover:underline">
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm text-gray-600">
          {article.excerpt}
        </p>
        <time
          dateTime={article.publishedAt?.toISOString()}
          className="mt-2 text-xs text-gray-400"
        >
          {formatDate(article.publishedAt)}
        </time>
      </div>
    </article>
  );
}
