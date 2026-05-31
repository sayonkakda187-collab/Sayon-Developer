"use client";

import { useEffect, useRef, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { getShareInfo, type ShareInfo } from "@/app/admin/share-actions";
import {
  ShareIcon,
  CloseIcon,
  CopyIcon,
  CheckIcon,
  DownloadIcon,
  LinkIcon,
  ImageIcon,
  FacebookIcon,
} from "@/components/admin/icons";

type Phase = "loading" | "ready" | "error";

/**
 * Share / Promote panel for a PUBLISHED article. Fetches the canonical URL +
 * cover image + a ready-made caption (server action — single source of truth,
 * matches the page's Open Graph tags), then offers copy / download / "Share to
 * Facebook" tools. No automation: the Facebook button just opens the official
 * sharer dialog with the link. All clipboard/download paths degrade gracefully.
 */
export function SharePromoteModal({
  articleId,
  celebrate = false,
  onClose,
}: {
  articleId: string;
  /** Show the post-publish "Article published! 🎉" celebratory header. */
  celebrate?: boolean;
  onClose: () => void;
}) {
  const { success, error: toastError } = useToast();
  const [phase, setPhase] = useState<Phase>("loading");
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [caption, setCaption] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getShareInfo(articleId);
      if (cancelled) return;
      if (!res.ok) {
        setErrorMsg(res.error);
        setPhase("error");
        return;
      }
      setInfo(res.info);
      setCaption(res.info.caption);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [articleId]);

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  // Clipboard write with a select-the-text fallback when the API is blocked.
  async function copyText(text: string, label: string, el?: HTMLTextAreaElement | null) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        success(`${label} copied!`);
        return true;
      }
      throw new Error("no clipboard");
    } catch {
      // Fallback: select the text so the user can copy manually (Ctrl/Cmd+C).
      if (el) {
        el.focus();
        el.select();
        try {
          document.execCommand("copy");
          success(`${label} copied!`);
          return true;
        } catch {
          /* fall through */
        }
      }
      toastError("Couldn’t copy automatically — text is selected, press Ctrl/Cmd+C.");
      return false;
    }
  }

  function shareToFacebook() {
    if (!info) return;
    const sharer = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(info.url)}`;
    window.open(sharer, "_blank", "noopener,noreferrer,width=670,height=540");
  }

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-share-modal" role="dialog" aria-modal="true" aria-label="Share or promote article">
        <div className="adm-modal-head">
          <div className="adm-share-title">
            <span className="adm-share-spark" aria-hidden><ShareIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>{celebrate ? "Article published! 🎉" : "Share & promote"}</h2>
              <p className="adm-share-sub">{celebrate ? "Now share it to drive traffic." : "Post this story to Facebook and beyond."}</p>
            </div>
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="adm-modal-body adm-share-body">
          {phase === "loading" ? (
            <ShareLoading />
          ) : phase === "error" ? (
            <div className="adm-share-hint">
              <div className="adm-ill" style={{ margin: "0 auto 14px" }}><ShareIcon className="h-[30px] w-[30px]" /></div>
              <p>{errorMsg}</p>
              <button type="button" className="adm-btn-ghost" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
            </div>
          ) : info ? (
            <>
              {/* Cover image preview + image actions. */}
              <div className="adm-share-cover">
                {info.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={info.image} alt="" referrerPolicy="no-referrer" className="adm-share-cover-img"
                    onError={(e) => { e.currentTarget.style.display = "none"; }} />
                ) : (
                  <div className="adm-share-cover-empty"><ImageIcon className="h-7 w-7" /><span>No cover image</span></div>
                )}
                {info.image && <ImageActions url={info.image} onToast={success} onError={toastError} />}
              </div>

              {/* Headline. */}
              <Field label="Headline">
                <div className="adm-share-readout">
                  <span className="adm-share-headline">{info.title}</span>
                  <CopyButton onCopy={() => copyText(info.title, "Headline")} />
                </div>
              </Field>

              {/* Public URL. */}
              <Field label="Article link" icon={<LinkIcon className="h-[14px] w-[14px]" />}>
                <div className="adm-share-readout">
                  <a className="adm-share-url" href={info.url} target="_blank" rel="noopener noreferrer">{info.url}</a>
                  <CopyButton onCopy={() => copyText(info.url, "Link")} />
                </div>
              </Field>

              {/* Editable caption. */}
              <Field label="Caption">
                <CaptionBox value={caption} onChange={setCaption} onCopy={(el) => copyText(caption, "Caption", el)} />
              </Field>

              <p className="adm-share-note">
                The image, headline and link match what appears when you share on Facebook. Edit the
                caption freely, then copy or use the share button.
              </p>
            </>
          ) : null}
        </div>

        {phase === "ready" && info && (
          <div className="adm-modal-foot adm-share-foot">
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => copyText(everything(caption, info.url), "Caption + link")}
              title="Copy the caption and link together, ready to paste"
            >
              <CopyIcon className="h-4 w-4" />
              Copy everything
            </button>
            <button type="button" className="adm-btn-primary adm-share-fb" onClick={shareToFacebook}>
              <FacebookIcon className="h-4 w-4" />
              Share to Facebook
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Caption + link, ready to paste. The default caption already ends with the
 *  link; only append it if an edited caption dropped it, to avoid duplicates. */
function everything(caption: string, url: string): string {
  const text = caption.trim();
  return text.includes(url) ? text : `${text}\n\n${url}`;
}

function Field({ label, icon, children }: { label: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="adm-share-field">
      <span className="adm-share-label">{icon}{label}</span>
      {children}
    </div>
  );
}

function CopyButton({ onCopy }: { onCopy: () => void | Promise<unknown> }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="adm-share-copy"
      onClick={async () => {
        await onCopy();
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      aria-label="Copy"
    >
      {done ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function CaptionBox({
  value,
  onChange,
  onCopy,
}: {
  value: string;
  onChange: (v: string) => void;
  onCopy: (el: HTMLTextAreaElement | null) => void | Promise<unknown>;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [done, setDone] = useState(false);
  return (
    <div className="adm-share-caption">
      <textarea
        ref={ref}
        className="adm-input adm-share-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        aria-label="Shareable caption"
      />
      <button
        type="button"
        className="adm-share-copy adm-share-caption-copy"
        onClick={async () => {
          await onCopy(ref.current);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        }}
      >
        {done ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
        {done ? "Copied" : "Copy caption"}
      </button>
    </div>
  );
}

function ImageActions({
  url,
  onToast,
  onError,
}: {
  url: string;
  onToast: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = useState<null | "copy" | "download">(null);

  // Copy the actual image bits to the clipboard where supported (Chromium/Safari).
  async function copyImage() {
    setBusy("copy");
    try {
      if (!navigator.clipboard || typeof window.ClipboardItem === "undefined") {
        throw new Error("unsupported");
      }
      const res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
      const blob = await res.blob();
      // Clipboard images must be PNG in most browsers; re-encode via canvas if needed.
      const png = blob.type === "image/png" ? blob : await toPng(blob);
      await navigator.clipboard.write([new window.ClipboardItem({ "image/png": png })]);
      onToast("Image copied!");
    } catch {
      onError("Couldn’t copy the image here — use Download instead.");
    } finally {
      setBusy(null);
    }
  }

  // Download the image so it can be attached to a Facebook post.
  async function downloadImage() {
    setBusy("download");
    try {
      const res = await fetch(url, { mode: "cors", referrerPolicy: "no-referrer" });
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = filenameFromUrl(url, blob.type);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 4000);
      onToast("Image downloading…");
    } catch {
      // Last-resort fallback: open the image in a new tab to save manually.
      window.open(url, "_blank", "noopener,noreferrer");
      onError("Opened the image in a new tab — right-click to save.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="adm-share-cover-acts">
      <button type="button" className="adm-share-imgbtn" onClick={copyImage} disabled={busy !== null}>
        {busy === "copy" ? <span className="adm-spinner" aria-hidden /> : <CopyIcon className="h-4 w-4" />}
        Copy image
      </button>
      <button type="button" className="adm-share-imgbtn" onClick={downloadImage} disabled={busy !== null}>
        {busy === "download" ? <span className="adm-spinner" aria-hidden /> : <DownloadIcon className="h-4 w-4" />}
        Download
      </button>
    </div>
  );
}

/** Re-encode any image blob to PNG via canvas (for clipboard compatibility). */
function toPng(blob: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const src = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(src); return reject(new Error("no ctx")); }
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((out) => {
        URL.revokeObjectURL(src);
        if (out) resolve(out);
        else reject(new Error("encode failed"));
      }, "image/png");
    };
    img.onerror = () => { URL.revokeObjectURL(src); reject(new Error("load failed")); };
    img.src = src;
  });
}

function filenameFromUrl(url: string, mime: string): string {
  try {
    const path = new URL(url).pathname.split("/").pop() || "cover";
    if (/\.(png|jpe?g|webp|gif|avif)$/i.test(path)) return path;
    const ext = mime.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
    return `${path}.${ext}`;
  } catch {
    return "cover-image.jpg";
  }
}

function ShareLoading() {
  return (
    <div aria-hidden>
      <div className="sk" style={{ width: "100%", aspectRatio: "1.91 / 1", borderRadius: 12 }} />
      <div className="sk mt-4 h-3 w-20 rounded" />
      <div className="sk mt-2 h-10 w-full rounded-lg" />
      <div className="sk mt-4 h-3 w-20 rounded" />
      <div className="sk mt-2 h-10 w-full rounded-lg" />
      <div className="sk mt-4 h-3 w-20 rounded" />
      <div className="sk mt-2 h-24 w-full rounded-lg" />
    </div>
  );
}
