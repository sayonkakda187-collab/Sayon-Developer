"use client";

import { useRef, useState } from "react";
import { ImageIcon, TrashIcon } from "@/components/admin/icons";

/**
 * Featured image picker for a WordPress post: click or drop a file, it is
 * uploaded to the WordPress media library, and the attachment id becomes the
 * post's `featured_media`.
 *
 * The id is what WordPress actually stores, so it stays visible rather than
 * being hidden behind the thumbnail — and an existing id can still be typed in
 * directly, which is the only way to reuse an image already in the library.
 *
 * WHY THE BROWSER RESIZES FIRST. A serverless request body over ~4.5 MB is
 * rejected by the platform before it reaches the route, which would surface as
 * an opaque failure rather than "too big". Phone photos routinely exceed that.
 * Downscaling here keeps ordinary uploads well inside the limit, and the route
 * still enforces its own cap for anything that slips past.
 */

const MAX_EDGE = 1600;        // WordPress generates its own smaller sizes from this
const RESIZE_OVER_BYTES = 1.5 * 1024 * 1024;
const JPEG_QUALITY = 0.85;

type Preview = { url: string; title: string } | null;

/** Downscales large images; returns the original when there is nothing to gain. */
async function prepareImage(file: File): Promise<File> {
  // Re-encoding a GIF through a canvas would drop every frame but the first.
  if (file.type === "image/gif") return file;

  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file; // unreadable here — let the server decide

  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest <= MAX_EDGE && file.size <= RESIZE_OVER_BYTES) {
    bitmap.close?.();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE / longest);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) { bitmap.close?.(); return file; }
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) return file;
  // Only take the re-encode if it actually helped.
  if (blob.size >= file.size && longest <= MAX_EDGE) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}

export function WordPressFeaturedImage({
  mediaId, preview, onChange, disabled,
}: {
  mediaId: string;
  preview: Preview;
  onChange: (id: string, preview: Preview) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const prepared = await prepareImage(file);
      const body = new FormData();
      body.append("file", prepared);
      const res = await fetch("/api/admin/wordpress/media", { method: "POST", body });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? `Upload failed (${res.status}).`);
        return;
      }
      onChange(String(json.media.id), { url: json.media.url, title: json.media.title });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  function pick(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("That is not an image file.");
      return;
    }
    void upload(file);
  }

  const busy = !!disabled || uploading;

  return (
    <div className="adm-field">
      <span>
        Featured image
        {mediaId && <span className="adm-field-hint" style={{ display: "inline" }}> · WordPress media #{mediaId}</span>}
      </span>

      {mediaId ? (
        <div style={{
          display: "flex", alignItems: "center", gap: 12, padding: 10,
          border: "1px solid var(--adm-bd)", borderRadius: 12, background: "var(--adm-card)",
        }}>
          <div style={{
            width: 96, height: 64, flex: "none", borderRadius: 8, overflow: "hidden",
            background: "var(--adm-bg-2, rgba(128,128,128,0.12))",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {preview?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <ImageIcon className="h-5 w-5" />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {preview?.title || `Media #${mediaId}`}
            </div>
            <div className="adm-card-sub" style={{ marginTop: 2 }}>
              {preview?.url
                ? "Uploaded to your WordPress media library."
                : "Already set on this post. Upload a new image to replace it."}
            </div>
          </div>
          <button
            type="button" className="adm-btn-ghost" disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Replace
          </button>
          <button
            type="button" className="adm-btn-ghost adm-fb-act adm-fb-danger" disabled={busy}
            onClick={() => { onChange("", null); setError(null); }}
            title="Remove the featured image"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pick(e.dataTransfer.files); }}
          style={{
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
            gap: 6, width: "100%", minHeight: 96, padding: 16, cursor: busy ? "default" : "pointer",
            border: `1.5px dashed ${dragging ? "var(--section-accent)" : "var(--adm-bd)"}`,
            borderRadius: 12, textAlign: "center",
            background: dragging ? "rgb(var(--sa) / 0.08)" : "var(--adm-card)",
            color: "var(--adm-ink-2, inherit)", transition: "border-color .15s, background .15s",
          }}
        >
          {uploading ? (
            <>
              <span className="adm-spinner" aria-hidden />
              <span style={{ fontSize: 13 }}>Uploading to WordPress…</span>
            </>
          ) : (
            <>
              <ImageIcon className="h-6 w-6" />
              <span style={{ fontSize: 13, fontWeight: 600 }}>
                {dragging ? "Drop to upload" : "Drop an image here, or click to choose"}
              </span>
              <span className="adm-field-hint">
                JPEG, PNG, WebP, GIF or AVIF. Large images are resized before upload.
              </span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef} type="file" accept="image/*" hidden
        onChange={(e) => { pick(e.target.files); e.target.value = ""; }}
      />

      {error && <span style={{ color: "rgb(190,60,60)", fontSize: 12 }}>{error}</span>}

      <details style={{ marginTop: 2 }}>
        <summary className="adm-field-hint" style={{ cursor: "pointer" }}>
          Or use an image already in your media library
        </summary>
        <input
          className="adm-input" value={mediaId} inputMode="numeric" style={{ marginTop: 6 }}
          onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, ""), null)}
          placeholder="WordPress media ID, e.g. 1234"
          disabled={busy}
        />
      </details>
    </div>
  );
}
