import Image from "next/image";
import Link from "next/link";
import type { ArticleWithCategory } from "@/lib/queries";
import { formatDate } from "@/lib/site";

export function FeaturedHero({ article }: { article: ArticleWithCategory }) {
  return (
    <section className="grid gap-6 md:grid-cols-2 md:items-center">
      <Link
        href={`/news/${article.slug}`}
        className="block overflow-hidden rounded-xl bg-gray-100"
        aria-label={article.title}
      >
        {article.coverImage && (
          <Image
            src={article.coverImage}
            alt={article.title}
            width={1200}
            height={750}
            priority
            className="aspect-[16/10] w-full object-cover"
          />
        )}
      </Link>

      <div>
        {article.category && (
          <Link
            href={`/category/${article.category.slug}`}
            className="text-sm font-semibold uppercase tracking-wider text-red-700 hover:underline"
          >
            {article.category.name}
          </Link>
        )}
        <h1 className="mt-2 font-serif text-3xl font-extrabold leading-tight sm:text-4xl">
          <Link href={`/news/${article.slug}`} className="hover:underline">
            {article.title}
          </Link>
        </h1>
        <p className="mt-3 text-lg text-gray-600">{article.excerpt}</p>
        <time
          dateTime={article.publishedAt?.toISOString()}
          className="mt-4 block text-sm text-gray-400"
        >
          {formatDate(article.publishedAt)}
        </time>
      </div>
    </section>
  );
}
