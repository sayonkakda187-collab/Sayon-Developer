"use client";

import { useEffect, useState } from "react";
import {
  GEN_ASPECTS,
  GEN_STYLES,
  DEFAULT_ASPECT,
  NEWS_IMAGE_CAUTION,
  IMAGE_PROVIDERS_HELP,
  requestImages,
  type GenImage,
} from "@/lib/imageGenClient";
import { SparklesIcon, CloseIcon, AiImageIcon, ImageIcon } from "@/components/admin/icons";

type Phase = "idle" | "loading" | "ready" | "error" | "setup";

/**
 * Compact AI image generator for the article editor. Generate from a prompt →
 * pick a result → it's handed to the editor's existing cropper (which uploads
 * the cropped JPEG to Blob and sets it as the cover). The key stays server-side;
 * onPick receives a data URL (data URLs don't taint the crop canvas).
 */
export function AiImageModal({
  initialTitle,
  onPick,
  onClose,
}: {
  initialTitle?: string;
  onPick: (url: string) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(initialTitle?.trim() ? initialTitle.trim() : "");
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [style, setStyle] = useState(GEN_STYLES[0].id);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [images, setImages] = useState<GenImage[]>([]);

  // Close on Escape; lock background scroll.
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  async function generate() {
    const p = prompt.trim();
    if (p.length < 3) { setError("Enter a prompt describing the image."); setPhase("error"); return; }
    setPhase("loading");
    setError("");
    const res = await requestImages({ prompt: p, aspectRatio: aspect, style, count: 1 });
    if (!res.ok) {
      if (res.configured === false) { setPhase("setup"); return; }
      setError(res.error);
      setPhase("error");
      return;
    }
    setImages(res.images);
    setPhase("ready");
  }

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-stock-modal" role="dialog" aria-modal="true" aria-label="Generate image with AI">
        <div className="adm-modal-head">
          <div className="adm-stock-title">
            <span className="adm-stock-spark" aria-hidden><AiImageIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>Generate image with AI</h2>
              <p className="adm-stock-sub">Make an illustration, then crop &amp; set it as the cover.</p>
            </div>
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {phase === "setup" ? (
          <div className="adm-modal-body">
            <div className="adm-stock-setup">
              <div className="adm-ill" style={{ margin: "0 auto 14px" }}><AiImageIcon className="h-[30px] w-[30px]" /></div>
              <h3 className="adm-serif">Set up AI image generation</h3>
              <p>Pick <strong>any one</strong> provider, set its key (Vercel → Settings → Environment Variables), and redeploy. Stock photos &amp; manual upload still work without it.</p>
              <ul className="adm-aiimg-providers" style={{ textAlign: "left", maxWidth: 460, margin: "10px auto 0" }}>
                {IMAGE_PROVIDERS_HELP.map((p) => (
                  <li key={p.name}>
                    <a className="adm-link" href={p.href} target="_blank" rel="noopener noreferrer">{p.name}</a>
                    {" — "}<code className="adm-fb-code">{p.env}</code>
                  </li>
                ))}
              </ul>
              <button type="button" className="adm-btn-ghost" style={{ marginTop: 16 }} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <div className="adm-modal-body">
            <div className="adm-aiimg-caution" role="note" style={{ marginBottom: 12 }}>
              <ImageIcon className="h-[18px] w-[18px]" aria-hidden />
              <p>{NEWS_IMAGE_CAUTION}</p>
            </div>

            <label className="adm-field">
              <span>Prompt</span>
              <textarea
                className="adm-input"
                rows={3}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the illustration for this article’s cover…"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") generate(); }}
              />
            </label>

            <div className="adm-settings-grid" style={{ marginTop: 12 }}>
              <label className="adm-field">
                <span>Aspect ratio</span>
                <select className="adm-input" value={aspect} onChange={(e) => setAspect(e.target.value)}>
                  {GEN_ASPECTS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <label className="adm-field">
                <span>Style</span>
                <select className="adm-input" value={style} onChange={(e) => setStyle(e.target.value)}>
                  {GEN_STYLES.map((s) => <option key={s.label} value={s.id}>{s.label}</option>)}
                </select>
              </label>
            </div>

            <div className="adm-settings-actions" style={{ marginTop: 12 }}>
              <button type="button" className="adm-btn-primary" onClick={generate} disabled={phase === "loading" || prompt.trim().length < 3}>
                {phase === "loading" ? <span className="adm-spinner" aria-hidden /> : <SparklesIcon className="h-4 w-4" />}
                {phase === "loading" ? "Generating…" : images.length ? "Regenerate" : "Generate"}
              </button>
            </div>

            {phase === "error" && <p className="adm-cover-err" style={{ marginTop: 10 }}>{error}</p>}

            {phase === "loading" && (
              <div className="adm-aiimg-grid" style={{ marginTop: 14 }}>
                <div className="sk adm-aiimg-cell" aria-hidden style={{ aspectRatio: aspect.replace(":", " / ") }} />
              </div>
            )}

            {phase === "ready" && images.length > 0 && (
              <>
                <p className="adm-stock-hint" style={{ marginTop: 14 }}>Pick an image to crop &amp; set as the cover:</p>
                <div className="adm-aiimg-grid" style={{ marginTop: 8 }}>
                  {images.map((img, i) => (
                    <button
                      key={i}
                      type="button"
                      className="adm-aiimg-pick"
                      style={{ aspectRatio: aspect.replace(":", " / ") }}
                      onClick={() => onPick(img.url)}
                      title="Use this image"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt="" />
                      <span className="adm-stock-pickhint">Use this image</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
