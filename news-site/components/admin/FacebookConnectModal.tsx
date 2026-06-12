"use client";

import { useState } from "react";
import {
  connectFacebookPage,
  facebookFetchPages,
  facebookConnectPage,
  facebookReconnectAll,
} from "@/app/admin/facebook-actions";
import { FACEBOOK_CATEGORY_GROUPS } from "@/lib/facebookGroups";
import { CloseIcon } from "@/components/admin/icons";

/**
 * Connect-a-Page modal (Auto: App creds + user token → /me/accounts → pick a
 * Page; or Manual: paste a Page token). Shared by the Share flow (Step 1) and the
 * Pages manager. All tokens are validated + stored encrypted server-side.
 */
export function ConnectModal({
  onClose,
  onConnected,
  onError,
}: {
  onClose: () => void;
  onConnected: () => void;
  onError: (m: string) => void;
}) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");

  // Shared category/niche group.
  const [categoryGroup, setCategoryGroup] = useState<string>(FACEBOOK_CATEGORY_GROUPS[0]);
  const [customGroup, setCustomGroup] = useState("");
  const group = categoryGroup === "__custom__" ? customGroup.trim() : categoryGroup;

  // Auto mode (App creds + user token → /me/accounts → pick Page).
  const [appId, setAppId] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [userToken, setUserToken] = useState("");
  const [pages, setPages] = useState<{ id: string; name: string }[] | null>(null);
  const [selectedPage, setSelectedPage] = useState("");

  // Manual mode (paste a Page token).
  const [pageId, setPageId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [exchange, setExchange] = useState(false);

  const [busy, setBusy] = useState(false);

  async function onFetch(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await facebookFetchPages({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      userToken: userToken.trim(),
    });
    setBusy(false);
    if (!res.ok) return onError(res.error);
    setPages(res.data.pages);
    setSelectedPage(res.data.pages[0]?.id ?? "");
  }

  // One pass: save the new token + re-grant EVERY connected Page's token from it.
  async function onReconnectAll() {
    if (!userToken.trim()) return onError("Paste your user access token first.");
    setBusy(true);
    const res = await facebookReconnectAll({
      appId: appId.trim(),
      appSecret: appSecret.trim(),
      userToken: userToken.trim(),
    });
    setBusy(false);
    if (res.ok) onConnected();
    else onError(res.error);
  }

  async function onConnectAuto(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPage) return onError("Pick a Page.");
    if (!group) return onError("Choose a category group.");
    setBusy(true);
    const res = await facebookConnectPage({ pageId: selectedPage, categoryGroup: group });
    setBusy(false);
    if (res.ok) onConnected();
    else onError(res.error);
  }

  async function onConnectManual(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await connectFacebookPage({
      pageId: pageId.trim(),
      accessToken: accessToken.trim(),
      categoryGroup: group,
      exchange,
    });
    setBusy(false);
    if (res.ok) onConnected();
    else onError(res.error);
  }

  const groupFields = (
    <>
      <label className="adm-field">
        <span>Category / Niche Group</span>
        <select className="adm-input" value={categoryGroup} onChange={(e) => setCategoryGroup(e.target.value)}>
          {FACEBOOK_CATEGORY_GROUPS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
          <option value="__custom__">Custom…</option>
        </select>
      </label>
      {categoryGroup === "__custom__" && (
        <label className="adm-field">
          <span>Custom group name</span>
          <input className="adm-input" value={customGroup} onChange={(e) => setCustomGroup(e.target.value)} placeholder="e.g. Lifestyle" required />
        </label>
      )}
    </>
  );

  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div className="adm-modal" role="dialog" aria-modal="true" aria-label="Connect a Facebook Page" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h2 className="adm-serif">Connect a Facebook Page</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="adm-modal-body">
          <div className="adm-seg" role="tablist" aria-label="Connect method" style={{ marginBottom: 14 }}>
            <button type="button" role="tab" aria-selected={mode === "auto"} className={`adm-seg-btn ${mode === "auto" ? "on" : ""}`} onClick={() => setMode("auto")}>
              Auto (recommended)
            </button>
            <button type="button" role="tab" aria-selected={mode === "manual"} className={`adm-seg-btn ${mode === "manual" ? "on" : ""}`} onClick={() => setMode("manual")}>
              Paste a Page token
            </button>
          </div>

          {mode === "auto" ? (
            pages === null ? (
              <form onSubmit={onFetch}>
                <p className="adm-field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                  Paste your <strong>App ID</strong> + <strong>App Secret</strong> (App Dashboard → Settings → Basic) and a
                  short-lived <strong>User token</strong> from the Graph API Explorer. Grant <strong>all</strong> of these
                  scopes: <code>pages_show_list</code>, <code>pages_manage_posts</code>, <code>pages_read_engagement</code>,{" "}
                  <code>pages_manage_engagement</code> (needed to comment as the Page), <code>read_insights</code> (optional —
                  reach/views) <em>+ <code>business_management</code> if your Pages are in a Business Manager</em>. We exchange
                  it for a long-lived token, stored encrypted server-side.
                  <br />
                  <strong>Re-granting scopes?</strong> Generate a new token with the scopes above and click{" "}
                  <strong>“Reconnect ALL pages”</strong> — it refreshes every connected Page’s token in one pass.
                </p>
                <label className="adm-field">
                  <span>App ID</span>
                  <input className="adm-input" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="e.g. 1234567890" required autoFocus />
                </label>
                <label className="adm-field">
                  <span>App Secret</span>
                  <input className="adm-input" type="password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="Stored encrypted (AES-256-GCM)" required />
                </label>
                <label className="adm-field">
                  <span>User Access Token (short-lived is fine)</span>
                  <textarea className="adm-input" value={userToken} onChange={(e) => setUserToken(e.target.value)} rows={3} placeholder="Paste the token from Graph API Explorer" required style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
                </label>
                <div className="adm-modal-foot" style={{ flexWrap: "wrap", gap: 8 }}>
                  <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                  <button type="button" className="adm-btn-ghost" onClick={onReconnectAll} disabled={busy} title="Save this token + refresh every connected Page's token in one pass">
                    {busy && <span className="adm-spinner" aria-hidden />}
                    Reconnect ALL pages
                  </button>
                  <button type="submit" className="adm-btn-primary" disabled={busy}>
                    {busy && <span className="adm-spinner" aria-hidden />}
                    {busy ? "Fetching…" : "Fetch my Pages"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={onConnectAuto}>
                <p className="adm-field-hint" style={{ marginTop: 0, marginBottom: 12 }}>
                  Found {pages.length} Page{pages.length === 1 ? "" : "s"}. Choose the one to connect.
                </p>
                <label className="adm-field">
                  <span>Page</span>
                  <select className="adm-input" value={selectedPage} onChange={(e) => setSelectedPage(e.target.value)}>
                    {pages.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                {groupFields}
                <div className="adm-modal-foot">
                  <button type="button" className="adm-btn-ghost" onClick={() => setPages(null)} disabled={busy}>Back</button>
                  <button type="submit" className="adm-btn-primary" disabled={busy}>
                    {busy && <span className="adm-spinner" aria-hidden />}
                    {busy ? "Connecting…" : "Connect Page"}
                  </button>
                </div>
              </form>
            )
          ) : (
            <form onSubmit={onConnectManual}>
              <label className="adm-field">
                <span>Page ID</span>
                <input className="adm-input" value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="e.g. 1234567890" required />
              </label>
              <label className="adm-field">
                <span>Page Access Token</span>
                <textarea className="adm-input" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="Paste a long-lived Page access token" rows={3} required style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5 }} />
                <span className="adm-field-hint">Stored encrypted (AES-256-GCM). Validated against the Graph API before saving.</span>
              </label>
              {groupFields}
              <label className="adm-check" style={{ marginTop: 2 }}>
                <input type="checkbox" checked={exchange} onChange={(e) => setExchange(e.target.checked)} />
                <span>
                  This is a short-lived <strong>user</strong> token — exchange it for a long-lived one
                  <span className="adm-field-hint" style={{ display: "block" }}>
                    Requires App ID + Secret (set them in the Auto tab, or via env).
                  </span>
                </span>
              </label>
              <div className="adm-modal-foot">
                <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
                <button type="submit" className="adm-btn-primary" disabled={busy}>
                  {busy && <span className="adm-spinner" aria-hidden />}
                  {busy ? "Validating…" : "Validate & Connect"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
