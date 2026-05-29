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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="border-b border-gray-200 pb-6">
        <p className="text-sm font-semibold uppercase tracking-wider text-red-700">
          Category
        </p>
        <h1 className="mt-1 font-serif text-3xl font-extrabold sm:text-4xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-2 max-w-2xl text-gray-600">{category.description}</p>
        )}
        <p className="mt-2 text-sm text-gray-400">
          {total} {total === 1 ? "article" : "articles"}
        </p>
      </header>

      {articles.length === 0 ? (
        <p className="mt-10 text-gray-600">No articles in this category yet.</p>
      ) : (
        <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.id} article={article} />
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
