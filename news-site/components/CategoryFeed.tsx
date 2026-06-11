"use client";

import { useState } from "react";
import { NewsCard } from "./NewsCard";
import { Reveal } from "./Reveal";
import { loadMoreCategory } from "@/app/(public)/category/actions";
import type { CardArticle } from "@/lib/queries";

/**
 * Category article grid with a "Load more" button. The first page is server-
 * rendered (passed as `initial` — good for SEO); each click fetches the next 12
 * via a server action and appends them, no full page reload.
 */
export function CategoryFeed({
  categoryId,
  initial,
  total,
}: {
  categoryId: string;
  initial: CardArticle[];
  total: number;
}) {
  const [items, setItems] = useState<CardArticle[]>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const hasMore = items.length < total;

  async function loadMore() {
    setLoading(true);
    setError(false);
    try {
      const res = await loadMoreCategory({ categoryId, skip: items.length });
      if (res.items.length) setItems((prev) => [...prev, ...res.items]);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((a, i) => (
          <Reveal key={a.id} delay={Math.min(i, 4) * 55}>
            <NewsCard article={a} priority={i < 3} />
          </Reveal>
        ))}
      </div>

      {hasMore && (
        <div className="mt-12 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-border px-6 py-2.5 text-sm font-semibold text-fg transition-colors hover:border-accent hover:text-accent-link disabled:opacity-60"
          >
            {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-fg-faint border-t-transparent" aria-hidden />}
            {loading ? "Loading…" : "Load more"}
          </button>
          {error && <p className="text-sm text-red-600 dark:text-red-400">Couldn’t load more — please try again.</p>}
        </div>
      )}
    </>
  );
}
