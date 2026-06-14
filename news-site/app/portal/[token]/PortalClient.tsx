"use client";

import { useState } from "react";
import { ToastProvider } from "@/components/admin/Toast";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { AvatarProxyContext } from "@/components/admin/FacebookPageAvatar";
import { PageControlList, type MonitoredRow } from "@/components/admin/PageControlList";
import { PageControlDashboard } from "@/components/admin/PageControlDashboard";
import { PageControlNetwork } from "@/components/admin/PageControlNetwork";
import { PageControlEarnings } from "@/components/admin/PageControlEarnings";
import type { ManagedPage } from "@/components/admin/ManagersScreen";
import { PortalThemeToggle } from "./PortalThemeToggle";

/**
 * The Manager Portal shell — a standalone (non-admin) surface wrapping the reused Page
 * Control components in `.admin-shell` so they pick up the section styling, but with NO
 * admin chrome (sidebar / global search / nav). Two tabs:
 *  • Results — read-only: all monitored pages' stats/charts (left) + the network
 *    dashboard (right). `readOnly` hides the admin-only "Connect Page" affordances.
 *  • My Earnings — daily earnings entry limited to THIS manager's own pages. The portal
 *    API (`/api/portal/<token>/…`) re-checks ownership on every write, so the limit holds
 *    server-side regardless of the UI.
 */
export function PortalClient({
  token,
  manager,
  pages,
  managers,
  assignments,
  ownPages,
  ownAssignments,
}: {
  token: string;
  manager: Manager;
  pages: MonitoredRow[];
  managers: Manager[];
  assignments: Record<string, string | null>;
  ownPages: ManagedPage[];
  ownAssignments: Record<string, string | null>;
}) {
  const [tab, setTab] = useState<"results" | "earnings">("results");
  // When a Results row is clicked, show that page's read-only full detail (Summary /
  // Content / Analytics) in place of the tabs — back returns to Results.
  const [detailPageId, setDetailPageId] = useState<string | null>(null);
  const apiBase = `/api/portal/${encodeURIComponent(token)}`;
  const ownCount = ownPages.length;
  const detailPage = detailPageId ? pages.find((p) => p.id === detailPageId) ?? null : null;

  return (
    // Disable the admin-only avatar picture proxy for the whole portal subtree — portal
    // avatars fall straight from the cached CDN url to initials, never hitting /api/admin.
    <AvatarProxyContext.Provider value={false}>
    <ToastProvider>
      <div
        className="admin-shell adm-stage adm-portal"
        data-section="page-control"
        style={{ flex: 1, minHeight: "100dvh", display: "flex", flexDirection: "column" }}
      >
        <header className="adm-portal-top">
          <div className="adm-portal-id">
            <ManagerAvatar name={manager.name} photo={manager.photo} size={40} />
            <div className="adm-portal-id-txt">
              <div className="adm-portal-id-eyebrow">Manager Portal · viewing as</div>
              <div className="adm-portal-id-name">{manager.name}</div>
            </div>
          </div>
          <div className="adm-portal-top-right">
            <span className="adm-portal-ro" title="You have a read-only view of all results; you can only enter earnings for your own pages.">
              Read-only
            </span>
            <PortalThemeToggle />
          </div>
        </header>

        <div className="adm-portal-body">
          {detailPage ? (
            // Read-only full page detail (Summary / Content / Analytics), pointed at the
            // portal API with all admin action buttons hidden.
            <PageControlDashboard
              page={detailPage}
              followers={detailPage.followers}
              apiBase={apiBase}
              hideActions
              onBack={() => setDetailPageId(null)}
            />
          ) : (
            <>
              <div className="adm-pc-subtabs adm-pc-toptabs adm-portal-tabs" role="tablist" aria-label="Portal sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "results"}
                  className={`adm-pc-subtab ${tab === "results" ? "on" : ""}`}
                  onClick={() => setTab("results")}
                >
                  Results
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "earnings"}
                  className={`adm-pc-subtab ${tab === "earnings" ? "on" : ""}`}
                  onClick={() => setTab("earnings")}
                >
                  My Earnings{ownCount ? ` · ${ownCount}` : ""}
                </button>
              </div>

              {tab === "results" ? (
                // No `data-mtab` → both boxes show (stacked on mobile, side-by-side on desktop).
                <div className="adm-pc-twobox">
                  <div className="adm-pc-box adm-pc-box-list">
                    <PageControlList
                      pages={pages}
                      appConfigured={false}
                      managers={managers}
                      assignments={assignments}
                      apiBase={apiBase}
                      readOnly
                      onOpenPage={setDetailPageId}
                    />
                  </div>
                  <div className="adm-pc-box adm-pc-box-net">
                    <PageControlNetwork apiBase={apiBase} />
                  </div>
                </div>
              ) : (
                <div className="adm-portal-earn">
                  {ownCount === 0 ? (
                    <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "32px 18px" }}>
                      <div className="adm-card-title" style={{ fontSize: 18 }}>No pages assigned to you yet</div>
                      <p className="adm-card-sub" style={{ maxWidth: 460, margin: "8px auto 0" }}>
                        When your administrator assigns Pages to you, you’ll be able to enter their daily earnings here.
                      </p>
                    </div>
                  ) : (
                    <PageControlEarnings pages={ownPages} managers={[manager]} assignments={ownAssignments} apiBase={apiBase} />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <footer className="adm-portal-foot">
          Powered by <strong>The Daily Ledger</strong> · Page Control
        </footer>
      </div>
    </ToastProvider>
    </AvatarProxyContext.Provider>
  );
}
