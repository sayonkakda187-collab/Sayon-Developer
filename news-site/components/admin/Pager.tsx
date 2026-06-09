"use client";

import { useEffect, useState } from "react";

/**
 * Client-side pagination over an already-loaded array. Returns the current page's
 * slice + controls. Clamps the page if the list shrinks (e.g. after a filter), so
 * it never lands on an empty page.
 */
export function usePaged<T>(items: T[], perPage: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== current) setPage(current);
  }, [page, current]);

  const start = (current - 1) * perPage;
  return {
    page: current,
    setPage,
    pageCount,
    pageItems: items.slice(start, start + perPage),
    total: items.length,
    start,
  };
}

/** Windowed page numbers: 1 … (p-1) p (p+1) … N (with gaps as "…"). */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  const out: (number | "gap")[] = [];
  for (let p = 1; p <= pageCount; p++) {
    if (p === 1 || p === pageCount || (p >= page - 1 && p <= page + 1)) {
      out.push(p);
    } else if (out[out.length - 1] !== "gap") {
      out.push("gap");
    }
  }
  return out;
}

/** "‹ Prev  1 2 … 9  Next ›" pager. Renders nothing for a single page. */
export function AdminPager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (p: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav className="adm-pager" aria-label="Pagination">
      <button
        type="button"
        className="adm-pager-btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
        aria-label="Previous page"
      >
        ‹ Prev
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === "gap" ? (
          <span key={`gap-${i}`} className="adm-pager-gap" aria-hidden>
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={`adm-pager-btn ${p === page ? "on" : ""}`}
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPage(p)}
          >
            {p}
          </button>
        ),
      )}
      <button
        type="button"
        className="adm-pager-btn"
        disabled={page >= pageCount}
        onClick={() => onPage(page + 1)}
        aria-label="Next page"
      >
        Next ›
      </button>
    </nav>
  );
}
