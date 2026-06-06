"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import {
  GEN_ASPECTS,
  GEN_STYLES,
  DEFAULT_ASPECT,
  NEWS_IMAGE_CAUTION,
  COVER_HANDOFF_KEY,
  IMAGE_PROVIDERS_HELP,
  PROVIDER_LABELS,
  requestImages,
  saveImageToBlob,
} from "@/lib/imageGenClient";
import {
  SparklesIcon,
  AiImageIcon,
  DownloadIcon,
  CopyIcon,
  CheckIcon,
  ImageIcon,
  PlusIcon,
} from "@/components/admin/icons";

type GenItem = {
  id: string;
  url: string; // data URL of the generated image
  prompt: string;
  aspect: string;
  blobUrl: string | null; // set once saved to media (Vercel Blob)
  saving: boolean;
};

const COUNTS = [1, 2, 3, 4];

/**
 * AI Images generator (admin tab). Enter a prompt → generate illustrative images
 * via the server route (key stays server-side) → Download, Save to media (Vercel
 * Blob), Copy URL, or Use in a new article (cover). Recent generations stay in
 * memory for the session. News-safety caution is shown prominently.
 */
export function AiImageGenerator() {
  const router = useRouter();
  const { success, error: toastError } = useToast();

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [provider, setProvider] = useState<string>("");
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);
  const [style, setStyle] = useState(GEN_STYLES[0].id);
  const [count, setCount] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [items, setItems] = useState<GenItem[]>([]);
  const idRef = useRef(0);

  // Know up-front whether a key is set, so we can show a tidy setup state.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/generate-image")
      .then((r) => r.json())
      .then((d) => { if (!cancelled) { setConfigured(Boolean(d?.configured)); setProvider(String(d?.provider ?? "")); } })
      .catch(() => { if (!cancelled) setConfigured(true); /* assume set; POST will report */ });
    return () => { cancelled = true; };
  }, []);

  async function generate() {
    const p = prompt.trim();
    if (p.length < 3) { setError("Enter a prompt describing the image."); return; }
    setGenerating(true);
    setError("");
    const res = await requestImages({ prompt: p, aspectRatio: aspect, style, count });
    setGenerating(false);
    if (!res.ok) {
      if (res.configured === false) setConfigured(false);
      setError(res.error);
      return;
    }
    const created: GenItem[] = res.images.map((img) => ({
      id: `g${++idRef.current}`,
      url: img.url,
      prompt: p,
      aspect,
      blobUrl: null,
      saving: false,
    }));
    setItems((prev) => [...created, ...prev]);
  }

  function patch(id: string, next: Partial<GenItem>) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...next } : it)));
  }

  function download(it: GenItem) {
    const a = document.createElement("a");
    a.href = it.url;
    a.download = `ai-image-${it.id}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // Save to media → returns the Blob URL (reused by Copy URL / Use in article).
  async function ensureSaved(it: GenItem): Promise<string | null> {
    if (it.blobUrl) return it.blobUrl;
    patch(it.id, { saving: true });
    try {
      const url = await saveImageToBlob(it.url, `ai-${Date.now()}`);
      patch(it.id, { blobUrl: url, saving: false });
      return url;
    } catch (e) {
      patch(it.id, { saving: false });
      toastError(e instanceof Error ? e.message : "Couldn’t save the image.");
      return null;
    }
  }

  async function saveToMedia(it: GenItem) {
    const url = await ensureSaved(it);
    if (url) success("Saved to media.");
  }

  async function copyUrl(it: GenItem) {
    const url = await ensureSaved(it);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      success("Image URL copied.");
    } catch {
      toastError("Couldn’t copy — the URL is shown on the card.");
    }
  }

  async function openInNewArticle(it: GenItem) {
    const url = await ensureSaved(it);
    if (!url) return;
    try {
      sessionStorage.setItem(COVER_HANDOFF_KEY, url);
      router.push("/admin/articles/new");
    } catch {
      toastError("Couldn’t open the editor. Copy the URL and paste it as the cover instead.");
    }
  }

  if (configured === false) {
    return (
      <div className="adm-card adm-card-pad adm-aiimg-setup">
        <div className="adm-ill" style={{ margin: "0 auto 14px" }}><AiImageIcon className="h-[30px] w-[30px]" /></div>
        <h3 className="adm-serif">Set up AI image generation</h3>
        <p>Pick <strong>any one</strong> provider and set its key in your environment (Vercel → Settings → Environment Variables, Production &amp; Preview), then redeploy. All keys stay server-side.</p>
        <ul className="adm-aiimg-providers">
          {IMAGE_PROVIDERS_HELP.map((p) => (
            <li key={p.name}>
              <a className="adm-link" href={p.href} target="_blank" rel="noopener noreferrer">{p.name}</a>
              {" — "}<code className="adm-fb-code">{p.env}</code> <span className="adm-card-sub">({p.note})</span>
            </li>
          ))}
        </ul>
        <p className="adm-card-sub" style={{ marginTop: 10 }}>
          Set <code className="adm-fb-code">IMAGE_PROVIDER</code> to <code className="adm-fb-code">cloudflare</code>, <code className="adm-fb-code">huggingface</code>, or <code className="adm-fb-code">gemini</code> to force one (otherwise it’s auto-detected from the keys present).
        </p>
      </div>
    );
  }

  return (
    <div className="adm-settings-stack">
      {/* News-safety caution — always visible. */}
      <div className="adm-aiimg-caution" role="note">
        <ImageIcon className="h-[18px] w-[18px]" aria-hidden />
        <p>{NEWS_IMAGE_CAUTION}</p>
      </div>

      {/* Composer */}
      <div className="adm-card adm-card-pad">
        <div className="adm-aiimg-titlerow">
          <span className="adm-card-title">Generate an image</span>
          {provider && PROVIDER_LABELS[provider] && (
            <span className="adm-aiimg-provider" title="Active image provider">{PROVIDER_LABELS[provider]}</span>
          )}
        </div>
        <div className="adm-card-sub" style={{ margin: "4px 0 12px" }}>
          Describe the illustration you want. Be specific about subject, mood, and composition.
        </div>

        <label className="adm-field">
          <span>Prompt</span>
          <textarea
            className="adm-input"
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g. A minimalist editorial illustration of a rising bar chart over a city skyline, blue and amber palette"
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
          <label className="adm-field">
            <span>Images</span>
            <select className="adm-input" value={count} onChange={(e) => setCount(Number(e.target.value))}>
              {COUNTS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
        </div>

        {error && <p className="adm-cover-err" style={{ marginTop: 10 }}>{error}</p>}

        <div className="adm-settings-actions">
          <button type="button" className="adm-btn-primary" onClick={generate} disabled={generating || prompt.trim().length < 3}>
            {generating ? <span className="adm-spinner" aria-hidden /> : <SparklesIcon className="h-4 w-4" />}
            {generating ? "Generating…" : "Generate"}
          </button>
          <span className="adm-card-sub" style={{ alignSelf: "center" }}>More images use more of your daily quota.</span>
        </div>
      </div>

      {/* Results / recent generations */}
      {(generating || items.length > 0) && (
        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">{items.length > 0 ? "Generated images" : "Generating…"}</div>
          <div className="adm-aiimg-grid" style={{ marginTop: 12 }}>
            {generating && (
              <div className="sk adm-aiimg-cell" aria-hidden style={{ aspectRatio: aspect.replace(":", " / ") }} />
            )}
            {items.map((it) => (
              <figure key={it.id} className="adm-aiimg-item">
                <div className="adm-aiimg-frame" style={{ aspectRatio: it.aspect.replace(":", " / ") }}>
                  {/* Generated data/blob URLs render via plain <img> (no next/image host config). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={it.blobUrl ?? it.url} alt={it.prompt} loading="lazy" />
                </div>
                <div className="adm-aiimg-acts">
                  <button type="button" className="adm-btn-ghost adm-aiimg-act" onClick={() => openInNewArticle(it)} disabled={it.saving} title="Save & start a new article with this as the cover">
                    <PlusIcon className="h-4 w-4" /> Use in article
                  </button>
                  <button type="button" className="adm-btn-ghost adm-aiimg-act" onClick={() => saveToMedia(it)} disabled={it.saving} title="Save to media (Vercel Blob)">
                    {it.saving ? <span className="adm-spinner" aria-hidden /> : it.blobUrl ? <CheckIcon className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                    {it.blobUrl ? "Saved" : "Save to media"}
                  </button>
                  <button type="button" className="adm-btn-ghost adm-aiimg-act" onClick={() => copyUrl(it)} disabled={it.saving} title="Copy the saved image URL">
                    <CopyIcon className="h-4 w-4" /> Copy URL
                  </button>
                  <button type="button" className="adm-btn-ghost adm-aiimg-act" onClick={() => download(it)} title="Download the image">
                    <DownloadIcon className="h-4 w-4" /> Download
                  </button>
                </div>
                {it.blobUrl && (
                  <a className="adm-aiimg-url" href={it.blobUrl} target="_blank" rel="noopener noreferrer" title={it.blobUrl}>{it.blobUrl}</a>
                )}
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
