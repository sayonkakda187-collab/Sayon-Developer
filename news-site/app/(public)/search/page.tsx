import type { Metadata } from "next";
import { searchArticles } from "@/lib/queries";
import { ArticleCard } from "@/components/ArticleCard";
import { SearchForm } from "@/components/SearchForm";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

type Props = { searchParams: { q?: string } };

export default async function SearchPage({ searchParams }: Props) {
  const q = (searchParams.q ?? "").trim();
  const results = q ? await searchArticles(q) : [];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <h1 className="font-serif text-3xl font-extrabold">Search</h1>

      <div className="mt-4 max-w-xl">
        <SearchForm defaultValue={q} autoFocus />
      </div>

      {q && (
        <p className="mt-6 text-sm text-gray-500">
          {results.length} {results.length === 1 ? "result" : "results"} for
          &ldquo;{q}&rdquo;
        </p>
      )}

      {q && results.length === 0 && (
        <p className="mt-6 text-gray-600">No articles matched your search.</p>
      )}

      {results.length > 0 && (
        <div className="mt-6 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </main>
  );
}
