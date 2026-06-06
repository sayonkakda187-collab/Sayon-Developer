"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectFacebookPage,
  refreshFacebookPage,
  facebookRefreshPages,
} from "@/app/admin/facebook-actions";
import { sortCategoryGroups } from "@/lib/facebookGroups";
import { useToast } from "@/components/admin/Toast";
import { FacebookIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from "@/components/admin/icons";
import { formatDate } from "@/lib/site";
import { ConnectModal } from "./FacebookConnectModal";

export type FacebookPageView = {
  id: string;
  pageId: string;
  pageName: string;
  categoryGroup: string;
  status: string; // "Connected" | "Expired"
  lastSyncedAt: string | null;
  postedCount: number;
  pendingCount: number;
};

function StatusBadge({ status }: { status: string }) {
  const connected = status === "Connected";
  return (
    <span className={`adm-pill ${connected ? "" : "amber"}`} style={{ gap: 5 }}>
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: connected ? "#16a34a" : "#dc2626",
          display: "inline-block",
        }}
      />
      {connected ? "Connected" : "Expired"}
    </span>
  );
}

export function FacebookPagesManager({
  pages,
  connect,
}: {
  pages: FacebookPageView[];
  connect?: { appConfigured: boolean; userTokenSaved: boolean; userTokenExpiresAt: string | null };
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  // Filter by name / id / group so a Page is easy to find among many.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.pageName.toLowerCase().includes(q) ||
        p.pageId.toLowerCase().includes(q) ||
        p.categoryGroup.toLowerCase().includes(q),
    );
  }, [pages, query]);

  // Group pages by niche/category for a scannable, grouped table.
  const grouped = useMemo(() => {
    const map = new Map<string, FacebookPageView[]>();
    for (const p of filtered) {
      const arr = map.get(p.categoryGroup) ?? [];
      arr.push(p);
      map.set(p.categoryGroup, arr);
    }
    return sortCategoryGroups([...map.keys()]).map((group) => ({
      group,
      rows: map.get(group)!,
    }));
  }, [filtered]);

  function refresh() {
    startTransition(() => router.refresh());
  }

  async function onRefreshToken(id: string, name: string) {
    setBusyId(id);
    const res = await refreshFacebookPage(id);
    setBusyId(null);
    if (res.ok) success(`“${name}” token is valid.`);
    else error(res.error);
    refresh();
  }

  async function onDisconnect(id: string, name: string) {
    if (!confirm(`Disconnect “${name}”? Its access token will be deleted.`)) return;
    setBusyId(id);
    const res = await disconnectFacebookPage(id);
    setBusyId(null);
    if (res.ok) success(`Disconnected “${name}”.`);
    else error(res.error);
    refresh();
  }

  // Re-sync every Page from Facebook: refresh existing tokens + pull in any
  // Pages added on Facebook since last time (no re-pasting credentials).
  async function onRefreshPages() {
    setRefreshingAll(true);
    const res = await facebookRefreshPages();
    setRefreshingAll(false);
    if (!res.ok) return error(res.error);
    const { refreshed, added } = res.data;
    success(
      added > 0
        ? `Synced ${refreshed + added} Page${refreshed + added === 1 ? "" : "s"} (${added} new).`
        : `Refreshed ${refreshed} Page${refreshed === 1 ? "" : "s"}.`,
    );
    refresh();
  }

  return (
    <div>
      <div className="adm-pagehead">
        <div className="adm-page-h" style={{ marginBottom: 0 }}>
          <h1>Facebook Pages</h1>
          <p>
            {pages.length === 0
              ? "Connect Pages to distribute articles via the Graph API"
              : `${pages.length} page${pages.length === 1 ? "" : "s"} connected`}
          </p>
          {connect?.userTokenExpiresAt &&
            (new Date(connect.userTokenExpiresAt).getTime() > Date.now() ? (
              <p className="adm-fb-sub" style={{ marginTop: 4 }}>
                Connection valid until {formatDate(connect.userTokenExpiresAt)} · Page tokens stay active —
                reconnect after this to keep refreshing Pages.
              </p>
            ) : (
              <p className="adm-fb-sub" style={{ marginTop: 4, color: "#b45309" }}>
                Connection expired {formatDate(connect.userTokenExpiresAt)} — reconnect to refresh Pages.
              </p>
            ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {connect?.userTokenSaved && (
            <button
              type="button"
              className="adm-btn-ghost adm-head-cta"
              onClick={onRefreshPages}
              disabled={refreshingAll}
              title="Re-sync Pages from Facebook (refresh tokens + pull in newly-added Pages)"
            >
              <RefreshIcon className={`h-[18px] w-[18px] ${refreshingAll ? "adm-spinning" : ""}`} />
              {refreshingAll ? "Refreshing…" : "Refresh Pages"}
            </button>
          )}
          <button type="button" className="adm-btn-primary adm-head-cta" onClick={() => setShowConnect(true)}>
            <PlusIcon className="h-[18px] w-[18px]" />
            Connect New Page
          </button>
        </div>
      </div>

      {pages.length > 0 && (
        <label className="adm-search" style={{ maxWidth: 360, margin: "14px 0 0" }}>
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages by name, ID, or group…"
            aria-label="Search Facebook pages"
          />
        </label>
      )}

      {pages.length === 0 ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill">
              <FacebookIcon className="h-[38px] w-[38px]" />
            </div>
            <h2 className="adm-serif">No Pages connected yet</h2>
            <p>
              Connect a Facebook Page with a long-lived Page access token to publish and schedule
              articles to it. Tokens are encrypted and never leave the server.
            </p>
            <button type="button" className="adm-btn-primary" style={{ marginTop: 18 }} onClick={() => setShowConnect(true)}>
              <PlusIcon className="h-[18px] w-[18px]" />
              Connect New Page
            </button>
          </div>
        </div>
      ) : grouped.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ marginTop: 16 }}>
          <p className="adm-card-sub">No pages match “{query}”.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 16 }}>
          {grouped.map(({ group, rows }) => (
            <div key={group} className="adm-card adm-card-pad">
              <div className="adm-fb-grouphd">
                <span className="adm-fb-groupname">{group}</span>
                <span className="adm-fb-groupcount">{rows.length}</span>
              </div>

              {/* Desktop/tablet table */}
              <table className="adm-table adm-fb-table">
                <thead>
                  <tr>
                    <th>Page Name</th>
                    <th>Page ID</th>
                    <th>Category Group</th>
                    <th>Token Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <span style={{ fontWeight: 600, color: "var(--adm-ink)" }}>{p.pageName}</span>
                        <span className="adm-fb-sub">
                          {p.postedCount} posted
                          {p.pendingCount > 0 ? ` · ${p.pendingCount} scheduled` : ""}
                          {p.lastSyncedAt ? ` · synced ${formatDate(p.lastSyncedAt)}` : ""}
                        </span>
                      </td>
                      <td><code className="adm-fb-code">{p.pageId}</code></td>
                      <td>{p.categoryGroup}</td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <div className="adm-fb-actions">
                          <button
                            type="button"
                            className="adm-btn-ghost adm-fb-act"
                            disabled={busyId === p.id}
                            onClick={() => onRefreshToken(p.id, p.pageName)}
                            title="Validate this token against the Graph API"
                          >
                            <RefreshIcon className={`h-4 w-4 ${busyId === p.id ? "adm-spinning" : ""}`} />
                            <span className="adm-fb-actlabel">Refresh</span>
                          </button>
                          <button
                            type="button"
                            className="adm-btn-ghost adm-fb-act adm-fb-danger"
                            disabled={busyId === p.id}
                            onClick={() => onDisconnect(p.id, p.pageName)}
                            title="Delete this page and its token"
                          >
                            <TrashIcon className="h-4 w-4" />
                            <span className="adm-fb-actlabel">Disconnect</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {showConnect && (
        <ConnectModal
          onClose={() => setShowConnect(false)}
          onConnected={() => {
            setShowConnect(false);
            success("Page connected.");
            refresh();
          }}
          onError={error}
        />
      )}
    </div>
  );
}
