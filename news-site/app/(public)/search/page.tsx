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
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        Search
      </h1>

      <div className="mt-6 max-w-xl">
        <SearchForm defaultValue={q} autoFocus />
      </div>

      {q && (
        <p className="mt-8 text-sm text-fg-faint">
          {results.length} {results.length === 1 ? "result" : "results"} for
          &ldquo;{q}&rdquo;
        </p>
      )}

      {q && results.length === 0 && (
        <div className="mt-12 rounded-2xl border border-border bg-surface p-12 text-center">
          <p className="font-display text-xl font-semibold">No matches</p>
          <p className="mt-2 text-fg-muted">
            Try different keywords, or browse the latest stories.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8 grid gap-x-8 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((article) => (
            <ArticleCard key={article.id} article={article} />
          ))}
        </div>
      )}
    </main>
  );
}
