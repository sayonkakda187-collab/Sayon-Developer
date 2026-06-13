"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ManagerAvatar } from "@/components/admin/ManagerAvatar";

/**
 * Reusable manager-photo picker: a live avatar preview (uploaded photo or initials)
 * plus Upload / Change / Remove. The chosen image is sent to the existing
 * /api/admin/upload (Vercel Blob in prod, ./public/uploads locally) and the resulting
 * URL is reported back via onChange — exactly the same safe, server-side image
 * handling used for the admin profile picture. Shared by the Add/Edit dialog and the
 * per-row "add new" quick-create.
 */
export function ManagerPhotoInput({
  name,
  photo,
  onChange,
  onError,
  disabled,
  size = 56,
}: {
  name: string;
  photo: string | null;
  onChange: (url: string | null) => void;
  onError: (m: string) => void;
  disabled?: boolean;
  size?: number;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const lock = disabled || busy;

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return onError("Please choose an image file.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed.");
      onChange(data.url);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn’t upload the photo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-mgr-photo">
      <ManagerAvatar name={name || "?"} photo={photo} size={size} />
      <div className="adm-mgr-photo-actions">
        <button type="button" className="adm-btn-ghost" onClick={() => fileRef.current?.click()} disabled={lock}>
          {busy ? "Uploading…" : photo ? "Change photo" : "Upload photo"}
        </button>
        {photo && !busy && (
          <button type="button" className="adm-btn-ghost" onClick={() => onChange(null)} disabled={lock}>
            Remove
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} hidden />
      </div>
    </div>
  );
}
