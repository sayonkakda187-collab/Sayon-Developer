"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ManagerAvatar } from "@/components/admin/ManagerAvatar";

// Manager avatars are shown as small circles (~22–38px), so a 256px square is plenty.
const AVATAR_PX = 256;
const JPEG_QUALITY = 0.85;

/**
 * Downscale + re-encode a picked image to a small square JPEG on the client BEFORE
 * upload — mirroring the avatar/cover flows (which crop to a bounded JPEG via canvas).
 * This keeps the request body tiny (well under Vercel's ~4.5 MB function-body limit)
 * and normalises the MIME to image/jpeg, so HEIC/large phone photos work too. We
 * centre-crop to a square so the circular avatar fills cleanly.
 */
async function toSquareJpeg(file: File): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error("Couldn’t read that image — try a JPEG or PNG."));
      im.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    if (!side) throw new Error("Couldn’t read that image — try a JPEG or PNG.");
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_PX;
    canvas.height = AVATAR_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn’t process the image.");
    ctx.drawImage(img, sx, sy, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("Couldn’t process the image.");
    return new File([blob], "manager.jpg", { type: "image/jpeg" });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Reusable manager-photo picker: a live avatar preview (uploaded photo or initials)
 * plus Upload / Change / Remove. The chosen image is downscaled to a small square JPEG
 * on the client, then sent to the existing /api/admin/upload (Vercel Blob in prod,
 * ./public/uploads locally) and the resulting URL is reported back via onChange.
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
    // Some HEIC pickers report an empty type; let the decode step be the real gate.
    if (file.type && !file.type.startsWith("image/")) return onError("Please choose an image file.");
    setBusy(true);
    try {
      const small = await toSquareJpeg(file);
      const fd = new FormData();
      fd.append("file", small);
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
