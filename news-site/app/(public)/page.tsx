import Link from "next/link";
import { getHomepage } from "@/lib/queries";
import { FeaturedHero } from "@/components/FeaturedHero";
import { ArticleCard } from "@/components/ArticleCard";

export default async function Home() {
  const { featured, latest, categories } = await getHomepage();

  if (!featured) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h1 className="font-serif text-3xl font-extrabold">No stories yet</h1>
        <p className="mt-3 text-gray-600">
          Published articles will appear here. Add some from the admin panel.
        </p>
      </main>
    );
  }

  const sections = categories.filter((c) => c.articles.length > 0);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <FeaturedHero article={featured} />

      {latest.length > 0 && (
        <section className="mt-16">
          <h2 className="mb-6 border-b border-gray-200 pb-2 font-serif text-2xl font-bold">
            Latest news
          </h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {latest.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {sections.map((category) => (
        <section key={category.id} className="mt-16">
          <div className="mb-6 flex items-baseline justify-between border-b border-gray-200 pb-2">
            <h2 className="font-serif text-2xl font-bold">{category.name}</h2>
            <Link
              href={`/category/${category.slug}`}
              className="text-sm font-medium text-red-700 hover:underline"
            >
              View all →
            </Link>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {category.articles.map((article) => (
              <ArticleCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
