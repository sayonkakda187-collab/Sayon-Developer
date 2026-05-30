import Image from "next/image";
import { Link } from "next-view-transitions";
import type { ArticleWithCategory } from "@/lib/queries";
import { timeAgo } from "@/lib/site";

export function FeaturedHero({ article }: { article: ArticleWithCategory }) {
  return (
    <section className="group relative overflow-hidden rounded-lg bg-black">
      <div className="relative aspect-[4/3] w-full sm:aspect-[16/9] lg:aspect-[2.4/1]">
        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            fill
            priority
            sizes="(max-width: 1280px) 100vw, 1280px"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10 lg:p-12">
        <div className="max-w-3xl">
          {article.category && (
            <Link
              href={`/category/${article.category.slug}`}
              className="inline-block text-xs font-bold uppercase tracking-[0.18em] text-accent-bright motion-safe:animate-fade-up"
            >
              {article.category.name}
            </Link>
          )}
          <h1 className="mt-3 text-balance font-display text-3xl font-bold leading-[1.04] tracking-tight text-white motion-safe:animate-fade-up [animation-delay:90ms] sm:text-5xl lg:text-6xl">
            <Link
              href={`/news/${article.slug}`}
              className="transition-colors hover:text-white/90"
            >
              {article.title}
            </Link>
          </h1>
          <p className="mt-4 line-clamp-2 max-w-2xl text-base text-white/85 motion-safe:animate-fade-up [animation-delay:170ms] sm:text-lg">
            {article.excerpt}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-4 motion-safe:animate-fade-up [animation-delay:250ms]">
            <Link
              href={`/news/${article.slug}`}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-accent-fg transition hover:opacity-90"
            >
              Read full story
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <time
              dateTime={article.publishedAt?.toISOString()}
              className="text-sm font-medium text-white/60"
            >
              {timeAgo(article.publishedAt)}
            </time>
          </div>
        </div>
      </div>
    </section>
  );
}
