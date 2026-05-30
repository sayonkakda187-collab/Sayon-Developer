import Image from "next/image";
import type { ArticleWithCategory } from "@/lib/queries";
import { timeAgo } from "@/lib/site";
import { MorphLink } from "./MorphLink";

export function ArticleCard({
  article,
  priority = false,
}: {
  article: ArticleWithCategory;
  priority?: boolean;
}) {
  return (
    <article className="group flex h-full flex-col motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:-translate-y-0.5">
      <MorphLink
        href={`/news/${article.slug}`}
        aria-label={article.title}
        className="relative block aspect-[16/10] overflow-hidden rounded-md bg-surface-2 transition-shadow duration-300 group-hover:shadow-lg group-hover:shadow-black/10 dark:group-hover:shadow-black/40"
      >
        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            priority={priority}
            className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
          />
        )}
        {article.category && (
          <span className="absolute left-2.5 top-2.5 rounded-sm bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-fg">
            {article.category.name}
          </span>
        )}
      </MorphLink>

      <div className="mt-2.5 flex flex-1 flex-col">
        <h3 className="font-display text-base font-bold leading-snug tracking-tight">
          <MorphLink
            href={`/news/${article.slug}`}
            className="transition-colors group-hover:text-accent-link"
          >
            {article.title}
          </MorphLink>
        </h3>
        <time
          dateTime={article.publishedAt?.toISOString()}
          className="mt-2 text-[11px] font-medium uppercase tracking-wide text-fg-faint"
        >
          {timeAgo(article.publishedAt)}
        </time>
      </div>
    </article>
  );
}
