"use client";

import { useState } from "react";
import { pageControlFetchPages, pageControlConnectPages } from "@/app/admin/page-control-actions";
import { CloseIcon } from "@/components/admin/icons";
import { formatDate } from "@/lib/site";

type FetchedPage = { id: string; name: string; alreadyAdded: boolean };

/**
 * Current connection's user-token expiry, mirroring the posting farm's "Connection
 * valid until …". The long-lived user token lasts ~60 days; Page tokens stay active,
 * but you must re-paste a fresh user token to keep REFRESHING Pages. Warns amber when
 * it's within a week of expiry (or already expired). Renders nothing on a first connect.
 */
function ConnectionStatus({ expiresAt }: { expiresAt?: string | null }) {
  if (!expiresAt) return null;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return null;
  const now = Date.now();
  if (t <= now) {
    return (
      <p className="adm-pc-connstat warn" role="status">
        Connection expired {formatDate(expiresAt)} — paste a fresh user token below to reconnect.
      </p>
    );
  }
  const days = Math.ceil((t - now) / 86_400_000);
  if (days <= 7) {
    return (
      <p className="adm-pc-connstat warn" role="status">
        ⚠ Connection renews soon — valid until {formatDate(expiresAt)} ({days} day{days === 1 ? "" : "s"} left). Paste a
        fresh user token below to renew; your Page tokens stay active either way.
      </p>
    );
  }
  return (
    <p className="adm-pc-connstat" role="status">
      ✓ Connection valid until {formatDate(expiresAt)} · Page tokens stay active — re-paste a token after this to keep
      refreshing Pages.
    </p>
  );
}

/**
 * Page Control's own "Connect Page" modal — the SAME proven mechanism as the
 * Facebook tab's Auto connect (App ID + App Secret + a Graph-Explorer user token →
 * list this account's Pages → CHOOSE which to add), but watch-only and writing to
 * the SEPARATE MonitoredPage store. Multi-select checkbox list (not auto-add-all).
 * Works with a DIFFERENT Facebook account than the farm — just paste that account's
 * token. All tokens are validated + stored encrypted server-side; none reach here.
 */
export function PageControlConnectModal({
  onClose,
  onConnected,
  onError,
  appConfigured,
  tokenExpiresAt,
}: {
  onClose: () => void;
  onConnected: (added: number) => void;
  onError: (m: string) => void;
  appConfigured: boolean;
  tokenExpiresAt?: string | null;
}) {
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [userToken, setUserToken] = useState("");
  const [pages, setPages] = useState<FetchedPage[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function onFetch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await pageControlFetchPages({ appId: appId.trim(), appSecret: appSecret.trim(), userToken: userToken.trim() });
    setBusy(false);
    if (!res.ok) return onError(res.error);
    setPages(res.data.pages);
    // Pre-select the not-yet-added Pages so a quick "add all new" is one click.
    setSelected(new Set(res.data.pages.filter((p) => !p.alreadyAdded).map((p) => p.id)));
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onAdd(e: React.FormEvent) {
    e.preventDefault();
    const ids = [...selected];
    if (ids.length === 0) return onError("Pick at least one Page to monitor.");
    setBusy(true);
    const res = await pageControlConnectPages({ pageIds: ids });
    setBusy(false);
    if (res.ok) onConnected(res.data.added);
    else onError(res.error);
  }

  const addable = pages?.filter((p) => !p.alreadyAdded) ?? [];

  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Connect a Page to monitor" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h2 className="adm-serif">Connect a Page to monitor</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="adm-modal-body">
          {pages === null ? (
            <form onSubmit={onFetch}>
              <p className="adm-field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Paste your <strong>App ID</strong> + <strong>App Secret</strong> (App Dashboard → Settings → Basic) and a
                short-lived <strong>User token</strong> from the Graph API Explorer. Watch-only — grant just{" "}
                <code>pages_show_list</code>, <code>pages_read_engagement</code>, and <code>read_insights</code> (no posting
                scopes needed). We exchange it for a long-lived token, stored encrypted server-side. This is{" "}
                <strong>separate</strong> from the Facebook posting tab — you can monitor a <strong>different account</strong>.
              </p>
              <ConnectionStatus expiresAt={tokenExpiresAt} />
              <label className="adm-field">
                <span>App ID {appConfigured && <em className="adm-field-hint">(saved — leave blank to reuse)</em>}</span>
                <input className="adm-input" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder={appConfigured ? "Using saved App ID" : "e.g. 1234567890"} required={!appConfigured} autoFocus />
              </label>
              <label className="adm-field">
                <span>App Secret {appConfigured && <em className="adm-field-hint">(saved — leave blank to reuse)</em>}</span>
                <input className="adm-input" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder={appConfigured ? "Using saved App Secret" : "Stored encrypted (AES-256-GCM)"} required={!appConfigured} />
              </label>
              <label className="adm-field">
                <span>User Access Token (short-lived is fine)</span>
                <textarea className="adm-input" value={userToken} onChange={(e) => setUserToken(e.target.value)} rows={3} placeholder="Paste the token from Graph API Explorer" required style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
              </label>
              <div className="adm-modal-foot">
                <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" className="adm-btn-primary" disabled={busy}>
                  {busy && <span className="adm-spinner" aria-hidden />}
                  {busy ? "Fetching…" : "Fetch my Pages"}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={onAdd}>
              <p className="adm-field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                Found {pages.length} Page{pages.length === 1 ? "" : "s"}. Tick the ones to monitor.
              </p>
              {addable.length > 1 && (
                <label className="adm-check" style={{ marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={addable.every((p) => selected.has(p.id))}
                    onChange={(e) => setSelected(e.target.checked ? new Set(addable.map((p) => p.id)) : new Set())}
                  />
                  <span>Select all new Pages</span>
                </label>
              )}
              <div className="adm-pc-picklist">
                {pages.map((p) => (
                  <label key={p.id} className={`adm-pc-pick ${p.alreadyAdded ? "is-added" : ""}`}>
                    <input type="checkbox" checked={p.alreadyAdded || selected.has(p.id)} disabled={p.alreadyAdded} onChange={() => toggle(p.id)} />
                    <span className="adm-pc-pick-name">{p.name}</span>
                    {p.alreadyAdded && <span className="adm-pill" style={{ flex: "none" }}>Added</span>}
                  </label>
                ))}
              </div>
              <div className="adm-modal-foot">
                <button type="button" className="adm-btn-ghost" onClick={() => setPages(null)} disabled={busy}>Back</button>
                <button type="submit" className="adm-btn-primary" disabled={busy || selected.size === 0}>
                  {busy && <span className="adm-spinner" aria-hidden />}
                  {busy ? "Adding…" : `Add ${selected.size || ""} ${selected.size === 1 ? "page" : "pages"}`.trim()}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
