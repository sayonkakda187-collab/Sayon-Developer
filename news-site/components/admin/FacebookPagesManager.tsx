"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { useRouter } from "next/navigation";
import {
  disconnectFacebookPage,
  refreshFacebookPage,
  setFacebookPageGroup,
  setFacebookPagesGroup,
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

const AVATAR_COLORS = ["#1877f2", "#16a34a", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9"];
function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Page avatar: the real Page picture (proxied with the Page token) over a tidy
 *  coloured-initial fallback — matches the share selector's cards. */
function PageAvatar({ dbId, name, size = 38 }: { dbId: string; name: string; size?: number }) {
  const [imgOk, setImgOk] = useState(true);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        overflow: "hidden",
        background: avatarColor(dbId || name),
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.42 }}>
        {initial}
      </span>
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/admin/facebook/${encodeURIComponent(dbId)}/picture?size=${size * 2}`}
          alt=""
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

/** One box's page cards, paginated (12/page) so a big niche (or "Needs
 *  attention") doesn't make the Pages panel scroll forever. Select-all still acts
 *  on the whole group — pagination only affects what's rendered. */
function PagedGrid({
  rows,
  render,
  perPage = 12,
}: {
  rows: FacebookPageView[];
  render: (p: FacebookPageView) => ReactNode;
  perPage?: number;
}) {
  const { page, setPage, pageCount, pageItems } = usePaged(rows, perPage);
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(250px, 1fr))", gap: 12, marginTop: 10 }}>
        {pageItems.map(render)}
      </div>
      <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
    </>
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
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

  // ── Multi-select + bulk move ───────────────────────────────────────────────
  function toggleOne(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Select / unselect every row in one box (a niche group or "Needs attention").
  function setGroupSelection(rowsArr: FacebookPageView[]) {
    const allOn = rowsArr.length > 0 && rowsArr.every((r) => selectedIds.has(r.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const r of rowsArr) {
        if (allOn) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });
  }

  // Move every selected page to one group in a single request.
  async function bulkMove(target: string) {
    const group = target.trim();
    const ids = [...selectedIds];
    if (!group || ids.length === 0) return;
    setBulkBusy(true);
    const res = await setFacebookPagesGroup({ ids, categoryGroup: group });
    setBulkBusy(false);
    if (res.ok) {
      success(`Moved ${res.data.count} page${res.data.count === 1 ? "" : "s"} to ${group}.`);
      setSelectedIds(new Set());
    } else {
      error(res.error);
    }
    refresh();
  }

  // One page card — used by the niche grids and the "Needs attention" grid.
  function renderCard(p: FacebookPageView) {
    const busy = busyId === p.id;
    const selected = selectedIds.has(p.id);
    return (
      <div
        key={p.id}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 9,
          padding: 12,
          borderRadius: 14,
          background: "var(--adm-card)",
          border: selected ? "2px solid rgb(var(--accent))" : "1px solid var(--adm-bd)",
          boxShadow: selected ? "0 0 0 3px rgba(var(--accent), 0.12)" : "none",
        }}
      >
        {/* Header: select + avatar + name / status / counts */}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => toggleOne(p.id)}
            disabled={busy || bulkBusy}
            aria-label={`Select ${p.pageName}`}
            style={{ width: 16, height: 16, marginTop: 4, cursor: "pointer", flex: "none" }}
          />
          <PageAvatar dbId={p.id} name={p.pageName} />
          <span style={{ minWidth: 0, flex: 1 }}>
            <span style={{ display: "block", fontWeight: 700, color: "var(--adm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.pageName}
            </span>
            <span style={{ display: "block", marginTop: 4 }}>
              <StatusBadge status={p.status} />
            </span>
            <span className="adm-fb-sub" style={{ display: "block", marginTop: 4 }}>
              {p.postedCount} posted
              {p.pendingCount > 0 ? ` · ${p.pendingCount} scheduled` : ""}
              {p.lastSyncedAt ? ` · synced ${formatDate(p.lastSyncedAt)}` : ""}
            </span>
          </span>
        </div>

        {/* Group selector (move) */}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-fb-sub" style={{ width: 42, flex: "none" }}>Group</span>
          <select
            className="adm-input"
            style={{ flex: 1, minWidth: 0, padding: "5px 8px", fontSize: 13 }}
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
        </label>

        {/* Issue selector (flag) */}
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-fb-sub" style={{ width: 42, flex: "none" }}>Issue</span>
          <select
            className="adm-input"
            style={{
              flex: 1,
              minWidth: 0,
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
        </label>

        {/* Actions */}
        <div className="adm-fb-actions" style={{ marginTop: 2, paddingTop: 8, borderTop: "1px solid var(--adm-bd)" }}>
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
      </div>
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
        <div
          style={{
            position: "sticky",
            top: 8,
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            margin: "14px 0 0",
            padding: "10px 12px",
            background: "var(--adm-card)",
            border: "1px solid var(--adm-bd)",
            borderRadius: "var(--adm-radius)",
            boxShadow: "var(--adm-shadow)",
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
          }}
        >
          <label className="adm-search" style={{ flex: "1 1 240px", maxWidth: 420, marginTop: 0 }}>
            <SearchIcon className="h-4 w-4" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pages by name, ID, group, or issue…"
              aria-label="Search Facebook pages"
            />
          </label>

          {/* Move (bulk) — sits next to Search; active once pages are ticked */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginLeft: "auto" }}>
            {selectedIds.size > 0 && (
              <span className="adm-fb-sub" style={{ fontWeight: 600, color: "var(--adm-ink)" }}>
                {selectedIds.size} selected
              </span>
            )}
            <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <span className="adm-fb-sub">Move to</span>
              <select
                className="adm-input"
                style={{ maxWidth: 200 }}
                value=""
                disabled={bulkBusy || selectedIds.size === 0}
                aria-label="Move selected pages to a group"
                title={selectedIds.size === 0 ? "Tick one or more pages first" : "Move the selected pages to a group"}
                onChange={(e) => {
                  const v = e.target.value;
                  if (!v) return;
                  if (v === "__new__") {
                    const name = window.prompt(`Move ${selectedIds.size} selected page(s) to a new group:`, "");
                    if (name && name.trim()) bulkMove(name.trim());
                  } else {
                    bulkMove(v);
                  }
                }}
              >
                <option value="">{selectedIds.size === 0 ? "Select pages…" : "Choose group…"}</option>
                {groupOptions.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
                <option value="__new__">＋ New group…</option>
              </select>
            </label>
            {bulkBusy && <span className="adm-spinner" aria-hidden />}
            {selectedIds.size > 0 && (
              <button type="button" className="adm-btn-ghost" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>
                Clear
              </button>
            )}
          </div>
        </div>
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
                <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  {issueSummary && <span className="adm-fb-sub">{issueSummary}</span>}
                  <button type="button" className="adm-fb-grouptoggle" onClick={() => setGroupSelection(flagged)}>
                    {flagged.every((r) => selectedIds.has(r.id)) ? "Unselect all" : "Select all"}
                  </button>
                </span>
              </div>
              <PagedGrid rows={flagged} render={renderCard} />
            </div>
          )}

          {/* Healthy pages, grouped by niche/category */}
          {grouped.map(({ group, rows }) => (
            <div key={group} className="adm-card adm-card-pad">
              <div className="adm-fb-grouphd" style={{ justifyContent: "space-between" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}>
                  <span className="adm-fb-groupname">{group}</span>
                  <span className="adm-fb-groupcount">{rows.length}</span>
                </span>
                <button type="button" className="adm-fb-grouptoggle" onClick={() => setGroupSelection(rows)}>
                  {rows.every((r) => selectedIds.has(r.id)) ? "Unselect all" : "Select all"}
                </button>
              </div>
              <PagedGrid rows={rows} render={renderCard} />
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
