import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryArticles, getCategoryBySlug } from "@/lib/queries";
import { NewsCard } from "@/components/NewsCard";
import { Pagination } from "@/components/Pagination";
import { Reveal } from "@/components/Reveal";
import {
  absoluteUrl,
  defaultOgImageUrl,
  ogImageSize,
  siteConfig,
} from "@/lib/site";

type Props = {
  params: { slug: string };
  searchParams: { page?: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug);
  if (!category) return { title: "Category not found" };
  const title = category.name;
  const description = category.description ?? `Latest ${category.name} stories.`;
  const url = absoluteUrl(`/category/${category.slug}`);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      type: "website",
      url,
      siteName: siteConfig.name,
      images: [
        {
          url: defaultOgImageUrl,
          width: ogImageSize.width,
          height: ogImageSize.height,
          alt: siteConfig.name,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [defaultOgImageUrl],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) notFound();

  const page = Math.max(1, parseInt(searchParams.page ?? "1", 10) || 1);
  const { articles, total, pageCount } = await getCategoryArticles(
    category.id,
    page,
  );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-link">
          Category
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-2xl text-base text-fg-muted">
            {category.description}
          </p>
        )}
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-fg-faint">
          {total} {total === 1 ? "article" : "articles"}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="mt-10 text-fg-muted">No articles in this category yet.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, i) => (
            <Reveal key={article.id} delay={Math.min(i, 4) * 55}>
              <NewsCard article={article} priority={i < 3} />
            </Reveal>
          ))}
        </div>
      )}

      <Pagination
        basePath={`/category/${category.slug}`}
        page={page}
        pageCount={pageCount}
      />
    </main>
  );
}
