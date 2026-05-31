"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDate, formatNumber } from "@/lib/site";
import { useToast } from "@/components/admin/Toast";
import { duplicateArticle, bulkArticleAction } from "@/app/admin/actions";
import { PencilIcon, EyeIcon, SearchIcon } from "@/components/admin/icons";

type Item = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  category: { name: string } | null;
  publishedAt: string | null;
  createdAt: string;
};

const STATUS_FILTERS = ["All", "Published", "Drafts"] as const;
const SORTS = [
  { id: "newest", label: "Newest" },
  { id: "views", label: "Most views" },
  { id: "title", label: "Title A–Z" },
] as const;
type SortId = (typeof SORTS)[number]["id"];
const PER_PAGE = 15;

export function ArticlesList({
  items,
  categories,
}: {
  items: Item[];
  categories: string[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("All");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortId>("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = items.filter((a) => {
      if (status === "Published" && a.status !== "published") return false;
      if (status === "Drafts" && a.status !== "draft") return false;
      if (category !== "All" && a.category?.name !== category) return false;
      if (q && !a.title.toLowerCase().includes(q)) return false;
      return true;
    });
    rows = [...rows].sort((a, b) => {
      if (sort === "views") return b.views - a.views;
      if (sort === "title") return a.title.localeCompare(b.title);
      return (Date.parse(b.publishedAt ?? b.createdAt) || 0) - (Date.parse(a.publishedAt ?? a.createdAt) || 0);
    });
    return rows;
  }, [items, query, status, category, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const shown = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);

  // Reset to page 1 whenever filters change the result set meaningfully.
  function resetTo(fn: () => void) {
    fn();
    setPage(1);
    setSelected(new Set());
  }

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
            onChange={(e) => resetTo(() => setQuery(e.target.value))}
            placeholder="Search by title…"
            aria-label="Search articles by title"
          />
        </div>
        <select className="adm-input adm-am-sort" value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort">
          {SORTS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      {/* Status + category filter chips */}
      <div className="adm-filterbar">
        {STATUS_FILTERS.map((c) => (
          <button key={c} type="button" className={`adm-fchip ${status === c ? "on" : ""}`} onClick={() => resetTo(() => setStatus(c))}>{c}</button>
        ))}
        {categories.length > 0 && <span className="adm-am-sep" aria-hidden />}
        <button type="button" className={`adm-fchip ${category === "All" ? "on" : ""}`} onClick={() => resetTo(() => setCategory("All"))}>All categories</button>
        {categories.map((c) => (
          <button key={c} type="button" className={`adm-fchip ${category === c ? "on" : ""}`} onClick={() => resetTo(() => setCategory(c))}>{c}</button>
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
        {shown.length === 0 ? (
          <p className="adm-card-sub" style={{ padding: "8px 0" }}>No articles match your filters.</p>
        ) : (
          <>
            <div className="adm-am-selhead">
              <label className="adm-am-check">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAllShown} aria-label="Select all on this page" />
                Select page
              </label>
              <span className="adm-card-sub">{filtered.length} result{filtered.length === 1 ? "" : "s"}</span>
            </div>

            {shown.map((a) => {
              const published = a.status === "published";
              const isSel = selected.has(a.id);
              return (
                <div key={a.id} className={`adm-arow ${isSel ? "sel" : ""}`}>
                  <label className="adm-am-rowcheck">
                    <input type="checkbox" checked={isSel} onChange={() => toggle(a.id)} aria-label={`Select ${a.title}`} />
                  </label>
                  <span className="adm-ini">{a.title.slice(0, 1).toUpperCase()}</span>
                  <div className="adm-abody">
                    <Link href={`/admin/articles/${a.id}/edit`} className="adm-ati" style={{ display: "block" }}>{a.title}</Link>
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
                      <Link href={`/news/${a.slug}`} target="_blank" aria-label={`View ${a.title}`}><EyeIcon className="h-[18px] w-[18px]" /></Link>
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
    </>
  );
}

function CopyGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}
