import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryArticles, getCategoryBySlug } from "@/lib/queries";
import { ArticleCard } from "@/components/ArticleCard";
import { Pagination } from "@/components/Pagination";

type Props = {
  params: { slug: string };
  searchParams: { page?: string };
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.name,
    description: category.description ?? `Latest ${category.name} stories.`,
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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <header className="border-b border-border pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-accent">
          Category
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-4 max-w-2xl text-lg text-fg-muted">
            {category.description}
          </p>
        )}
        <p className="mt-4 text-sm text-fg-faint">
          {total} {total === 1 ? "article" : "articles"}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="mt-12 text-fg-muted">No articles in this category yet.</p>
      ) : (
        <div className="mt-10 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article, i) => (
            <ArticleCard key={article.id} article={article} priority={i < 3} />
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
