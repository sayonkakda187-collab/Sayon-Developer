"use client";

import { useMemo, useState } from "react";
import { Link } from "next-view-transitions";
import type { ArticleWithCategory } from "@/lib/queries";
import { NewsCard } from "./NewsCard";
import { SearchForm } from "./SearchForm";

type TabCategory = { id: string; name: string; slug: string };

// The trending-style homepage feed: a prominent search box, a row of category
// tab pills that filter the cards in place (with a "See all" link to the full
// category page), and a responsive 3/2/1 card grid. All client-side over an
// already-fetched pool — no extra requests when switching tabs.
export function HomeFeed({
  articles,
  categories,
}: {
  articles: ArticleWithCategory[];
  categories: TabCategory[];
}) {
  const [active, setActive] = useState<string>("all"); // "all" | category id

  const activeCat = categories.find((c) => c.id === active);

  const shown = useMemo(() => {
    if (active === "all") return articles;
    return articles.filter((a) => a.categoryId === active);
  }, [articles, active]);

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
      {/* Header row: section title + search. */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {active === "all" ? "Latest stories" : activeCat?.name}
          </h2>
          <p className="mt-1.5 text-sm text-fg-muted">
            {active === "all"
              ? "Fresh reporting across every desk — filter by topic below."
              : `The latest in ${activeCat?.name}.`}
          </p>
        </div>
        <div className="w-full sm:w-72">
          <SearchForm />
        </div>
      </div>

      {/* Category tab pills. */}
      {categories.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter by category">
          <Pill active={active === "all"} onClick={() => setActive("all")}>
            Top
          </Pill>
          {categories.map((c) => (
            <Pill key={c.id} active={active === c.id} onClick={() => setActive(c.id)}>
              {c.name}
            </Pill>
          ))}
          {activeCat && (
            <Link
              href={`/category/${activeCat.slug}`}
              className="ml-auto hidden text-xs font-bold uppercase tracking-wide text-accent-link transition-colors hover:text-accent sm:inline-flex sm:items-center sm:gap-1"
            >
              See all {activeCat.name} →
            </Link>
          )}
        </div>
      )}

      {/* Card grid: 1 / 2 / 3 columns. */}
      {shown.length === 0 ? (
        <div className="mt-10 rounded-xl border border-border bg-surface p-12 text-center">
          <p className="text-fg-muted">No stories in this category yet.</p>
        </div>
      ) : (
        <div className="mt-7 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((article, i) => (
            <NewsCard key={article.id} article={article} priority={i < 3} />
          ))}
        </div>
      )}
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-transparent bg-accent text-accent-fg"
          : "border-border bg-surface text-fg-muted hover:border-fg-faint/50 hover:text-fg"
      }`}
    >
      {children}
    </button>
  );
}
