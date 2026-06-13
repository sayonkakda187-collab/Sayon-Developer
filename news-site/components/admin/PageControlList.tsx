"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { SearchIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatNumber } from "@/lib/site";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

const PER_PAGE = 24;

/**
 * Page Control landing: a searchable, avatar'd list of every connected Page (the
 * same Page records as Facebook → Insights). Tap a Page to open its dashboard.
 * Paginated for scale (~hundreds of Pages); a Page's live data is only fetched
 * once its dashboard is opened.
 */
export function PageControlList({ pages }: { pages: InsightsPageRow[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.pageName.toLowerCase().includes(q) || p.categoryGroup.toLowerCase().includes(q));
  }, [pages, query]);

  const { page, setPage, pageCount, pageItems, total } = usePaged(filtered, PER_PAGE);

  if (pages.length === 0) {
    return (
      <div className="adm-card adm-card-pad">
        <p className="adm-card-sub">
          No Facebook Pages are connected yet. Connect Pages in <Link href="/admin/facebook" className="adm-link">Facebook → Pages</Link> and
          they’ll appear here.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="adm-search" style={{ marginBottom: 12 }}>
        <SearchIcon className="h-4 w-4" />
        <input
          className="adm-input"
          type="search"
          placeholder="Search Pages by name or group…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search Pages"
        />
      </div>

      <div className="adm-pc-list">
        {pageItems.map((p) => (
          <Link key={p.id} href={`/admin/page-control/${p.id}`} className="adm-card adm-pc-row">
            <FacebookPageAvatar dbId={p.id} name={p.pageName} avatarUrl={p.avatarUrl} size={44} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="adm-pc-row-name">{p.pageName}</div>
              <div className="adm-card-sub" style={{ marginTop: 1 }}>
                {p.categoryGroup} · {formatNumber(p.postedCount)} shared
              </div>
            </div>
            {p.status !== "Connected" && <span className="adm-pill amber" style={{ flex: "none" }}>Reconnect</span>}
            <span className="adm-pc-chev" aria-hidden>›</span>
          </Link>
        ))}
      </div>

      {filtered.length === 0 && <p className="adm-card-sub" style={{ marginTop: 12 }}>No Pages match “{query}”.</p>}

      <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="adm-fb-sub">{total} {total === 1 ? "Page" : "Pages"}</span>
        <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
      </div>
    </div>
  );
}
