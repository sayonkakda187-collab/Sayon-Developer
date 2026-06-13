"use client";

import { useMemo, useState } from "react";
import { CloseIcon, SearchIcon, CheckIcon, PlusIcon } from "@/components/admin/icons";
import { ManagerAvatar, type Manager } from "@/components/admin/ManagerAvatar";
import { ManagerPhotoInput } from "@/components/admin/ManagerPhotoInput";

/**
 * Compact per-row picker to assign a manager to ONE monitored page. Choose an
 * existing manager (assigns instantly), unassign, or quick-create a new manager
 * (name + optional photo) and assign in a single step. Rendered as a small modal so
 * it never overflows on mobile (body scrolls, ≥44px rows).
 */
export function ManagerPicker({
  pageName,
  currentId,
  managers,
  onAssign,
  onCreate,
  onClose,
  onError,
}: {
  pageName: string;
  currentId: string | null;
  managers: Manager[];
  onAssign: (managerId: string | null) => Promise<boolean>;
  onCreate: (input: { name: string; photo: string | null }) => Promise<Manager | null>;
  onClose: () => void;
  onError: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhoto, setNewPhoto] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? managers.filter((m) => m.name.toLowerCase().includes(s)) : managers;
  }, [q, managers]);

  async function choose(id: string | null) {
    setBusy(true);
    const ok = await onAssign(id);
    setBusy(false);
    if (ok) onClose();
  }

  async function createAndAssign(e: React.FormEvent) {
    e.preventDefault();
    const n = newName.trim();
    if (!n) return onError("A name is required.");
    setBusy(true);
    const m = await onCreate({ name: n, photo: newPhoto });
    if (!m) return setBusy(false);
    const ok = await onAssign(m.id);
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div className="adm-modal adm-mgr-picker" role="dialog" aria-modal="true" aria-label={`Assign a manager to ${pageName}`} onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h2 className="adm-serif">Assign manager</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="adm-modal-body">
          <p className="adm-field-hint" style={{ margin: 0 }}>Who manages <strong>{pageName}</strong>?</p>

          {adding ? (
            <form onSubmit={createAndAssign} className="adm-mgr-newform">
              <ManagerPhotoInput name={newName} photo={newPhoto} onChange={setNewPhoto} onError={onError} disabled={busy} size={48} />
              <label className="adm-field">
                <span>New manager name</span>
                <input className="adm-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Dara" required autoFocus maxLength={80} />
              </label>
              <div className="adm-modal-foot">
                <button type="button" className="adm-btn-ghost" onClick={() => setAdding(false)} disabled={busy}>Back</button>
                <button type="submit" className="adm-btn-primary" disabled={busy || !newName.trim()}>
                  {busy && <span className="adm-spinner" aria-hidden />}
                  {busy ? "Adding…" : "Add + assign"}
                </button>
              </div>
            </form>
          ) : (
            <>
              {managers.length > 6 && (
                <label className="adm-mgr-search">
                  <SearchIcon className="h-4 w-4" />
                  <input className="adm-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search managers…" aria-label="Search managers" />
                </label>
              )}
              <div className="adm-mgr-pick-list">
                {currentId && (
                  <button type="button" className="adm-mgr-pick adm-mgr-pick-unassign" onClick={() => choose(null)} disabled={busy}>
                    <span className="adm-mgr-pick-x" aria-hidden>×</span>
                    <span className="adm-mgr-pick-name">Unassign</span>
                  </button>
                )}
                {filtered.map((m) => (
                  <button key={m.id} type="button" className={`adm-mgr-pick ${m.id === currentId ? "on" : ""}`} onClick={() => choose(m.id)} disabled={busy}>
                    <ManagerAvatar name={m.name} photo={m.photo} size={26} />
                    <span className="adm-mgr-pick-name">{m.name}</span>
                    {m.id === currentId && <CheckIcon className="h-4 w-4" />}
                  </button>
                ))}
                {managers.length > 0 && filtered.length === 0 && (
                  <p className="adm-card-sub" style={{ padding: "6px 4px", margin: 0 }}>No managers match “{q.trim()}”.</p>
                )}
              </div>
              <button type="button" className="adm-mgr-addnew" onClick={() => setAdding(true)} disabled={busy}>
                <PlusIcon className="h-4 w-4" /> Add new manager
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
