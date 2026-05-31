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
import { duplicateArticle } from "@/app/admin/actions";
import { AI_HANDOFF_KEY } from "@/components/admin/AiAssistModal";
import { SharePromoteModal } from "@/components/admin/SharePromoteModal";
import { SparklesIcon, CloseIcon, ShareIcon } from "@/components/admin/icons";

// Save draft / Publish buttons with a live saving state. Reads the parent
// form's pending status (useFormStatus) so the clicked button shows a spinner
// and both disable while the server action runs — never feels frozen.
function SubmitButtons({ onSubmitting }: { onSubmitting: () => void }) {
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
        onClick={() => { setClicked("published"); onSubmitting(); }}
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
}) {
  const editorId = article?.id ?? "new";
  const router = useRouter();

  const [title, setTitle] = useState(article?.title ?? initial?.title ?? "");
  const [excerpt, setExcerpt] = useState(article?.excerpt ?? "");
  const [content, setContent] = useState(article?.content ?? initial?.content ?? "");
  const [coverImage, setCoverImage] = useState(article?.coverImage ?? "");
  const [categoryId, setCategoryId] = useState(article?.categoryId ?? "");
  const [showPreview, setShowPreview] = useState(false);
  const [uploading, setUploading] = useState<null | "cover" | "inline">(null);
  const [uploadError, setUploadError] = useState("");
  const [dragOver, setDragOver] = useState(false);
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
  const isPublished = article?.status === "published";

  // On mount: first honor an AI Assist handoff (sessionStorage, one-shot), then
  // otherwise offer to restore a locally-autosaved draft.
  useEffect(() => {
    if (aiHandoff) {
      try {
        const raw = sessionStorage.getItem(AI_HANDOFF_KEY);
        if (raw) {
          sessionStorage.removeItem(AI_HANDOFF_KEY); // consume once
          const data = JSON.parse(raw) as { title?: string; draft?: string };
          const body = (data.draft ?? "").trim();
          if (data.title) setTitle(data.title);
          if (body) {
            setContent(
              `> ⚠️ AI draft — review, fact-check, and edit before publishing. Verify all facts and write in your own words.\n\n${body}`,
            );
          }
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

  async function onCoverSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading("cover");
    const url = await uploadFile(file);
    setUploading(null);
    if (url) setCoverImage(url);
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
        <div className="flex items-center gap-2">
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
          <SubmitButtons onSubmitting={() => clear()} />
        </div>
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
            {coverImage && (
              <div className="relative mt-2 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={coverImage} alt="Cover preview" className="aspect-[16/9] w-full object-cover" />
              </div>
            )}
            <input
              type="text"
              name="coverImage"
              value={coverImage}
              onChange={(e) => setCoverImage(e.target.value)}
              placeholder="Image URL or upload below"
              className={`${inputClass} mt-2`}
            />
            <label className="mt-2 inline-block cursor-pointer text-sm text-fg-muted transition-colors hover:text-fg">
              {uploading === "cover" ? "Uploading…" : "Upload cover image"}
              <input type="file" accept="image/*" hidden onChange={onCoverSelected} />
            </label>
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
        </div>
      </div>
    </form>

    {shareOpen && article?.id && (
      <SharePromoteModal articleId={article.id} onClose={() => setShareOpen(false)} />
    )}
    </>
  );
}
