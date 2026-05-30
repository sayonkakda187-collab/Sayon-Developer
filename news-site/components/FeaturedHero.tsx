import Image from "next/image";
import Link from "next/link";
import type { ArticleWithCategory } from "@/lib/queries";
import { formatDate } from "@/lib/site";

export function FeaturedHero({ article }: { article: ArticleWithCategory }) {
  return (
    <section className="group relative overflow-hidden rounded-2xl bg-surface-2">
      <Link href={`/news/${article.slug}`} className="block">
        <div className="relative aspect-[4/3] w-full sm:aspect-[16/9] lg:aspect-[2.1/1]">
          {article.coverImage && (
            <Image
              src={article.coverImage}
              alt={article.title}
              fill
              priority
              sizes="(max-width: 1152px) 100vw, 1152px"
              className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        </div>

        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-10">
          <div className="max-w-3xl">
            {article.category && (
              <span className="inline-block rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] text-accent-fg">
                {article.category.name}
              </span>
            )}
            <h1 className="mt-4 text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              {article.title}
            </h1>
            <p className="mt-4 line-clamp-2 max-w-2xl text-base text-white/80 sm:text-lg">
              {article.excerpt}
            </p>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-white">
              <time dateTime={article.publishedAt?.toISOString()} className="text-white/70">
                {formatDate(article.publishedAt)}
              </time>
              <span aria-hidden className="text-white/40">·</span>
              Read story
              <span aria-hidden className="transition-transform duration-300 group-hover:translate-x-1">
                →
              </span>
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
