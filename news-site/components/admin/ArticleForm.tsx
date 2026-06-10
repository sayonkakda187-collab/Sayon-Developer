"use client";

import { useEffect, useRef, useState, useTransition, type ChangeEvent, type DragEvent } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { SeoPreview } from "@/components/admin/SeoPreview";
import { MarkdownToolbar } from "@/components/admin/MarkdownToolbar";
import { useAutosave, readLocalDraft, type DraftSnapshot } from "@/lib/useAutosave";
import { countWords, readingTime } from "@/lib/editorUtils";
import { sanitizeDraft, hasAiLeftovers } from "@/lib/aiDraft";
import { duplicateArticle } from "@/app/admin/actions";
import { AI_HANDOFF_KEY } from "@/components/admin/AiAssistModal";
import { ArticleAiEditModal, type AiEdit } from "@/components/admin/ArticleAiEditModal";
import { SharePromoteModal } from "@/components/admin/SharePromoteModal";
import { CoverCropModal } from "@/components/admin/CoverCropModal";
import { StockPhotoModal } from "@/components/admin/StockPhotoModal";
import { AiImageModal } from "@/components/admin/AiImageModal";
import { COVER_HANDOFF_KEY } from "@/lib/imageGenClient";
import { SparklesIcon, CloseIcon, ShareIcon, ImageIcon, AiImageIcon } from "@/components/admin/icons";
import { AutoShareField, type AutoSharePage } from "@/components/admin/AutoShareField";

// Save draft / Publish buttons with a live saving state. Reads the parent
// form's pending status (useFormStatus) so the clicked button shows a spinner
// and both disable while the server action runs — never feels frozen.
function SubmitButtons({
  onSubmitting,
  onPublishGuard,
}: {
  onSubmitting: () => void;
  // Return false to abort publishing (e.g. the user cancelled the AI-leftovers
  // confirm). Runs before the form action fires.
  onPublishGuard?: () => boolean;
}) {
  const { pending } = useFormStatus();
  const [clicked, setClicked] = useState<"draft" | "published" | null>(null);
  const busy = (v: "draft" | "published") => pending && clicked === v;
  return (
    <div className="flex w-full gap-2 sm:w-auto">
      <button
        type="submit"
        name="status"
        value="draft"
        onClick={() => { setClicked("draft"); onSubmitting(); }}
        disabled={pending}
        aria-busy={busy("draft")}
        className="adm-btn-ghost"
        style={{ flex: 1, minHeight: 44 }}
      >
        {busy("draft") && <span className="adm-spinner" aria-hidden />}
        {busy("draft") ? "Saving…" : "Save draft"}
      </button>
      <button
        type="submit"
        name="status"
        value="published"
        onClick={(e) => {
          if (onPublishGuard && !onPublishGuard()) {
            e.preventDefault(); // user cancelled — don't submit
            return;
          }
          setClicked("published");
          onSubmitting();
        }}
        disabled={pending}
        aria-busy={busy("published")}
        className="adm-btn-primary"
        style={{ flex: 1, minHeight: 44 }}
      >
        {busy("published") && <span className="adm-spinner" aria-hidden />}
        {busy("published") ? "Publishing…" : "Publish"}
      </button>
    </div>
  );
}

function AutosavePill({ state, dirty }: { state: "idle" | "saving" | "saved"; dirty: boolean }) {
  const label = state === "saving" ? "Saving…" : state === "saved" ? "Saved" : dirty ? "Unsaved" : "Up to date";
  return (
    <span className={`adm-autosave ${state}`} title="Drafts autosave to this browser as you type">
      <span className="adm-autosave-dot" aria-hidden />
      {label}
    </span>
  );
}

type Category = { id: string; name: string };
type Tag = { id: string; name: string };
type ArticleInput = {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  coverImage: string | null;
  coverCredit?: string | null;
  coverCreditUrl?: string | null;
  categoryId: string | null;
  status: string;
  tagIds: string[];
};

const inputClass = "adm-input";

export function ArticleForm({
  action,
  categories,
  tags,
  article,
  initial,
  aiHandoff = false,
  fbPages,
  autoShareActive = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  categories: Category[];
  tags: Tag[];
  article?: ArticleInput;
  // Pre-fill for a brand-new draft (e.g. from Trending News). Only the title and
  // a research note are ever seeded — never copied source text.
  initial?: { title?: string; content?: string };
  // When arriving from AI Assist (?ai=1), read the one-shot draft handoff stashed
  // in sessionStorage and pre-fill the editor as an UNSAVED draft. Never published.
  aiHandoff?: boolean;
  // Connected Facebook Pages for the "Auto-share on publish" control. Omit to hide
  // the control (e.g. on the new-article screen).
  fbPages?: AutoSharePage[];
  // Whether auto-share actually runs in this environment (production) — drives the
  // preview-only note in the control.
  autoShareActive?: boolean;
}) {
  const editorId = article?.id ?? "new";
  const router = useRouter();

  const [title, setTitle] = useState(article?.title ?? initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [content, setContent] = useState(article?.content ?? initial?.content ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  // Stock-photo attribution that travels with the cover image (set when a Pexels
  // photo is chosen; cleared on manual upload / paste / remove).
  const [coverCredit, setCoverCredit] = useState(article?.coverCredit ?? "");
  const [coverCreditUrl, setCoverCreditUrl] = useState(article?.coverCreditUrl ?? "");
  const [stockOpen, setStockOpen] = useState(false);
  const [aiImgOpen, setAiImgOpen] = useState(false);
  // Credit pending while a freshly-picked stock photo goes through the cropper;
  // applied to the form only once the cropped image uploads successfully.
  const pendingCredit = useRef<{ credit: string; url: string } | null>(null);
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState<null | "cover" | "inline">(null);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  // Cover cropper: `cropSrc` is the image being adjusted (object URL for a fresh
  // file, or the existing cover URL when re-adjusting). `cropUploading` disables
  // Apply while the cropped blob uploads.
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const cropObjectUrl = useRef<string | null>(null);
  const [cropUploading, setCropUploading] = useState(false);
  const [recovered, setRecovered] = useState<DraftSnapshot | null>(null);
  const [dupPending, startDup] = useTransition();
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const checkedTags = new Set(article?.tagIds ?? []);

  // Snapshot of the values the form started with — used to detect "dirty".
  const initialKey = useRef(
    JSON.stringify({
      title: article?.title ?? initial?.title ?? "",
      excerpt: article?.excerpt ?? "",
      content: article?.content ?? initial?.content ?? "",
      coverImage: article?.coverImage ?? "",
      categoryId: article?.categoryId ?? "",
    }),
  ).current;

  const snapshot: DraftSnapshot = {
    title, excerpt, content, coverImage, categoryId, savedAt: 0,
  };
  const { state, dirty, clear } = useAutosave(editorId, snapshot, initialKey);

  const [aiNotice, setAiNotice] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const isPublished = article?.status === "published";

  // Apply an AI edit into the editor as an UNSAVED change (autosave + the
  // beforeunload guard still apply; nothing is saved or published here).
  function applyAiEdit(edit: AiEdit) {
    if (edit.title) setTitle(edit.title);
    if (edit.body) setContent(edit.body);
    setAiEditOpen(false);
  }

  // On mount: first honor an AI Assist handoff (sessionStorage, one-shot), then
  // otherwise offer to restore a locally-autosaved draft.
  useEffect(() => {
    if (aiHandoff) {
      try {
        const raw = sessionStorage.getItem(AI_HANDOFF_KEY);
        if (raw) {
          sessionStorage.removeItem(AI_HANDOFF_KEY); // consume once
          const data = JSON.parse(raw) as { title?: string; excerpt?: string; draft?: string };
          // The Content body must contain ONLY the article draft — no AI
          // reminder/editor's-note text (that lives in the UI banner below).
          // sanitizeDraft strips any leftover warning header/footer just in case.
          const body = sanitizeDraft(data.draft ?? "");
          const summary = (data.excerpt ?? "").trim();
          if (data.title) setTitle(data.title);
          if (summary) setExcerpt(summary);
          if (body) setContent(body);
          setAiNotice(true);
          return; // don't also pop the recovery banner
        }
      } catch {
        /* sessionStorage may be unavailable — fall through to recovery */
      }
    }
    const local = readLocalDraft(editorId);
    if (local && local.content !== content && (local.title || local.content)) {
      setRecovered(local);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // One-shot cover handoff from the AI Images tab ("Use in new article"): a Blob
  // URL stashed in sessionStorage becomes this new article's cover. New drafts only.
  useEffect(() => {
    if (article?.id) return;
    try {
      const url = sessionStorage.getItem(COVER_HANDOFF_KEY);
      if (url) {
        sessionStorage.removeItem(COVER_HANDOFF_KEY); // consume once
        setCoverImage(url);
        setCoverCredit("");
        setCoverCreditUrl("");
      }
    } catch {
      /* sessionStorage may be unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Release any object URL created for the cropper when unmounting.
  useEffect(() => {
    return () => {
      if (cropObjectUrl.current) URL.revokeObjectURL(cropObjectUrl.current);
    };
  }, []);

  function applyRecovered() {
    if (!recovered) return;
    setTitle(recovered.title);
    setExcerpt(recovered.excerpt);
    setContent(recovered.content);
    setCoverImage(recovered.coverImage);
    setCategoryId(recovered.categoryId);
    setRecovered(null);
  }
  function dismissRecovered() {
    clear();
    setRecovered(null);
  }

  const words = countWords(content);
  const mins = readingTime(words);

  async function uploadFile(file: File): Promise<string | null> {
    setUploadError("");
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      setUploadError(data.error ?? "Upload failed.");
      return null;
    }
    return data.url;
  }

  // Open the crop/adjust modal for a freshly-picked local file (don't upload the
  // raw file — we upload the cropped result on Apply).
  function openCropperForFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    pendingCredit.current = null; // a manual upload has no stock credit
    setCoverCredit("");
    setCoverCreditUrl("");
    setUploadError("");
    if (cropObjectUrl.current) URL.revokeObjectURL(cropObjectUrl.current);
    const url = URL.createObjectURL(file);
    cropObjectUrl.current = url;
    setCropSrc(url);
  }

  function onCoverSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) openCropperForFile(file);
  }

  function onCoverDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openCropperForFile(file);
  }

  // Re-adjust the cover that's already set (crops the existing image).
  function adjustExistingCover() {
    if (!coverImage) return;
    if (cropObjectUrl.current) {
      URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = null;
    }
    setUploadError("");
    setCropSrc(coverImage);
  }

  function closeCropper() {
    if (cropObjectUrl.current) {
      URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = null;
    }
    setCropSrc(null);
  }

  // Apply: upload the canvas-cropped JPEG through the existing endpoint and set
  // it as the cover. On failure we keep the previous cover and show the error.
  async function onCropApply(blob: Blob) {
    setCropUploading(true);
    setUploadError("");
    const file = new File([blob], `cover-${Date.now()}.jpg`, { type: "image/jpeg" });
    const url = await uploadFile(file);
    setCropUploading(false);
    if (url) {
      setCoverImage(url);
      // Commit any stock-photo credit now that the (cropped) image is stored.
      if (pendingCredit.current) {
        setCoverCredit(pendingCredit.current.credit);
        setCoverCreditUrl(pendingCredit.current.url);
        pendingCredit.current = null;
      }
      closeCropper();
    }
    // If upload failed, uploadFile already set uploadError; keep the modal open
    // so the user can retry or cancel without losing their framing.
  }

  // A free stock photo was chosen: remember its credit, then open it in the
  // cropper (the cropped result uploads to Blob like any other cover).
  function onStockPick(pick: { url: string; credit: string; creditUrl: string }) {
    pendingCredit.current = { credit: pick.credit, url: pick.creditUrl };
    setStockOpen(false);
    if (cropObjectUrl.current) {
      URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = null;
    }
    setUploadError("");
    setCropSrc(pick.url);
  }

  // An AI-generated image was chosen: it has no stock credit, so open it in the
  // cropper directly (the cropped result uploads to Blob like any other cover).
  // It's a data URL, which doesn't taint the crop canvas, so export works.
  function onAiImagePick(url: string) {
    pendingCredit.current = null;
    setCoverCredit("");
    setCoverCreditUrl("");
    setAiImgOpen(false);
    if (cropObjectUrl.current) {
      URL.revokeObjectURL(cropObjectUrl.current);
      cropObjectUrl.current = null;
    }
    setUploadError("");
    setCropSrc(url);
  }

  function insertImageMarkdown(name: string, url: string) {
    setContent((c) => `${c}${c && !c.endsWith("\n") ? "\n\n" : ""}![${name}](${url})\n`);
  }

  async function onInlineSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading("inline");
    const url = await uploadFile(file);
    setUploading(null);
    if (url) insertImageMarkdown(file.name, url);
  }

  async function onDrop(e: DragEvent<HTMLTextAreaElement>) {
    const file = e.dataTransfer.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    e.preventDefault();
    setDragOver(false);
    setUploading("inline");
    const url = await uploadFile(file);
    setUploading(null);
    if (url) insertImageMarkdown(file.name, url);
  }

  // Gentle, non-blocking pre-publish check: if the body still has AI reminder
  // text or unresolved [VERIFY: …] markers, ask before publishing. Returns false
  // only if the user cancels.
  function publishGuard(): boolean {
    const { verify, reminder } = hasAiLeftovers(content);
    if (!verify && !reminder) return true;
    const bits = [
      reminder ? "AI reminder / editor’s-note text" : "",
      verify ? "unresolved [VERIFY: …] markers" : "",
    ].filter(Boolean).join(" and ");
    return confirm(
      `This draft still contains ${bits}. Publishing will make it visible to readers.\n\nPublish anyway?`,
    );
  }

  // ⌘B / ⌘I shortcuts in the textarea.
  function onContentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k !== "b" && k !== "i") return;
    e.preventDefault();
    const el = e.currentTarget;
    const [s, en] = [el.selectionStart, el.selectionEnd];
    const sel = content.slice(s, en);
    const mark = k === "b" ? "**" : "_";
    const next = content.slice(0, s) + mark + sel + mark + content.slice(en);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(s + mark.length, en + mark.length);
    });
  }

  function onDuplicate() {
    if (!article?.id) return;
    startDup(async () => {
      const res = await duplicateArticle(article.id);
      if (res.ok) router.push(`/admin/articles/${res.id}/edit`);
    });
  }

  return (
    <>
    <form action={action} className="space-y-6" onSubmit={() => clear()}>
      {article?.id && <input type="hidden" name="id" value={article.id} />}
      {/* Controlled values mirrored into hidden inputs are unnecessary because
          each field below carries its own name; FormData reads them directly. */}

      <div className="adm-editor-head">
        <div className="flex items-center gap-3">
          <h1 className="adm-serif text-2xl font-bold text-fg" style={{ margin: 0 }}>
            {article?.id ? "Edit article" : "New article"}
          </h1>
          {article && (
            <span className={`adm-pill ${article.status === "published" ? "" : "amber"}`}>
              {article.status}
            </span>
          )}
          <AutosavePill state={state} dirty={dirty} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="adm-btn-ghost adm-ai-trigger"
            onClick={() => setAiEditOpen(true)}
            style={{ minHeight: 44 }}
            title="Edit this article with AI (improve, fix grammar, shorten, rewrite…)"
          >
            <SparklesIcon className="h-[16px] w-[16px]" />
            AI Assist
          </button>
          {isPublished && article?.id && (
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={() => setShareOpen(true)}
              style={{ minHeight: 44 }}
              title="Share / promote this published article"
            >
              <ShareIcon className="h-[16px] w-[16px]" />
              Share
            </button>
          )}
          {article?.id && (
            <button
              type="button"
              className="adm-btn-ghost"
              onClick={onDuplicate}
              disabled={dupPending}
              style={{ minHeight: 44 }}
              title="Create a new draft from this article"
            >
              {dupPending && <span className="adm-spinner" aria-hidden />}
              {dupPending ? "Duplicating…" : "Duplicate"}
            </button>
          )}
          {/* Inline Save/Publish — hidden on phones (replaced by the sticky bar). */}
          <span className="adm-submit-inline">
            <SubmitButtons onSubmitting={() => clear()} onPublishGuard={publishGuard} />
          </span>
        </div>
      </div>

      {/* Sticky Save/Publish bar — phones only, always reachable while writing. */}
      <div className="adm-editbar">
        <SubmitButtons onSubmitting={() => clear()} onPublishGuard={publishGuard} />
      </div>

      {recovered && (
        <div className="adm-recover" role="alert">
          <div>
            <strong>Unsaved changes found.</strong> We recovered a draft autosaved in this
            browser{recovered.savedAt ? ` (${new Date(recovered.savedAt).toLocaleString()})` : ""}.
          </div>
          <div className="adm-recover-actions">
            <button type="button" className="adm-btn-primary" onClick={applyRecovered}>Restore</button>
            <button type="button" className="adm-btn-ghost" onClick={dismissRecovered}>Discard</button>
          </div>
        </div>
      )}

      {aiNotice && (
        <div className="adm-ai-banner" role="note">
          <span className="adm-ai-spark"><SparklesIcon className="h-[16px] w-[16px]" /></span>
          <div>
            <strong>AI-assisted draft loaded.</strong> Review, fact-check, and edit before
            publishing — verify all facts and make it your own. Nothing has been saved or published.
          </div>
          <button type="button" className="adm-ai-banner-x" aria-label="Dismiss" onClick={() => setAiNotice(false)}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-5 lg:col-span-2">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Title</label>
            <input
              name="title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`${inputClass} mt-1 text-lg`}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Excerpt</label>
            <textarea
              name="excerpt"
              required
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-sm font-medium text-fg-muted">Content (Markdown)</label>
              <div className="flex items-center gap-3 text-sm">
                <span className="adm-wordcount" aria-live="polite">
                  {words.toLocaleString()} word{words === 1 ? "" : "s"} · {mins} min read
                </span>
                <button
                  type="button"
                  onClick={() => inlineInputRef.current?.click()}
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  {uploading === "inline" ? "Uploading…" : "Insert image"}
                </button>
                <input ref={inlineInputRef} type="file" accept="image/*" hidden onChange={onInlineSelected} />
                <button
                  type="button"
                  onClick={() => setShowPreview((p) => !p)}
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  {showPreview ? "Write" : "Preview"}
                </button>
              </div>
            </div>

            {!showPreview && <MarkdownToolbar textareaRef={contentRef} onChange={setContent} />}

            {showPreview ? (
              <div className="mt-1 min-h-[20rem] rounded-lg border border-border bg-surface px-4 py-3">
                {content.trim() ? (
                  <div className="text-fg-muted">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-fg-faint">Nothing to preview yet.</p>
                )}
              </div>
            ) : (
              <textarea
                ref={contentRef}
                name="content"
                rows={18}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onKeyDown={onContentKeyDown}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                placeholder="Write your story in Markdown… (drag an image here to upload)"
                className={`${inputClass} mt-1 font-mono text-sm leading-6 ${dragOver ? "adm-dragover" : ""}`}
              />
            )}

            {uploadError && <p className="mt-2 text-sm text-red-600">{uploadError}</p>}
          </div>

          {/* SEO preview */}
          <div>
            <label className="block text-sm font-medium text-fg-muted">Search &amp; share preview</label>
            <div className="mt-1">
              <SeoPreview title={title} slug="" excerpt={excerpt} coverImage={coverImage} />
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-fg-muted">Category</label>
            <select
              name="categoryId"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">— None —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-fg-muted">Cover image</label>
            {coverImage ? (
              <div className="adm-cover-box">
                <div className="adm-cover-preview">
                  {/* 1.91:1 mirrors the OG/share crop the cropper produces. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={coverImage} alt="Cover preview" className="adm-cover-img" />
                </div>
                {coverCredit && (
                  <p className="adm-cover-credit">
                    Photo: {coverCreditUrl ? (
                      <a href={coverCreditUrl} target="_blank" rel="noopener noreferrer">{coverCredit}</a>
                    ) : coverCredit} · Pexels
                  </p>
                )}
                <div className="adm-cover-acts">
                  <button type="button" className="adm-btn-ghost adm-cover-btn" onClick={adjustExistingCover}>
                    Adjust / reframe
                  </button>
                  <label className="adm-btn-ghost adm-cover-btn" style={{ cursor: "pointer" }}>
                    Replace
                    <input type="file" accept="image/*" hidden onChange={onCoverSelected} />
                  </label>
                  <button type="button" className="adm-btn-ghost adm-cover-btn" onClick={() => setStockOpen(true)}>
                    <ImageIcon className="h-[15px] w-[15px]" />
                    Free photos
                  </button>
                  <button type="button" className="adm-btn-ghost adm-cover-btn" onClick={() => setAiImgOpen(true)}>
                    <AiImageIcon className="h-[15px] w-[15px]" />
                    Generate AI
                  </button>
                  <button
                    type="button"
                    className="adm-cover-remove"
                    onClick={() => { setCoverImage(""); setCoverCredit(""); setCoverCreditUrl(""); pendingCredit.current = null; }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <>
                <label
                  className={`adm-cover-drop ${dragOver ? "drag" : ""}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={onCoverDrop}
                >
                  <span className="adm-cover-drop-ic" aria-hidden>
                    <ImageIcon className="h-6 w-6" />
                  </span>
                  <strong>{uploading === "cover" ? "Uploading…" : "Upload or drop a cover image"}</strong>
                  <span className="adm-cover-drop-sub">You’ll crop &amp; reframe it before it’s saved</span>
                  <input type="file" accept="image/*" hidden onChange={onCoverSelected} />
                </label>
                <div className="adm-cover-srcbtns">
                  <button type="button" className="adm-btn-ghost adm-cover-stockbtn" onClick={() => setStockOpen(true)}>
                    <ImageIcon className="h-[15px] w-[15px]" />
                    Search free photos
                  </button>
                  <button type="button" className="adm-btn-ghost adm-cover-stockbtn" onClick={() => setAiImgOpen(true)}>
                    <AiImageIcon className="h-[15px] w-[15px]" />
                    Generate with AI
                  </button>
                </div>
              </>
            )}
            <input
              type="text"
              name="coverImage"
              value={coverImage}
              onChange={(e) => { setCoverImage(e.target.value); setCoverCredit(""); setCoverCreditUrl(""); pendingCredit.current = null; }}
              placeholder="…or paste an image URL"
              className={`${inputClass} mt-2`}
            />
            {/* Credit travels with the cover; read by saveArticle. */}
            <input type="hidden" name="coverCredit" value={coverCredit} />
            <input type="hidden" name="coverCreditUrl" value={coverCreditUrl} />
            {uploadError && <p className="adm-cover-err">{uploadError}</p>}
          </div>

          <div>
            <span className="block text-sm font-medium text-fg-muted">Tags</span>
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
              {tags.length === 0 ? (
                <p className="text-xs text-fg-faint">No tags yet.</p>
              ) : (
                tags.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-fg">
                    <input
                      type="checkbox"
                      name="tagIds"
                      value={t.id}
                      defaultChecked={checkedTags.has(t.id)}
                      className="accent-[rgb(var(--accent))]"
                    />
                    {t.name}
                  </label>
                ))
              )}
            </div>
            <input
              type="text"
              name="newTags"
              placeholder="New tags (comma separated)"
              className={`${inputClass} mt-2`}
            />
          </div>

          {fbPages && fbPages.length > 0 && (
            <AutoShareField pages={fbPages} active={autoShareActive} />
          )}
        </div>
      </div>
    </form>

    {shareOpen && article?.id && (
      <SharePromoteModal articleId={article.id} onClose={() => setShareOpen(false)} />
    )}

    {aiEditOpen && (
      <ArticleAiEditModal
        title={title}
        body={content}
        onApply={applyAiEdit}
        onClose={() => setAiEditOpen(false)}
      />
    )}

    {stockOpen && (
      <StockPhotoModal
        initialTitle={title}
        initialExcerpt={excerpt}
        onPick={onStockPick}
        onClose={() => setStockOpen(false)}
      />
    )}

    {aiImgOpen && (
      <AiImageModal
        initialTitle={title}
        onPick={onAiImagePick}
        onClose={() => setAiImgOpen(false)}
      />
    )}

    {cropSrc && (
      <CoverCropModal
        src={cropSrc}
        busy={cropUploading}
        onApply={onCropApply}
        onCancel={closeCropper}
        onExportError={(msg) => { setUploadError(msg); closeCropper(); }}
      />
    )}
    </>
  );
}
