"use client";

import { useState } from "react";
import { CloseIcon } from "@/components/admin/icons";
import { ManagerPhotoInput } from "@/components/admin/ManagerPhotoInput";
import type { Manager } from "@/components/admin/ManagerAvatar";

/**
 * Add / edit a page manager (team member): a name + an optional uploaded photo.
 * On save it delegates to the parent (which runs the server action + optimistic
 * refresh) and closes on success. Mobile-friendly modal — body scrolls, ≥44px
 * targets, no overflow.
 */
export function ManagerDialog({
  initial,
  onClose,
  onSave,
  onError,
}: {
  initial?: Manager;
  onClose: () => void;
  onSave: (input: { name: string; photo: string | null }) => Promise<boolean>;
  onError: (m: string) => void;
}) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name ?? "");
  const [photo, setPhoto] = useState<string | null>(initial?.photo ?? null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return onError("A name is required.");
    setBusy(true);
    const ok = await onSave({ name: n, photo });
    setBusy(false);
    if (ok) onClose();
  }

  return (
    <div className="adm-modal-back" onClick={onClose} role="presentation">
      <div className="adm-modal adm-mgr-modal" role="dialog" aria-modal="true" aria-label={editing ? "Edit manager" : "Add manager"} onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-head">
          <h2 className="adm-serif">{editing ? "Edit manager" : "Add manager"}</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="adm-modal-body">
            <ManagerPhotoInput name={name} photo={photo} onChange={setPhoto} onError={onError} disabled={busy} />
            <label className="adm-field">
              <span>Name</span>
              <input className="adm-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dara" required autoFocus maxLength={80} />
            </label>
            <div className="adm-modal-foot">
              <button type="button" className="adm-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
              <button type="submit" className="adm-btn-primary" disabled={busy || !name.trim()}>
                {busy && <span className="adm-spinner" aria-hidden />}
                {busy ? "Saving…" : editing ? "Save" : "Add manager"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
