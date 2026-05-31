"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  connectFacebookPage,
  disconnectFacebookPage,
  refreshFacebookPage,
} from "@/app/admin/facebook-actions";
import {
  FACEBOOK_CATEGORY_GROUPS,
  sortCategoryGroups,
} from "@/lib/facebookGroups";
import { useToast } from "@/components/admin/Toast";
import { FacebookIcon, PlusIcon, RefreshIcon, TrashIcon, CloseIcon } from "@/components/admin/icons";
import { formatDate } from "@/lib/site";

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

export function FacebookPagesManager({ pages }: { pages: FacebookPageView[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [showConnect, setShowConnect] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Group pages by niche/category for a scannable, grouped table.
  const grouped = useMemo(() => {
    const map = new Map<string, FacebookPageView[]>();
    for (const p of pages) {
      const arr = map.get(p.categoryGroup) ?? [];
      arr.push(p);
      map.set(p.categoryGroup, arr);
    }
    return sortCategoryGroups([...map.keys()]).map((group) => ({
      group,
      rows: map.get(group)!,
    }));
  }, [pages]);

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
        </div>
        <button type="button" className="adm-btn-primary adm-head-cta" onClick={() => setShowConnect(true)}>
          <PlusIcon className="h-[18px] w-[18px]" />
          Connect New Page
        </button>
      </div>

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
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
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

function ConnectModal({
  onClose,
  onConnected,
  onError,
}: {
  onClose: () => void;
  onConnected: () => void;
  onError: (m: string) => void;
}) {
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [categoryGroup, setCategoryGroup] = useState<string>(FACEBOOK_CATEGORY_GROUPS[0]);
  const [customGroup, setCustomGroup] = useState("");
  const [exchange, setExchange] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const group = categoryGroup === "__custom__" ? customGroup.trim() : categoryGroup;
    const res = await connectFacebookPage({
      pageId: pageId.trim(),
      accessToken: accessToken.trim(),
      categoryGroup: group,
      exchange,
    });
    setSubmitting(false);
    if (res.ok) onConnected();
    else onError(res.error);
  }

  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div
        className="adm-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Connect a Facebook Page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="adm-modal-head">
          <h2 className="adm-serif">Connect a Facebook Page</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="adm-modal-body">
          <label className="adm-field">
            <span>Page ID</span>
            <input
              className="adm-input"
              value={pageId}
              onChange={(e) => setPageId(e.target.value)}
              placeholder="e.g. 1234567890"
              required
              autoFocus
            />
          </label>

          <label className="adm-field">
            <span>Page Access Token</span>
            <textarea
              className="adm-input"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder="Paste the long-lived Page access token"
              rows={3}
              required
              style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }}
            />
            <span className="adm-field-hint">
              Stored encrypted (AES-256-GCM). Validated against the Graph API before saving.
            </span>
          </label>

          <label className="adm-field">
            <span>Category / Niche Group</span>
            <select
              className="adm-input"
              value={categoryGroup}
              onChange={(e) => setCategoryGroup(e.target.value)}
            >
              {FACEBOOK_CATEGORY_GROUPS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
          </label>

          {categoryGroup === "__custom__" && (
            <label className="adm-field">
              <span>Custom group name</span>
              <input
                className="adm-input"
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
                placeholder="e.g. Lifestyle"
                required
              />
            </label>
          )}

          <label className="adm-check" style={{ marginTop: 2 }}>
            <input type="checkbox" checked={exchange} onChange={(e) => setExchange(e.target.checked)} />
            <span>
              This is a short-lived <strong>user</strong> token — exchange it for a long-lived one
              <span className="adm-field-hint" style={{ display: "block" }}>
                Requires FACEBOOK_APP_ID + FACEBOOK_APP_SECRET. Leave off if pasting a Page token.
              </span>
            </span>
          </label>

          <div className="adm-modal-foot">
            <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="adm-btn-primary" disabled={submitting}>
              {submitting && <span className="adm-spinner" aria-hidden />}
              {submitting ? "Validating…" : "Validate & Connect"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
