import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCategoryArticlesRange, getCategoryBySlug, toCardArticle } from "@/lib/queries";
import { CategoryFeed } from "@/components/CategoryFeed";

type Props = { params: { slug: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const category = await getCategoryBySlug(params.slug);
  if (!category) return { title: "Category not found" };
  return {
    title: category.name,
    description: category.description ?? `Latest ${category.name} stories.`,
  };
}

export default async function CategoryPage({ params }: Props) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) notFound();

  // First 12 are server-rendered (SEO); the rest load on demand via "Load more".
  const { articles, total } = await getCategoryArticlesRange(category.id, 0, 12);
  const initial = articles.map(toCardArticle);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="border-b border-border pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent-link">Category</p>
        <h1 className="mt-2 font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
          {category.name}
        </h1>
        {category.description && (
          <p className="mt-3 max-w-2xl text-base text-fg-muted">{category.description}</p>
        )}
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-fg-faint">
          {total} {total === 1 ? "article" : "articles"}
        </p>
      </header>

      {initial.length === 0 ? (
        <p className="mt-10 text-fg-muted">No articles in this category yet.</p>
      ) : (
        <CategoryFeed categoryId={category.id} initial={initial} total={total} />
      )}
    </main>
  );
}
