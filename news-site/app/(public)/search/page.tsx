import type { Metadata } from "next";
import { searchArticles } from "@/lib/queries";
import { ArticleCard } from "@/components/ArticleCard";
import { SearchForm } from "@/components/SearchForm";
import { Reveal } from "@/components/Reveal";

export const metadata: Metadata = {
  title: "Search",
  robots: { index: false },
};

type Props = { searchParams: { q?: string } };

export default async function SearchPage({ searchParams }: Props) {
  const q = (searchParams.q ?? "").trim();
  const results = q ? await searchArticles(q) : [];

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <h1 className="font-display text-4xl font-extrabold tracking-tight sm:text-5xl">
        Search
      </h1>

      <div className="mt-5 max-w-xl">
        <SearchForm defaultValue={q} autoFocus />
      </div>

      {q && (
        <p className="mt-6 text-xs font-medium uppercase tracking-wide text-fg-faint">
          {results.length} {results.length === 1 ? "result" : "results"} for
          &ldquo;{q}&rdquo;
        </p>
      )}

      {q && results.length === 0 && (
        <div className="mt-10 rounded-lg border border-border bg-surface p-12 text-center">
          <p className="font-display text-xl font-bold">No matches</p>
          <p className="mt-2 text-fg-muted">
            Try different keywords, or browse the latest stories.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-6 grid grid-cols-1 gap-x-5 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {results.map((article, i) => (
            <Reveal key={article.id} delay={Math.min(i, 4) * 55}>
              <ArticleCard article={article} />
            </Reveal>
          ))}
        </div>
      )}
    </main>
  );
}
