"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  disconnectFacebookPage,
  refreshFacebookPage,
  setFacebookPageGroup,
  setFacebookPageIssue,
} from "@/app/admin/facebook-actions";
import { FACEBOOK_CATEGORY_GROUPS, sortCategoryGroups } from "@/lib/facebookGroups";
import { FACEBOOK_PAGE_ISSUES, sortIssues } from "@/lib/facebookIssues";
import { useToast } from "@/components/admin/Toast";
import { FacebookIcon, PlusIcon, RefreshIcon, SearchIcon, TrashIcon } from "@/components/admin/icons";
import { formatDate } from "@/lib/site";
import { ConnectModal } from "./FacebookConnectModal";

export type FacebookPageView = {
  id: string;
  pageId: string;
  pageName: string;
  categoryGroup: string;
  issue: string | null; // operational problem flag (null = healthy)
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

/** Shared column header for the page tables (manager + "Needs attention" box). */
function TableHead() {
  return (
    <thead>
      <tr>
        <th>Page Name</th>
        <th>Page ID</th>
        <th>Category Group</th>
        <th>Issue</th>
        <th>Token Status</th>
        <th style={{ textAlign: "right" }}>Actions</th>
      </tr>
    </thead>
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
  const [query, setQuery] = useState("");
  const [, startTransition] = useTransition();

  // Filter by name / id / group / issue so a Page is easy to find among many.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.pageName.toLowerCase().includes(q) ||
        p.pageId.toLowerCase().includes(q) ||
        p.categoryGroup.toLowerCase().includes(q) ||
        (p.issue?.toLowerCase().includes(q) ?? false),
    );
  }, [pages, query]);

  // Pages with an issue surface in the "Needs attention" box (and are pulled out
  // of their niche box until the issue is cleared); the rest group by niche.
  const flagged = useMemo(() => {
    const list = filtered.filter((p) => p.issue?.trim());
    const order = new Map(
      sortIssues([...new Set(list.map((p) => p.issue!.trim()))]).map((g, i) => [g, i] as const),
    );
    return [...list].sort((a, b) => {
      const d = (order.get(a.issue!.trim()) ?? 0) - (order.get(b.issue!.trim()) ?? 0);
      return d !== 0 ? d : a.pageName.localeCompare(b.pageName);
    });
  }, [filtered]);

  const healthy = useMemo(() => filtered.filter((p) => !p.issue?.trim()), [filtered]);

  // Group the healthy pages by niche/category for a scannable, grouped table.
  const grouped = useMemo(() => {
    const map = new Map<string, FacebookPageView[]>();
    for (const p of healthy) {
      const arr = map.get(p.categoryGroup) ?? [];
      arr.push(p);
      map.set(p.categoryGroup, arr);
    }
    return sortCategoryGroups([...map.keys()]).map((group) => ({
      group,
      rows: map.get(group)!,
    }));
  }, [healthy]);

  // Groups offered in the per-page "move" dropdown: the known niches + any custom
  // groups already in use, de-duped and consistently sorted.
  const groupOptions = useMemo(() => {
    const all = new Set<string>(FACEBOOK_CATEGORY_GROUPS);
    for (const p of pages) if (p.categoryGroup?.trim()) all.add(p.categoryGroup);
    return sortCategoryGroups([...all]);
  }, [pages]);

  // Issues offered in the per-page "flag" dropdown: known issues + any custom in use.
  const issueOptions = useMemo(() => {
    const all = new Set<string>(FACEBOOK_PAGE_ISSUES);
    for (const p of pages) if (p.issue?.trim()) all.add(p.issue.trim());
    return sortIssues([...all]);
  }, [pages]);

  // One-line summary of the flagged set, e.g. "2 Limited post · 1 Post failed".
  const issueSummary = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of flagged) {
      const k = p.issue!.trim();
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return sortIssues([...counts.keys()]).map((k) => `${counts.get(k)} ${k}`).join(" · ");
  }, [flagged]);

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

  // Move a page to another category group (or a brand-new one via prompt).
  async function onMoveGroup(id: string, name: string, target: string) {
    const group = target.trim();
    if (!group || group === pages.find((p) => p.id === id)?.categoryGroup) return;
    setBusyId(id);
    const res = await setFacebookPageGroup({ id, categoryGroup: group });
    setBusyId(null);
    if (res.ok) success(`Moved “${name}” to ${group}.`);
    else error(res.error);
    refresh();
  }

  // Flag / change / clear an operational issue on a page.
  async function onSetIssue(id: string, name: string, issue: string | null) {
    const val = issue?.trim() || null;
    if (val === (pages.find((p) => p.id === id)?.issue ?? null)) return;
    setBusyId(id);
    const res = await setFacebookPageIssue({ id, issue: val });
    setBusyId(null);
    if (res.ok) success(val ? `Flagged “${name}”: ${val}.` : `Cleared the issue on “${name}”.`);
    else error(res.error);
    refresh();
  }

  // One table row — shared by the niche tables and the "Needs attention" box.
  function renderRow(p: FacebookPageView) {
    const busy = busyId === p.id;
    return (
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
        <td>
          <select
            className="adm-input"
            style={{ maxWidth: 180, padding: "5px 8px", fontSize: 13 }}
            value={p.categoryGroup}
            disabled={busy}
            aria-label={`Move ${p.pageName} to another group`}
            title="Move this page to another group"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__new__") {
                const name = window.prompt(`Move “${p.pageName}” to a new group:`, "");
                if (name && name.trim()) onMoveGroup(p.id, p.pageName, name.trim());
              } else {
                onMoveGroup(p.id, p.pageName, v);
              }
            }}
          >
            {groupOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
            <option value="__new__">＋ New group…</option>
          </select>
        </td>
        <td>
          <select
            className="adm-input"
            style={{
              maxWidth: 170,
              padding: "5px 8px",
              fontSize: 13,
              ...(p.issue ? { borderColor: "#d97706", color: "#b45309", fontWeight: 600 } : {}),
            }}
            value={p.issue ?? ""}
            disabled={busy}
            aria-label={`Flag an issue for ${p.pageName}`}
            title="Flag an operational issue for this page"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__other__") {
                const name = window.prompt(`Issue for “${p.pageName}” (e.g. Limited post):`, "");
                if (name && name.trim()) onSetIssue(p.id, p.pageName, name.trim());
              } else {
                onSetIssue(p.id, p.pageName, v || null);
              }
            }}
          >
            <option value="">No issue</option>
            {issueOptions.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
            <option value="__other__">＋ Other…</option>
          </select>
        </td>
        <td><StatusBadge status={p.status} /></td>
        <td>
          <div className="adm-fb-actions">
            <button
              type="button"
              className="adm-btn-ghost adm-fb-act"
              disabled={busy}
              onClick={() => onRefreshToken(p.id, p.pageName)}
              title="Validate this token against the Graph API"
            >
              <RefreshIcon className={`h-4 w-4 ${busy ? "adm-spinning" : ""}`} />
              <span className="adm-fb-actlabel">Refresh</span>
            </button>
            <button
              type="button"
              className="adm-btn-ghost adm-fb-act adm-fb-danger"
              disabled={busy}
              onClick={() => onDisconnect(p.id, p.pageName)}
              title="Delete this page and its token"
            >
              <TrashIcon className="h-4 w-4" />
              <span className="adm-fb-actlabel">Disconnect</span>
            </button>
          </div>
        </td>
      </tr>
    );
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
      </div>

      {pages.length > 0 && (
        <label className="adm-search" style={{ maxWidth: 360, margin: "14px 0 0" }}>
          <SearchIcon className="h-4 w-4" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search pages by name, ID, group, or issue…"
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
      ) : filtered.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ marginTop: 16 }}>
          <p className="adm-card-sub">No pages match “{query}”.</p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18, marginTop: 16 }}>
          {/* Needs attention — pages the admin flagged with an operational issue */}
          {flagged.length > 0 && (
            <div
              className="adm-card adm-card-pad"
              style={{ borderColor: "rgba(217, 119, 6, 0.45)", background: "rgba(217, 119, 6, 0.05)" }}
            >
              <div className="adm-fb-grouphd" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  <span className="adm-fb-groupname" style={{ color: "#b45309" }}>⚠ Needs attention</span>
                  <span className="adm-fb-groupcount">{flagged.length}</span>
                </span>
                {issueSummary && <span className="adm-fb-sub">{issueSummary}</span>}
              </div>
              <table className="adm-table adm-fb-table">
                <TableHead />
                <tbody>{flagged.map(renderRow)}</tbody>
              </table>
            </div>
          )}

          {/* Healthy pages, grouped by niche/category */}
          {grouped.map(({ group, rows }) => (
            <div key={group} className="adm-card adm-card-pad">
              <div className="adm-fb-grouphd">
                <span className="adm-fb-groupname">{group}</span>
                <span className="adm-fb-groupcount">{rows.length}</span>
              </div>
              <table className="adm-table adm-fb-table">
                <TableHead />
                <tbody>{rows.map(renderRow)}</tbody>
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
