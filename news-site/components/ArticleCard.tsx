import Image from "next/image";
import Link from "next/link";
import type { ArticleWithCategory } from "@/lib/queries";
import { formatDate } from "@/lib/site";

export function ArticleCard({
  article,
  priority = false,
}: {
  article: ArticleWithCategory;
  priority?: boolean;
}) {
  return (
    <article className="group flex h-full flex-col motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-1">
      <Link
        href={`/news/${article.slug}`}
        className="relative block aspect-[16/10] overflow-hidden rounded-xl bg-surface-2 transition-shadow duration-300 group-hover:shadow-xl group-hover:shadow-black/5 dark:group-hover:shadow-black/40"
      >
        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            priority={priority}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        )}
      </Link>

      <div className="mt-4 flex flex-1 flex-col">
        {article.category && (
          <Link
            href={`/category/${article.category.slug}`}
            className="text-xs font-semibold uppercase tracking-[0.15em] text-accent"
          >
            {article.category.name}
          </Link>
        )}
        <h3 className="mt-2 font-display text-xl font-semibold leading-snug tracking-tight">
          <Link
            href={`/news/${article.slug}`}
            className="transition-colors group-hover:text-accent-link"
          >
            {article.title}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-fg-muted">
          {article.excerpt}
        </p>
        <time
          dateTime={article.publishedAt?.toISOString()}
          className="mt-3 text-xs text-fg-faint"
        >
          {formatDate(article.publishedAt)}
        </time>
      </div>
    </article>
  );
}
