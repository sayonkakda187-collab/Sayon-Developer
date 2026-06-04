"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { AdminAvatar } from "@/components/admin/AdminAvatar";
import { CoverCropModal, type CropAspect } from "@/components/admin/CoverCropModal";
import { updateAdminAvatar } from "@/app/admin/settings-actions";

// Lock the avatar crop to a 1:1 square (the cropper hides its preset switcher).
const SQUARE: CropAspect[] = [{ id: "square", label: "Square", ratio: 1 }];

/**
 * Profile-picture section of Settings. Upload an image, crop it square (reusing
 * the cover cropper), store it via the existing /api/admin/upload (Blob), and
 * save the URL on the admin user. Falls back to initials; Remove reverts.
 */
export function SettingsProfile({
  avatarUrl,
  initials,
}: {
  avatarUrl: string | null;
  initials: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [src, setSrc] = useState<string | null>(null); // object URL fed to the cropper
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type.startsWith("image/")) return error("Please choose an image file.");
    setSrc(URL.createObjectURL(file));
  }

  async function onApply(blob: Blob) {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) throw new Error(data.error || "Upload failed.");
      const saved = await updateAdminAvatar(data.url);
      if (!saved.ok) throw new Error(saved.error);
      success("Profile picture updated.");
      setSrc(null);
      router.refresh();
    } catch (e) {
      error(e instanceof Error ? e.message : "Couldn’t update the picture.");
    } finally {
      setBusy(false);
    }
  }

  async function onRemove() {
    setBusy(true);
    const res = await updateAdminAvatar(null);
    setBusy(false);
    if (!res.ok) return error(res.error);
    success("Profile picture removed.");
    router.refresh();
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-card-title">Profile picture</div>
      <p className="adm-card-sub" style={{ marginTop: 4 }}>
        Shown in the top-right of the admin. A square image works best.
      </p>

      <div className="adm-prof-row">
        <span className="adm-avatar adm-avatar-lg" aria-hidden>
          <AdminAvatar avatarUrl={avatarUrl} initials={initials} />
        </span>
        <div className="adm-prof-actions">
          <button
            type="button"
            className="adm-btn-primary"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
          >
            {avatarUrl ? "Change photo" : "Upload photo"}
          </button>
          {avatarUrl && (
            <button type="button" className="adm-btn-ghost" onClick={onRemove} disabled={busy}>
              Remove
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} hidden />
        </div>
      </div>

      {src && (
        <CoverCropModal
          src={src}
          aspects={SQUARE}
          outputWidth={512}
          heading="Adjust profile picture"
          note="Drag + pinch to frame your photo · saved as a 512px square."
          busy={busy}
          onApply={onApply}
          onCancel={() => setSrc(null)}
          onExportError={(m) => error(m)}
        />
      )}
    </div>
  );
}
