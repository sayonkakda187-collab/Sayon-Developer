import Image from "next/image";
import type { ArticleWithCategory } from "@/lib/queries";
import { timeAgo } from "@/lib/site";
import { MorphLink } from "./MorphLink";

// Clean card matching the admin "Trending News" layout: large cover on top,
// then category + time, headline, and a short excerpt. Rounded, bordered, with a
// subtle hover lift. Uses the public design tokens so it adapts to light/dark.
export function NewsCard({
  article,
  priority = false,
}: {
  article: ArticleWithCategory;
  priority?: boolean;
}) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-all duration-300 motion-safe:hover:-translate-y-1 hover:border-fg-faint/40 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40">
      <MorphLink
        href={`/news/${article.slug}`}
        aria-label={article.title}
        className="relative block aspect-[16/10] overflow-hidden bg-surface-2"
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
        {article.category && (
          <span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-accent-fg shadow-sm">
            {article.category.name}
          </span>
        )}
      </MorphLink>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-fg-faint">
          {article.category && (
            <>
              <span className="text-accent-link">{article.category.name}</span>
              <span aria-hidden>·</span>
            </>
          )}
          <time dateTime={article.publishedAt?.toISOString()}>{timeAgo(article.publishedAt)}</time>
        </div>

        <h3 className="mt-2 text-pretty font-display text-lg font-bold leading-snug tracking-tight">
          <MorphLink href={`/news/${article.slug}`} className="transition-colors group-hover:text-accent-link">
            {article.title}
          </MorphLink>
        </h3>

        {article.excerpt && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-fg-muted">{article.excerpt}</p>
        )}

        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-accent-link opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          Read story
          <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">→</span>
        </span>
      </div>
    </article>
  );
}
