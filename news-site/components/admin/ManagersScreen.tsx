"use client";

import { useMemo, useState } from "react";
import { PlusIcon, PencilIcon, TrashIcon, SearchIcon, CloseIcon } from "@/components/admin/icons";
import { FacebookPageAvatar } from "@/components/admin/FacebookPageAvatar";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { ManagerDialog } from "@/components/admin/ManagerDialog";

/** A monitored page, as far as the managers screen needs it (id · name · avatar). */
export type ManagedPage = { id: string; name: string; avatarUrl: string | null };

/**
 * The "Managers" sub-tab: a list of page managers (team members) with avatar, name
 * and a live "manages N pages" count. Add / edit (name + photo) / delete a manager;
 * deleting unassigns them from their pages (the pages stay). Expand a manager to add
 * or remove the Pages they own. All mutations flow up to PageControlTabs, which keeps
 * the Pages tab and this screen in sync.
 */
export function ManagersScreen({
  managers,
  pages,
  assignments,
  onCreate,
  onUpdate,
  onDelete,
  onAssign,
  onError,
}: {
  managers: Manager[];
  pages: ManagedPage[];
  assignments: Record<string, string | null>;
  onCreate: (input: { name: string; photo: string | null }) => Promise<Manager | null>;
  onUpdate: (id: string, input: { name?: string; photo?: string | null }) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
  onAssign: (pageId: string, managerId: string | null) => Promise<boolean>;
  onError: (m: string) => void;
}) {
  const [dialog, setDialog] = useState<{ mode: "add" } | { mode: "edit"; manager: Manager } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<Manager | null>(null);

  const nameById = useMemo(() => new Map(managers.map((m) => [m.id, m.name])), [managers]);
  const countFor = (id: string) => pages.reduce((n, p) => n + (assignments[p.id] === id ? 1 : 0), 0);

  return (
    <div className="adm-mgr-screen">
      <div className="adm-list-head" style={{ alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="adm-fb-sub">{managers.length} {managers.length === 1 ? "manager" : "managers"}</span>
        <button type="button" className="adm-btn-primary" onClick={() => setDialog({ mode: "add" })}>
          <PlusIcon className="h-4 w-4" /> Add manager
        </button>
      </div>

      {managers.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: "28px 18px", marginTop: 10 }}>
          <div className="adm-card-title" style={{ fontSize: 17 }}>No managers yet</div>
          <p className="adm-card-sub" style={{ maxWidth: 440, margin: "8px auto 14px" }}>
            Add team members and assign them to the Pages they manage. Managers are local app data (a name + optional
            photo) — never linked to Facebook tokens.
          </p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <button type="button" className="adm-btn-primary" onClick={() => setDialog({ mode: "add" })}>
              <PlusIcon className="h-4 w-4" /> Add manager
            </button>
          </div>
        </div>
      ) : (
        <div className="adm-mgr-list">
          {managers.map((m) => {
            const n = countFor(m.id);
            const isOpen = expanded === m.id;
            return (
              <div key={m.id} className={`adm-card adm-mgr-card ${isOpen ? "on" : ""}`}>
                <div className="adm-mgr-row">
                  <button type="button" className="adm-mgr-main" onClick={() => setExpanded(isOpen ? null : m.id)} aria-expanded={isOpen}>
                    <ManagerAvatar name={m.name} photo={m.photo} size={38} />
                    <span className="adm-mgr-meta">
                      <span className="adm-mgr-name">{m.name}</span>
                      <span className="adm-card-sub">manages {n} {n === 1 ? "page" : "pages"}</span>
                    </span>
                    <span className={`adm-mgr-caret ${isOpen ? "on" : ""}`} aria-hidden>›</span>
                  </button>
                  <div className="adm-mgr-tools">
                    <button type="button" className="adm-iconbtn" aria-label={`Edit ${m.name}`} onClick={() => setDialog({ mode: "edit", manager: m })}>
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button type="button" className="adm-iconbtn" aria-label={`Delete ${m.name}`} onClick={() => setConfirmDel(m)}>
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {isOpen && (
                  <ManagerPages manager={m} pages={pages} assignments={assignments} nameById={nameById} onAssign={onAssign} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {dialog && (
        <ManagerDialog
          initial={dialog.mode === "edit" ? dialog.manager : undefined}
          onClose={() => setDialog(null)}
          onError={onError}
          onSave={async ({ name, photo }) => {
            if (dialog.mode === "edit") return onUpdate(dialog.manager.id, { name, photo });
            return (await onCreate({ name, photo })) != null;
          }}
        />
      )}

      {confirmDel && (
        <ConfirmDelete
          manager={confirmDel}
          count={countFor(confirmDel.id)}
          onClose={() => setConfirmDel(null)}
          onConfirm={async () => {
            const ok = await onDelete(confirmDel.id);
            if (ok) setConfirmDel(null);
            return ok;
          }}
        />
      )}
    </div>
  );
}

/** Expanded panel: add/remove the pages a manager owns. A checked toggle = managed by
 *  this manager; toggling assigns/unassigns instantly. Pages owned by someone else show
 *  that owner (assigning moves them). Searchable when there are many pages. */
function ManagerPages({
  manager,
  pages,
  assignments,
  nameById,
  onAssign,
}: {
  manager: Manager;
  pages: ManagedPage[];
  assignments: Record<string, string | null>;
  nameById: Map<string, string>;
  onAssign: (pageId: string, managerId: string | null) => Promise<boolean>;
}) {
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const s = q.trim().toLowerCase();
  const visible = s ? pages.filter((p) => p.name.toLowerCase().includes(s)) : pages;
  const mine = visible.filter((p) => assignments[p.id] === manager.id);
  const others = visible.filter((p) => assignments[p.id] !== manager.id);

  async function toggle(pageId: string, on: boolean) {
    setBusyId(pageId);
    await onAssign(pageId, on ? manager.id : null);
    setBusyId(null);
  }

  if (pages.length === 0) {
    return (
      <div className="adm-mgr-pages">
        <p className="adm-card-sub" style={{ margin: "4px 2px" }}>No monitored Pages yet — connect Pages in the Pages tab first.</p>
      </div>
    );
  }

  return (
    <div className="adm-mgr-pages">
      {pages.length > 6 && (
        <label className="adm-mgr-search">
          <SearchIcon className="h-4 w-4" />
          <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Pages…" aria-label="Search Pages" />
        </label>
      )}
      {mine.length > 0 && <div className="adm-mgr-pages-h">Managed by {manager.name}</div>}
      {mine.map((p) => (
        <PageToggle key={p.id} page={p} checked busy={busyId === p.id} onChange={() => toggle(p.id, false)} />
      ))}
      {others.length > 0 && <div className="adm-mgr-pages-h">Add a Page</div>}
      {others.map((p) => {
        const ownerId = assignments[p.id];
        const ownerName = ownerId && ownerId !== manager.id ? nameById.get(ownerId) ?? null : null;
        return <PageToggle key={p.id} page={p} checked={false} busy={busyId === p.id} ownerName={ownerName} onChange={() => toggle(p.id, true)} />;
      })}
      {visible.length === 0 && <p className="adm-card-sub" style={{ margin: "4px 2px" }}>No Pages match “{q.trim()}”.</p>}
    </div>
  );
}

function PageToggle({
  page,
  checked,
  busy,
  ownerName,
  onChange,
}: {
  page: ManagedPage;
  checked: boolean;
  busy: boolean;
  ownerName?: string | null;
  onChange: () => void;
}) {
  return (
    <button type="button" className={`adm-mgr-ptoggle ${checked ? "on" : ""}`} onClick={onChange} disabled={busy} aria-pressed={checked}>
      <span className={`adm-mgr-check ${checked ? "on" : ""}`} aria-hidden>{checked ? "✓" : "+"}</span>
      <FacebookPageAvatar dbId={page.id} name={page.name} avatarUrl={page.avatarUrl} size={26} />
      <span className="adm-mgr-pname">{page.name}</span>
      {!checked && ownerName && <span className="adm-mgr-pown">· {ownerName}</span>}
      {busy && <span className="adm-spinner" aria-hidden style={{ marginLeft: "auto" }} />}
    </button>
  );
}

function ConfirmDelete({
  manager,
  count,
  onClose,
  onConfirm,
}: {
  manager: Manager;
  count: number;
  onClose: () => void;
  onConfirm: () => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div className="adm-modal adm-mgr-confirm" role="dialog" aria-modal="true" aria-label={`Delete ${manager.name}`} onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h2 className="adm-serif">Delete manager</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="adm-modal-body">
          <p className="adm-field-hint" style={{ margin: 0 }}>
            Delete <strong>{manager.name}</strong>?{" "}
            {count > 0
              ? `This unassigns them from ${count} ${count === 1 ? "Page" : "Pages"} (the Pages stay).`
              : "They manage no Pages."}{" "}
            This can’t be undone.
          </p>
          <div className="adm-modal-foot">
            <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="adm-btn-danger"
              onClick={async () => {
                setBusy(true);
                const ok = await onConfirm();
                if (!ok) setBusy(false);
              }}
              disabled={busy}
            >
              {busy && <span className="adm-spinner" aria-hidden />}
              {busy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
