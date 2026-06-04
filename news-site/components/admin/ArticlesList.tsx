"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatNumber } from "@/lib/site";
import { useToast } from "@/components/admin/Toast";
import { duplicateArticle, bulkArticleAction } from "@/app/admin/actions";
import { SharePromoteModal } from "@/components/admin/SharePromoteModal";
import { ArticleThumb } from "@/components/admin/ArticleThumb";
import { PencilIcon, EyeIcon, SearchIcon, ShareIcon } from "@/components/admin/icons";

type Item = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  coverImage: string | null;
  category: { name: string } | null;
  publishedAt: string | null;
  createdAt: string;
};
type Row = Item & { snippet?: string };

const STATUS_FILTERS = ["All", "Published", "Drafts"] as const;
const BASE_SORTS = [
  { id: "newest", label: "Newest" },
  { id: "views", label: "Most views" },
  { id: "title", label: "Title A–Z" },
] as const;
type SortId = "relevance" | (typeof BASE_SORTS)[number]["id"];
const PER_PAGE = 15;

export function ArticlesList({
  items,
  categories,
  initialQuery = "",
  initialPublishedId,
}: {
  items: Item[];
  categories: string[];
  initialQuery?: string;
  // When present (from ?published={id} after publishing), auto-open the Share
  // panel with the celebratory header.
  initialPublishedId?: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();

  // Share / Promote panel target. `celebrate` shows the post-publish header.
  const [shareTarget, setShareTarget] = useState<{ id: string; celebrate: boolean } | null>(
    initialPublishedId ? { id: initialPublishedId, celebrate: true } : null,
  );

  // Drop the ?published= param from the URL once consumed, so a refresh doesn't
  // reopen the celebratory panel.
  useEffect(() => {
    if (initialPublishedId && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("published")) {
        url.searchParams.delete("published");
        window.history.replaceState(null, "", url.pathname + url.search);
      }
    }
  }, [initialPublishedId]);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<string>("All");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortId>(initialQuery.trim() ? "relevance" : "newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();

  // Server-side search: when a query is present we hit the full multi-field
  // search (title/excerpt/content/category/tags, ranked) instead of filtering
  // the preloaded list — so body-content matches and snippets are covered.
  const [serverResults, setServerResults] = useState<Row[] | null>(null);
  const [searching, setSearching] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  const isSearch = query.trim().length >= 2;

  // Debounced fetch when the query changes.
  useEffect(() => {
    const term = query.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (term.length < 2) {
      setServerResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const res = await fetch(`/api/admin/articles/search?q=${encodeURIComponent(term)}&limit=100`);
        const data = await res.json();
        if (id === reqId.current) {
          setServerResults(Array.isArray(data.results) ? (data.results as Row[]) : []);
        }
      } catch {
        if (id === reqId.current) setServerResults([]);
      } finally {
        if (id === reqId.current) setSearching(false);
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query]);

  const filtered = useMemo(() => {
    const source: Row[] = isSearch ? serverResults ?? [] : items;
    const rows = source.filter((a) => {
      if (status === "Published" && a.status !== "published") return false;
      if (status === "Drafts" && a.status !== "draft") return false;
      if (category !== "All" && a.category?.name !== category) return false;
      return true;
    });
    // Relevance order (server-ranked) is preserved unless an explicit sort wins.
    if (sort === "relevance") return rows;
    return [...rows].sort((a, b) => {
      if (sort === "views") return b.views - a.views;
      if (sort === "title") return a.title.localeCompare(b.title);
      return (Date.parse(b.publishedAt ?? b.createdAt) || 0) - (Date.parse(a.publishedAt ?? a.createdAt) || 0);
    });
  }, [items, serverResults, isSearch, status, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const shown = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Reset page + selection whenever the inputs change the result set.
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [query, status, category, sort]);

  // Default to "Best match" when a search begins; back to "Newest" when cleared.
  useEffect(() => {
    setSort((s) => (isSearch ? (s === "newest" ? "relevance" : s) : s === "relevance" ? "newest" : s));
  }, [isSearch]);

  const shownIds = shown.map((a) => a.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllShown() {
    setSelected((s) => {
      const next = new Set(s);
      if (allShownSelected) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function runBulk(action: "publish" | "unpublish" | "delete") {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (action === "delete" && !confirm(`Delete ${ids.length} article${ids.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    startTransition(async () => {
      const res = await bulkArticleAction(ids, action);
      if (res.ok) {
        success(`${action === "delete" ? "Deleted" : action === "publish" ? "Published" : "Unpublished"} ${res.count} article${res.count === 1 ? "" : "s"}.`);
        setSelected(new Set());
        router.refresh();
      } else {
        error(res.error);
      }
    });
  }

  function onDuplicate(id: string) {
    startTransition(async () => {
      const res = await duplicateArticle(id);
      if (res.ok) {
        success("Duplicated as a new draft.");
        router.push(`/admin/articles/${res.id}/edit`);
      } else {
        error(res.error);
      }
    });
  }

  const sortOptions = isSearch
    ? [{ id: "relevance" as const, label: "Best match" }, ...BASE_SORTS]
    : BASE_SORTS;

  return (
    <>
      {/* Search + sort */}
      <div className="adm-am-controls">
        <div className="adm-am-search">
          <SearchIcon className="adm-am-search-ic h-4 w-4" />
          <input
            className="adm-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, excerpt, body, category, tags…"
            aria-label="Search articles"
          />
          {searching && <span className="adm-am-spin" aria-hidden />}
        </div>
        <select className="adm-input adm-am-sort" value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort">
          {sortOptions.map((s) => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </div>

      {/* Status + category filter chips */}
      <div className="adm-filterbar">
        {STATUS_FILTERS.map((c) => (
          <button key={c} type="button" className={`adm-fchip ${status === c ? "on" : ""}`} onClick={() => setStatus(c)}>{c}</button>
        ))}
        {categories.length > 0 && <span className="adm-am-sep" aria-hidden />}
        <button type="button" className={`adm-fchip ${category === "All" ? "on" : ""}`} onClick={() => setCategory("All")}>All categories</button>
        {categories.map((c) => (
          <button key={c} type="button" className={`adm-fchip ${category === c ? "on" : ""}`} onClick={() => setCategory(c)}>{c}</button>
        ))}
      </div>

      {/* Bulk action bar (appears when rows are selected) */}
      {selected.size > 0 && (
        <div className="adm-bulkbar" role="region" aria-label="Bulk actions">
          <span className="adm-bulkbar-count">{selected.size} selected</span>
          <div className="adm-bulkbar-actions">
            <button type="button" className="adm-btn-ghost" disabled={busy} onClick={() => runBulk("publish")}>Publish</button>
            <button type="button" className="adm-btn-ghost" disabled={busy} onClick={() => runBulk("unpublish")}>Unpublish</button>
            <button type="button" className="adm-btn-ghost adm-bulk-danger" disabled={busy} onClick={() => runBulk("delete")}>Delete</button>
            <button type="button" className="adm-link" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        </div>
      )}

      <div className="adm-card adm-card-pad">
        {isSearch && searching && shown.length === 0 ? (
          <div className="adm-am-skel">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="adm-arow">
                <div className="sk h-9 w-9 rounded-lg" style={{ flex: "none" }} />
                <div style={{ flex: 1 }}>
                  <div className="sk h-4 w-2/3 rounded" />
                  <div className="sk mt-2 h-3 w-1/3 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="adm-card-sub" style={{ padding: "8px 0" }}>
            {isSearch ? `No articles match “${query.trim()}”. Try fewer or different words.` : "No articles match your filters."}
          </p>
        ) : (
          <>
            <div className="adm-am-selhead">
              <label className="adm-am-check">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all on this page" />
                Select page
              </label>
              <span className="adm-card-sub">
                {filtered.length} result{filtered.length === 1 ? "" : "s"}{isSearch && sort === "relevance" ? " · by relevance" : ""}
              </span>
            </div>

            {shown.map((a) => {
              const published = a.status === "published";
              const isSel = selected.has(a.id);
              return (
                <div key={a.id} className={`adm-arow ${isSel ? "sel" : ""}`}>
                  <label className="adm-am-rowcheck">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} />
                  </label>
                  <ArticleThumb cover={a.coverImage} title={a.title} />
                  <div className="adm-abody">
                    <Link href={`/admin/articles/${a.id}/edit`} className="adm-ati" style={{ display: "block" }}>{a.title}</Link>
                    {a.snippet && <div className="adm-asnip">{renderSnippet(a.snippet)}</div>}
                    <div className="adm-amr">
                      <span className={`adm-pill ${published ? "" : "amber"}`}>{published ? "Published" : "Draft"}</span>
                      {a.category && (<><span className="adm-dotsep" /><span className="adm-amt">{a.category.name}</span></>)}
                      <span className="adm-dotsep" />
                      <span className="adm-amt">{formatNumber(a.views)} views</span>
                      <span className="adm-dotsep" />
                      <span className="adm-amt">{formatDate(a.publishedAt ?? a.createdAt)}</span>
                    </div>
                  </div>
                  <div className="adm-rowact">
                    <Link href={`/admin/articles/${a.id}/edit`} aria-label={`Edit ${a.title}`}><PencilIcon className="h-[18px] w-[18px]" /></Link>
                    {published && (
                      <>
                        <Link href={`/news/${a.slug}`} target="_blank" aria-label={`View ${a.title}`}><EyeIcon className="h-[18px] w-[18px]" /></Link>
                        <button type="button" className="adm-rowact-btn" onClick={() => setShareTarget({ id: a.id, celebrate: false })} aria-label={`Share ${a.title}`} title="Share / promote">
                          <ShareIcon className="h-[18px] w-[18px]" />
                        </button>
                      </>
                    )}
                    <button type="button" className="adm-rowact-btn" disabled={busy} onClick={() => onDuplicate(a.id)} aria-label={`Duplicate ${a.title}`} title="Duplicate as new draft">
                      <CopyGlyph />
                    </button>
                  </div>
                </div>
              );
            })}

            {pageCount > 1 && (
              <div className="adm-pager">
                <button type="button" className="adm-btn-ghost" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
                <span className="adm-pager-info">Page {safePage} of {pageCount}</span>
                <button type="button" className="adm-btn-ghost" disabled={safePage >= pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next</button>
              </div>
            )}
          </>
        )}
      </div>

      {shareTarget && (
        <SharePromoteModal
          articleId={shareTarget.id}
          celebrate={shareTarget.celebrate}
          onClose={() => setShareTarget(null)}
        />
      )}
    </>
  );
}

// Render a snippet where matches are wrapped in « » as <mark>.
function renderSnippet(snippet: string) {
  const parts = snippet.split(/«([^»]*)»/g);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
