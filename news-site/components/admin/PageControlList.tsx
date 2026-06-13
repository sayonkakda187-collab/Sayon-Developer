"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { SearchIcon, PlusIcon } from "@/components/admin/icons";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatNumber } from "@/lib/site";
import { PageControlConnectModal } from "@/components/admin/PageControlConnectModal";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

/** A monitored page row for the landing list (InsightsPageRow + its follower count). */
export type MonitoredRow = InsightsPageRow & { followers: number | null };

const PER_PAGE = 24;

/**
 * Page Control landing — shows ONLY the pages connected INSIDE this tab
 * (MonitoredPage store), with its own "Connect Page" flow. Independent from the
 * Facebook posting farm. Empty state nudges the first connection; otherwise a
 * searchable, paginated, avatar'd list links into each page's watch-only
 * dashboard. A page's live data is fetched only when its dashboard opens.
 */
export function PageControlList({ pages, appConfigured }: { pages: MonitoredRow[]; appConfigured: boolean }) {
  const { success, error } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [showConnect, setShowConnect] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((p) => p.pageName.toLowerCase().includes(q));
  }, [pages, query]);

  const { page, setPage, pageCount, pageItems, total } = usePaged(filtered, PER_PAGE);

  function onConnected(added: number) {
    setShowConnect(false);
    success(added === 1 ? "Added 1 page to monitor." : `Added ${added} pages to monitor.`);
    router.refresh();
  }

  const connectBtn = (
    <button type="button" className="adm-btn-primary" onClick={() => setShowConnect(true)}>
      <PlusIcon className="h-4 w-4" /> Connect Page
    </button>
  );

  return (
    <div>
      {pages.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "32px 18px" }}>
          <div className="adm-card-title" style={{ fontSize: 18 }}>Monitor your first Page</div>
          <p className="adm-card-sub" style={{ maxWidth: 460, margin: "8px auto 16px" }}>
            Page Control is a <strong>watch-only</strong> dashboard with its own connection — separate from the Facebook
            posting tab. Connect Pages here (even from a different Facebook account) to see each one’s Summary, real
            published Content, and Analytics.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>{connectBtn}</div>
        </div>
      ) : (
        <>
          <div className="adm-list-head" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div className="adm-search" style={{ flex: 1, minWidth: 200, marginBottom: 0 }}>
              <SearchIcon className="h-4 w-4" />
              <input
                className="adm-input"
                type="search"
                placeholder="Search monitored Pages…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search monitored Pages"
              />
            </div>
            {connectBtn}
          </div>

          <div className="adm-pc-list">
            {pageItems.map((p) => (
              <Link key={p.id} href={`/admin/page-control/${p.id}`} className="adm-card adm-pc-row">
                <FacebookPageAvatar dbId={p.id} name={p.pageName} avatarUrl={p.avatarUrl} size={44} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="adm-pc-row-name">{p.pageName}</div>
                  <div className="adm-card-sub" style={{ marginTop: 1 }}>
                    Watch-only{p.followers != null ? ` · ${formatNumber(p.followers)} followers` : ""}
                  </div>
                </div>
                {p.status !== "Connected" && <span className="adm-pill amber" style={{ flex: "none" }}>Reconnect</span>}
                <span className="adm-pc-chev" aria-hidden>›</span>
              </Link>
            ))}
          </div>

          {filtered.length === 0 && <p className="adm-card-sub" style={{ marginTop: 12 }}>No Pages match “{query}”.</p>}

          <div style={{ marginTop: 14, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span className="adm-fb-sub">{total} monitored {total === 1 ? "Page" : "Pages"}</span>
            <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
          </div>
        </>
      )}

      {showConnect && (
        <PageControlConnectModal
          appConfigured={appConfigured}
          onClose={() => setShowConnect(false)}
          onConnected={onConnected}
          onError={error}
        />
      )}
    </div>
  );
}
