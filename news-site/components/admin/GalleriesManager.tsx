"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import type { Gallery } from "@/lib/galleries";
import { upload } from "@vercel/blob/client";
import {
  createGalleryAction,
  deleteGalleryAction,
  renameGalleryAction,
  setGalleryEnabledAction,
  setGalleryImagesAction,
  setGalleryVideosAction,
} from "@/app/admin/gallery-actions";

// Downscale a picked image before upload to stay well under Vercel's ~4.5 MB
// request-body limit (galleries can hold many large photos). Falls back to the
// original file if canvas encoding isn't available.
async function downscale(file: File, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", 0.85),
    );
  } catch {
    return file;
  }
}

async function uploadOne(file: File): Promise<string> {
  const blob = await downscale(file);
  const name = `${file.name.replace(/\.[^.]+$/, "") || "image"}.jpg`;
  const fd = new FormData();
  fd.append("file", new File([blob], name, { type: "image/jpeg" }));
  const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) throw new Error(data.error || "Upload failed.");
  return data.url;
}

// Videos are large, so they upload BROWSER → Vercel Blob directly (no ~4.5 MB
// serverless body limit); /api/admin/blob-upload only mints the admin token.
async function uploadVideo(file: File, onProgress?: (pct: number) => void): Promise<string> {
  const blob = await upload(`gallery-videos/${file.name}`, file, {
    access: "public",
    handleUploadUrl: "/api/admin/blob-upload",
    contentType: file.type || "video/mp4",
    onUploadProgress: onProgress ? (e) => onProgress(Math.round(e.percentage)) : undefined,
  });
  return blob.url;
}

type LiveInfo = { count: number; countries: Record<string, number>; devices: Record<string, number> };

// Alpha-2 country code → flag emoji (regional indicators); unknown / "ZZ" → 🌐.
function flag(cc: string): string {
  if (!/^[A-Za-z]{2}$/.test(cc) || cc.toUpperCase() === "ZZ") return "🌐";
  return String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function GalleriesManager({
  galleries,
  baseUrl,
}: {
  galleries: Gallery[];
  baseUrl: string;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [live, setLive] = useState<Record<string, LiveInfo>>({});

  // Poll live viewer counts for all galleries every ~7s.
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/galleries/live", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { live?: Record<string, LiveInfo> };
        if (alive) setLive(data.live || {});
      } catch {
        /* ignore transient errors */
      }
    };
    load();
    const iv = window.setInterval(load, 7000);
    return () => {
      alive = false;
      window.clearInterval(iv);
    };
  }, []);

  function create() {
    const t = title.trim();
    if (!t) return;
    startTransition(async () => {
      const res = await createGalleryAction(t);
      if (res.ok) {
        setTitle("");
        success("Gallery created.");
        router.refresh();
      } else error(res.error);
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-4">
        <input
          className="adm-input min-w-[220px] flex-1"
          placeholder="New gallery title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <button
          type="button"
          onClick={create}
          disabled={pending || !title.trim()}
          className="rounded-lg bg-[rgb(var(--section-accent))] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Create gallery
        </button>
      </div>

      {galleries.length === 0 ? (
        <p className="text-fg-muted">No galleries yet. Create one above.</p>
      ) : (
        <ul className="space-y-6">
          {galleries.map((g) => (
            <GalleryCard key={g.token} gallery={g} baseUrl={baseUrl} live={live[g.token]} />
          ))}
        </ul>
      )}
    </div>
  );
}

function GalleryCard({
  gallery,
  baseUrl,
  live,
}: {
  gallery: Gallery;
  baseUrl: string;
  live?: LiveInfo;
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [name, setName] = useState(gallery.title);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);

  const link = `${baseUrl.replace(/\/$/, "")}/g/${gallery.token}`;

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        try {
          urls.push(await uploadOne(f));
        } catch (e) {
          error(e instanceof Error ? e.message : "Upload failed.");
        }
      }
      if (urls.length) {
        const res = await setGalleryImagesAction(gallery.token, [...gallery.images, ...urls]);
        if (res.ok) {
          success(`${urls.length} image${urls.length > 1 ? "s" : ""} added.`);
          router.refresh();
        } else error(res.error);
      }
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeImage(idx: number) {
    startTransition(async () => {
      const res = await setGalleryImagesAction(
        gallery.token,
        gallery.images.filter((_, i) => i !== idx),
      );
      if (res.ok) router.refresh();
      else error(res.error);
    });
  }

  async function onVideoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setVideoBusy(true);
    setVideoProgress(0);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) {
        try {
          urls.push(await uploadVideo(f, setVideoProgress));
        } catch (e) {
          error(e instanceof Error ? e.message : "Video upload failed.");
        }
      }
      if (urls.length) {
        const res = await setGalleryVideosAction(gallery.token, [...gallery.videos, ...urls]);
        if (res.ok) {
          success(`${urls.length} video${urls.length > 1 ? "s" : ""} added.`);
          router.refresh();
        } else error(res.error);
      }
    } finally {
      setVideoBusy(false);
      setVideoProgress(0);
      if (videoRef.current) videoRef.current.value = "";
    }
  }

  function removeVideo(idx: number) {
    startTransition(async () => {
      const res = await setGalleryVideosAction(
        gallery.token,
        gallery.videos.filter((_, i) => i !== idx),
      );
      if (res.ok) router.refresh();
      else error(res.error);
    });
  }

  function rename() {
    if (name.trim() === gallery.title || !name.trim()) {
      setName(gallery.title);
      return;
    }
    startTransition(async () => {
      const res = await renameGalleryAction(gallery.token, name);
      if (res.ok) {
        success("Renamed.");
        router.refresh();
      } else {
        setName(gallery.title);
        error(res.error);
      }
    });
  }

  function toggleEnabled() {
    startTransition(async () => {
      const res = await setGalleryEnabledAction(gallery.token, !gallery.enabled);
      if (res.ok) {
        success(gallery.enabled ? "Gallery disabled." : "Gallery enabled.");
        router.refresh();
      } else error(res.error);
    });
  }

  function remove() {
    if (!confirm(`Delete "${gallery.title}"? The secret link will stop working.`)) return;
    startTransition(async () => {
      const res = await deleteGalleryAction(gallery.token);
      if (res.ok) {
        success("Gallery deleted.");
        router.refresh();
      } else error(res.error);
    });
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      error("Copy failed — select the link and copy it manually.");
    }
  }

  return (
    <li className="rounded-xl border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <input
          className="adm-input min-w-[200px] flex-1 font-semibold"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={rename}
          onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            gallery.enabled
              ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
              : "bg-surface-2 text-fg-faint"
          }`}
        >
          {gallery.enabled ? "Live" : "Disabled"}
        </span>
        <button
          type="button"
          onClick={toggleEnabled}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-2"
        >
          {gallery.enabled ? "Disable" : "Enable"}
        </button>
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-500/10 dark:text-red-400"
        >
          Delete
        </button>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {live && live.count > 0 ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {live.count} watching now
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-fg-faint">
            <span className="h-2 w-2 rounded-full bg-fg-faint" />
            No one watching
          </span>
        )}
        {live && live.count > 0 && (
          <span className="text-fg-muted">
            {Object.entries(live.countries)
              .sort((a, b) => b[1] - a[1])
              .map(([cc, n]) => `${flag(cc)} ${n}`)
              .join("  ")}
            {"   ·   "}
            {Object.entries(live.devices)
              .sort((a, b) => b[1] - a[1])
              .map(([d, n]) => `${n} ${d}`)
              .join(" · ")}
          </span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-2">
        <code className="min-w-[200px] flex-1 truncate px-1 text-xs text-fg-muted">{link}</code>
        <button
          type="button"
          onClick={copyLink}
          className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold hover:bg-surface-2"
        >
          {copied ? "Copied!" : "Copy link"}
        </button>
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border border-border bg-surface px-3 py-1 text-xs font-semibold hover:bg-surface-2"
        >
          Open
        </a>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-fg-muted">
            {gallery.images.length} image{gallery.images.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy || pending}
            className="rounded-lg bg-[rgb(var(--section-accent))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Uploading…" : "Upload images"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>
        {gallery.images.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {gallery.images.map((src, i) => (
              <div
                key={src + i}
                className="group relative aspect-square overflow-hidden rounded-lg bg-surface-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  disabled={pending}
                  aria-label="Remove image"
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-sm font-medium text-fg-muted">
            {gallery.videos.length} video{gallery.videos.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => videoRef.current?.click()}
            disabled={videoBusy || pending}
            className="rounded-lg bg-[rgb(var(--section-accent))] px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {videoBusy ? `Uploading… ${videoProgress}%` : "Upload videos"}
          </button>
          <input
            ref={videoRef}
            type="file"
            accept="video/*"
            multiple
            hidden
            onChange={(e) => onVideoFiles(e.target.files)}
          />
        </div>
        {gallery.videos.length > 0 && (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {gallery.videos.map((src, i) => (
              <div key={src + i} className="group relative overflow-hidden rounded-lg bg-black">
                <video src={src} controls preload="metadata" className="aspect-video w-full" />
                <button
                  type="button"
                  onClick={() => removeVideo(i)}
                  disabled={pending}
                  aria-label="Remove video"
                  className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <span aria-hidden>×</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}
