"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useToast } from "@/components/admin/Toast";
import {
  createWordPressPost, deleteWordPressPost, fetchWordPressPost, fetchWordPressPosts,
  fetchWordPressTaxonomies, previewWordPressMarkdown, testWordPressConnection,
  updateWordPressPost,
} from "@/app/admin/wordpress-actions";
import type {
  WpAiDraft, WpComposeStatus, WpConfigStatus, WpContentFormat, WpPost, WpStatus, WpTerm,
} from "@/lib/wordpress/types";
import { WordPressCompose } from "@/components/admin/WordPressCompose";
import { WordPressFeaturedImage } from "@/components/admin/WordPressFeaturedImage";
import { SharePromoteModal } from "@/components/admin/SharePromoteModal";
import {
  CheckIcon, ExternalLinkIcon, PencilIcon, PlusIcon, RefreshIcon, ShareIcon, TrashIcon,
} from "@/components/admin/icons";

/**
 * WordPress publishing panel.
 *
 * Every call goes through a server action in `app/admin/wordpress-actions.ts`,
 * which re-checks `requireAdmin()` and holds the credentials server-side — this
 * component never sees WP_USERNAME or WP_APPLICATION_PASSWORD, and cannot, since
 * the client that reads them is `server-only`.
 *
 * Posts and taxonomies load from the BROWSER rather than being server-rendered
 * into the page. If WordPress is unreachable, that keeps the admin page itself
 * fast and lets the failure show up as an error state in the panel instead of a
 * stalled render.
 */

const PER_PAGE = 10;

/** The four statuses WordPress will accept from this form. Draft and Publish are
 *  the two in normal use; Pending and Private are here so that opening a post
 *  that already has one of them and pressing Save does not quietly downgrade it. */
const STATUS_OPTIONS: { id: WpStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "pending", label: "Pending" },
  { id: "private", label: "Private" },
  { id: "publish", label: "Publish" },
];

type FieldErrors = { title?: string; content?: string };

function StatusPill({ status }: { status: string }) {
  const tone =
    status === "publish" ? { bg: "rgb(var(--sa) / 0.14)", fg: "var(--section-link)" }
    : status === "draft" ? { bg: "rgba(148,163,184,0.18)", fg: "var(--adm-ink-2)" }
    : { bg: "rgba(245,158,11,0.16)", fg: "rgb(180,83,9)" };
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase",
      padding: "2px 8px", borderRadius: 999, background: tone.bg, color: tone.fg, whiteSpace: "nowrap",
    }}>
      {status}
    </span>
  );
}

/** A filterable checkbox list. Used for both taxonomies — a WordPress site can
 *  easily have a hundred tags, which is unusable as a flat list of checkboxes. */
function TermPicker({
  label, terms, selected, onChange, emptyHint,
}: {
  label: string; terms: WpTerm[]; selected: number[];
  onChange: (ids: number[]) => void; emptyHint: string;
}) {
  const [filter, setFilter] = useState("");
  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q ? terms.filter((t) => t.name.toLowerCase().includes(q)) : terms;
    // Keep chosen terms visible even when the filter would hide them, so you can
    // always see and undo what is selected.
    const chosen = terms.filter((t) => selected.includes(t.id) && !list.includes(t));
    return [...chosen, ...list];
  }, [terms, filter, selected]);

  const toggle = (id: number) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  return (
    <div className="adm-field">
      <span>
        {label}
        {selected.length > 0 && (
          <span className="adm-field-hint" style={{ display: "inline" }}> · {selected.length} selected</span>
        )}
      </span>
      {terms.length === 0 ? (
        <div className="adm-card-sub">{emptyHint}</div>
      ) : (
        <>
          {terms.length > 8 && (
            <input
              className="adm-input" value={filter} onChange={(e) => setFilter(e.target.value)}
              placeholder={`Filter ${label.toLowerCase()}…`} style={{ marginBottom: 8 }}
            />
          )}
          <div style={{
            maxHeight: 168, overflowY: "auto", border: "1px solid var(--adm-bd)",
            borderRadius: 10, padding: 8, display: "flex", flexDirection: "column", gap: 2,
          }}>
            {shown.length === 0 && <div className="adm-card-sub">No match.</div>}
            {shown.map((t) => (
              <label key={t.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "5px 6px",
                borderRadius: 8, cursor: "pointer", fontSize: 13,
              }}>
                <input type="checkbox" checked={selected.includes(t.id)} onChange={() => toggle(t.id)} />
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.name}
                </span>
                <span className="adm-field-hint">{t.count}</span>
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function WordPressManager({
  status, compose, trendingCategories,
}: {
  status: WpConfigStatus;
  compose: WpComposeStatus;
  /** Named apart from the post's own `categories` state, which holds WP term IDs. */
  trendingCategories: { id: string; label: string }[];
}) {
  const { success, error } = useToast();
  const [pending, startTransition] = useTransition();

  // ── connection ─────────────────────────────────────────────────────────────
  const [testing, setTesting] = useState(false);
  const [connection, setConnection] = useState<
    { ok: true; name: string; caps: string[] } | { ok: false; message: string } | null
  >(null);

  // ── editor ─────────────────────────────────────────────────────────────────
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [postStatus, setPostStatus] = useState<WpStatus>("draft");
  const [excerpt, setExcerpt] = useState("");
  const [slug, setSlug] = useState("");
  const [categories, setCategories] = useState<number[]>([]);
  const [tags, setTags] = useState<number[]>([]);
  const [featuredMedia, setFeaturedMedia] = useState("");
  /** Thumbnail for a just-uploaded image. Null for one loaded from a post,
   *  where WordPress gives an id but this panel has not fetched the URL. */
  const [featuredPreview, setFeaturedPreview] = useState<{ url: string; title: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [format, setFormat] = useState<WpContentFormat>("markdown");
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [loadingPost, setLoadingPost] = useState(false);
  /** The story a generated draft came from, shown so it can be checked. */
  const [sourceLink, setSourceLink] = useState<string | null>(null);

  // ── taxonomies + list ──────────────────────────────────────────────────────
  const [terms, setTerms] = useState<{ categories: WpTerm[]; tags: WpTerm[] }>({ categories: [], tags: [] });
  const [termsError, setTermsError] = useState<string | null>(null);
  const [posts, setPosts] = useState<WpPost[]>([]);
  const [page, setPage] = useState(1);
  const [totals, setTotals] = useState({ total: 0, totalPages: 1 });
  const [filter, setFilter] = useState<"any" | WpStatus>("any");
  const [search, setSearch] = useState("");
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const loadPosts = useCallback(async (opts: { page?: number; status?: string; search?: string } = {}) => {
    if (!status.configured) return;
    setListing(true);
    setListError(null);
    const res = await fetchWordPressPosts({
      page: opts.page ?? page,
      status: opts.status ?? filter,
      search: opts.search ?? search,
      perPage: PER_PAGE,
    });
    setListing(false);
    if (!res.ok) { setListError(res.message); setPosts([]); return; }
    setPosts(res.data.items);
    setTotals({ total: res.data.total, totalPages: Math.max(1, res.data.totalPages) });
  }, [status.configured, page, filter, search]);

  useEffect(() => {
    if (!status.configured) return;
    void loadPosts({ page: 1 });
    void (async () => {
      const res = await fetchWordPressTaxonomies();
      if (res.ok) setTerms(res.data);
      else setTermsError(res.message);
    })();
    // Runs once on mount; loadPosts is re-created per filter change but the
    // filter/search handlers call it directly with the new values.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.configured]);

  // The Share / promote panel's target. `celebrate` turns on the post-publish
  // header — the same panel the Articles tab opens after publishing, so the two
  // screens behave identically once a story is live.
  const [shareTarget, setShareTarget] = useState<{ id: number; celebrate: boolean } | null>(null);

  function resetForm() {
    setEditingId(null); setTitle(""); setContent(""); setPostStatus("draft");
    setExcerpt(""); setSlug(""); setCategories([]); setTags([]);
    setFeaturedMedia(""); setFeaturedPreview(null);
    setFieldErrors({}); setShowPreview(false); setPreviewHtml("");
    setFormat("markdown"); setSourceLink(null);
  }

  function validate(): boolean {
    const errs: FieldErrors = {};
    if (!title.trim()) errs.title = "A title is required.";
    else if (title.trim().length > 300) errs.title = "Titles are limited to 300 characters.";
    if (!content.trim()) errs.content = "Add some content before publishing.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function applyDraft(draft: WpAiDraft, sourceUrl?: string) {
    // Deliberately drops out of edit mode: filling a generated draft into a post
    // loaded from WordPress would overwrite live content with one click.
    setEditingId(null);
    setTitle(draft.title);
    setContent(draft.content);
    setFormat("markdown");          // the AI returns Markdown
    if (draft.excerpt) setExcerpt(draft.excerpt);
    setPostStatus("draft");         // never jump straight to publish
    setFieldErrors({});
    setShowPreview(false);
    setPreviewHtml("");
    setSourceLink(sourceUrl ?? null);
    setFeaturedMedia(""); setFeaturedPreview(null);
    document.getElementById("wp-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openForEdit(id: number) {
    setLoadingPost(true);
    const res = await fetchWordPressPost(id);
    setLoadingPost(false);
    if (!res.ok) { error(res.message); return; }
    const p = res.data;
    setEditingId(p.id); setTitle(p.title); setContent(p.contentRaw);
    // WordPress stores HTML, so that is what comes back — regardless of how the
    // post was originally written. Treating it as Markdown and converting on
    // save would mangle it, so the editor switches to HTML for a loaded post.
    setFormat("html"); setShowPreview(false); setPreviewHtml(""); setSourceLink(null);
    setPostStatus((STATUS_OPTIONS.some((s) => s.id === p.status) ? p.status : "draft") as WpStatus);
    setExcerpt(p.excerptRaw); setSlug(p.slug);
    setCategories(p.categories); setTags(p.tags);
    setFeaturedMedia(p.featuredMedia ? String(p.featuredMedia) : "");
    setFeaturedPreview(null);   // the id came from WordPress; no URL fetched
    setFieldErrors({});
    document.getElementById("wp-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function submit() {
    if (!validate()) return;
    const form = {
      title: title.trim(), content, format, status: postStatus,
      excerpt, slug: slug.trim(), categories, tags,
      featuredMedia: featuredMedia.trim() === "" ? null : Number(featuredMedia),
    };
    startTransition(async () => {
      const res = editingId === null
        ? await createWordPressPost(form)
        : await updateWordPressPost(editingId, form);
      if (!res.ok) { error(res.message); return; }
      success(
        editingId === null
          ? `Created “${res.data.title}” as ${res.data.status}.`
          : `Updated “${res.data.title}”.`,
      );
      // A post that is now live gets the share panel straight away — the moment
      // you have a link worth handing out is the moment you saved it live. This
      // matches the Articles tab, which opens its panel on every save of a
      // published article. Drafts, pending and private posts have no public URL,
      // so they get nothing rather than a panel that could only explain why it
      // is empty.
      //
      // Only a NEW post celebrates. Saving an edit to a post that was already
      // live is not a publication, and "Post published!" would be telling you
      // something that did not happen.
      if (res.data.status === "publish") {
        setShareTarget({ id: res.data.id, celebrate: editingId === null });
      }
      resetForm();
      void loadPosts({ page: 1 });
      setPage(1);
    });
  }

  function remove(post: WpPost) {
    const permanent = window.confirm(
      `Move “${post.title}” to the WordPress trash?\n\n` +
      `OK = move to trash (recoverable in WordPress).\n` +
      `Cancel = do nothing.`,
    );
    if (!permanent) return;
    startTransition(async () => {
      const res = await deleteWordPressPost(post.id, false);
      if (!res.ok) { error(res.message); return; }
      success(`“${post.title}” moved to the WordPress trash.`);
      if (editingId === post.id) resetForm();
      void loadPosts();
    });
  }

  async function runTest() {
    setTesting(true);
    const res = await testWordPressConnection();
    setTesting(false);
    if (res.ok) {
      setConnection({ ok: true, name: res.data.name, caps: res.data.capabilities });
      success(`Connected to WordPress as ${res.data.name}.`);
    } else {
      setConnection({ ok: false, message: res.message });
      error(res.message);
    }
  }

  const canPublish =
    connection?.ok === true ? connection.caps.includes("publish_posts") : true;

  // ── not configured ─────────────────────────────────────────────────────────
  if (!status.configured) {
    return (
      <div className="adm-card adm-card-pad">
        <div className="adm-card-title">WordPress is not connected</div>
        <div className="adm-card-sub" style={{ marginTop: 6 }}>
          Set these in your environment (Vercel → Settings → Environment Variables, or
          <code> .env</code> locally), then redeploy:
        </div>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 13, lineHeight: 1.9 }}>
          {["WP_URL", "WP_USERNAME", "WP_APPLICATION_PASSWORD"].map((v) => (
            <li key={v}>
              <code>{v}</code>
              {status.missing.includes(v)
                ? <span style={{ color: "rgb(190,60,60)" }}> — missing</span>
                : <span style={{ color: "rgb(21,128,61)" }}> — set</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── connection ───────────────────────────────────────────────────── */}
      <div className="adm-card adm-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="adm-card-title">Connected site</div>
            <div className="adm-card-sub" style={{ marginTop: 2, wordBreak: "break-all" }}>
              {status.baseUrl}
            </div>
          </div>
          <button type="button" className="adm-btn-ghost" onClick={runTest} disabled={testing}>
            {testing ? <span className="adm-spinner" aria-hidden /> : <RefreshIcon className="h-4 w-4" />}
            Test connection
          </button>
        </div>
        {connection && (
          <div className="adm-card-sub" style={{
            marginTop: 10, padding: "9px 11px", borderRadius: 10,
            border: "1px solid var(--adm-bd)",
            background: connection.ok ? "rgb(var(--sa) / 0.08)" : "rgba(190,60,60,0.08)",
            color: connection.ok ? undefined : "rgb(150,40,40)",
          }}>
            {connection.ok ? (
              <>
                <span style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 4 }}>
                  <CheckIcon className="h-4 w-4" />
                </span>
                Authenticated as <strong>{connection.name}</strong>.{" "}
                {connection.caps.includes("publish_posts")
                  ? "This account can publish posts."
                  : "⚠️ This account can create drafts but NOT publish — it needs the Author role or above."}
              </>
            ) : connection.message}
          </div>
        )}
      </div>

      <WordPressCompose
        status={compose}
        categories={trendingCategories}
        onApply={applyDraft}
        busy={pending || loadingPost}
      />

      {/* ── editor ───────────────────────────────────────────────────────── */}
      <div className="adm-card adm-card-pad" id="wp-editor">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="adm-card-title" style={{ flex: 1 }}>
            {editingId === null ? "New WordPress post" : `Editing post #${editingId}`}
          </div>
          {editingId !== null && (
            <button type="button" className="adm-btn-ghost" onClick={resetForm} disabled={pending}>
              Cancel edit
            </button>
          )}
        </div>
        {loadingPost && <div className="adm-card-sub" style={{ marginTop: 8 }}>Loading post…</div>}
        {sourceLink && (
          <div className="adm-card-sub" style={{ marginTop: 8 }}>
            Drafted from a trending headline —{" "}
            <a className="adm-link" href={sourceLink} target="_blank" rel="noopener noreferrer">
              read the original
            </a>{" "}
            and check the facts before publishing.
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
          <label className="adm-field">
            <span>Title</span>
            <input
              data-field="title"
              className="adm-input" value={title} maxLength={320}
              onChange={(e) => { setTitle(e.target.value); if (fieldErrors.title) setFieldErrors((f) => ({ ...f, title: undefined })); }}
              placeholder="Post title"
              aria-invalid={!!fieldErrors.title}
            />
            {fieldErrors.title && <span style={{ color: "rgb(190,60,60)", fontSize: 12 }}>{fieldErrors.title}</span>}
          </label>

          <div className="adm-field">
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1 }}>Content</span>
              <span className="adm-seg" role="tablist" aria-label="Content format">
                {(["markdown", "html"] as const).map((f) => (
                  <button
                    key={f} type="button" role="tab" aria-selected={format === f}
                    className={`adm-seg-btn ${format === f ? "on" : ""}`}
                    onClick={() => { setFormat(f); setShowPreview(false); setPreviewHtml(""); }}
                  >
                    {f === "markdown" ? "Markdown" : "HTML"}
                  </button>
                ))}
              </span>
            </span>
            <textarea
              data-field="content"
              className="adm-input" value={content} rows={12} spellCheck
              onChange={(e) => { setContent(e.target.value); if (fieldErrors.content) setFieldErrors((f) => ({ ...f, content: undefined })); }}
              placeholder={format === "markdown"
                ? "Your opening paragraph.\n\n## A section\n\n- a point\n- another\n\n**Bold**, _italic_, [a link](https://example.com)."
                : "<p>Your opening paragraph.</p>\n\n<h2>A section</h2>\n<p>More text.</p>"}
              style={{ resize: "vertical", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 13, lineHeight: 1.6 }}
              aria-invalid={!!fieldErrors.content}
            />
            {fieldErrors.content && <span style={{ color: "rgb(190,60,60)", fontSize: 12 }}>{fieldErrors.content}</span>}
            <span className="adm-field-hint">
              {editingId !== null && format === "html"
                ? "This post was loaded from WordPress, which stores content as HTML — so it opens in HTML mode. Switch to Markdown only if you intend to rewrite the body."
                : format === "markdown"
                  ? "Converted to HTML before sending. Tables, task lists and strikethrough work (GFM); raw HTML passes through."
                  : "Sent to WordPress exactly as typed."}
            </span>
          </div>

          <div>
            <button
              type="button" className="adm-btn-ghost"
              onClick={async () => {
                if (showPreview) { setShowPreview(false); return; }
                if (format === "markdown") {
                  const res = await previewWordPressMarkdown(content);
                  if (!res.ok) { error(res.message); return; }
                  setPreviewHtml(res.data);
                } else {
                  setPreviewHtml(content);
                }
                setShowPreview(true);
              }}
            >
              {showPreview ? "Hide preview" : format === "markdown" ? "Preview rendered HTML" : "Preview HTML"}
            </button>
            {showPreview && (
              // Sandboxed with no allow-scripts: the preview renders the markup
              // exactly as WordPress will store it, without running any of it.
              <iframe
                title="Content preview"
                sandbox=""
                srcDoc={`<!doctype html><meta charset="utf-8"><style>body{font:15px/1.7 system-ui,sans-serif;margin:12px;color:#222}img{max-width:100%}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}pre{background:#f4f4f4;padding:8px;overflow:auto}</style>${previewHtml}`}
                style={{ width: "100%", height: 260, marginTop: 10, border: "1px solid var(--adm-bd)", borderRadius: 10, background: "#fff" }}
              />
            )}
          </div>

          <div className="adm-field">
            <span>Status</span>
            <div className="adm-seg" role="tablist" aria-label="Post status">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s.id} type="button" role="tab"
                  aria-selected={postStatus === s.id}
                  className={`adm-seg-btn ${postStatus === s.id ? "on" : ""}`}
                  onClick={() => setPostStatus(s.id)}
                  disabled={s.id === "publish" && !canPublish}
                  title={s.id === "publish" && !canPublish ? "This WordPress account cannot publish" : undefined}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="adm-settings-grid">
            <TermPicker
              label="Categories" terms={terms.categories} selected={categories} onChange={setCategories}
              emptyHint={termsError ?? "No categories found on the site."}
            />
            <TermPicker
              label="Tags" terms={terms.tags} selected={tags} onChange={setTags}
              emptyHint={termsError ?? "No tags found on the site."}
            />
          </div>

          <div className="adm-settings-grid">
            <WordPressFeaturedImage
              mediaId={featuredMedia}
              preview={featuredPreview}
              disabled={pending || loadingPost}
              onChange={(id, p) => { setFeaturedMedia(id); setFeaturedPreview(p); }}
            />
            <label className="adm-field">
              <span>Slug <span className="adm-field-hint" style={{ display: "inline" }}>(optional)</span></span>
              <input className="adm-input" value={slug} onChange={(e) => setSlug(e.target.value)}
                     placeholder="auto-generated from the title" autoComplete="off" spellCheck={false} />
            </label>
          </div>

          <label className="adm-field">
            <span>Excerpt <span className="adm-field-hint" style={{ display: "inline" }}>(optional)</span></span>
            <textarea className="adm-input" value={excerpt} rows={2} onChange={(e) => setExcerpt(e.target.value)}
                      placeholder="Short summary shown in listings." style={{ resize: "vertical" }} />
          </label>
        </div>

        <div className="adm-settings-actions" style={{ marginTop: 14 }}>
          <button type="button" className="adm-btn-primary" onClick={submit} disabled={pending || loadingPost}>
            {pending ? <span className="adm-spinner" aria-hidden /> : editingId === null ? <PlusIcon className="h-4 w-4" /> : <CheckIcon className="h-4 w-4" />}
            {editingId === null
              ? (postStatus === "publish" ? "Publish to WordPress" : "Save draft to WordPress")
              : "Save changes"}
          </button>
        </div>
      </div>

      {/* ── posts ────────────────────────────────────────────────────────── */}
      <div className="adm-card adm-card-pad">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="adm-card-title" style={{ flex: 1 }}>
            Posts on WordPress
            {totals.total > 0 && <span className="adm-field-hint" style={{ marginLeft: 8 }}>{totals.total} total</span>}
          </div>
          <button type="button" className="adm-btn-ghost" onClick={() => void loadPosts()} disabled={listing}>
            {listing ? <span className="adm-spinner" aria-hidden /> : <RefreshIcon className="h-4 w-4" />}
            Refresh
          </button>
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
          <div className="adm-seg" role="tablist" aria-label="Filter by status">
            {([["any", "All"], ["publish", "Published"], ["draft", "Drafts"]] as const).map(([id, label]) => (
              <button key={id} type="button" role="tab" aria-selected={filter === id}
                      className={`adm-seg-btn ${filter === id ? "on" : ""}`}
                      onClick={() => { setFilter(id); setPage(1); void loadPosts({ page: 1, status: id }); }}>
                {label}
              </button>
            ))}
          </div>
          <input
            className="adm-input" value={search} placeholder="Search titles…"
            style={{ flex: 1, minWidth: 160 }}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { setPage(1); void loadPosts({ page: 1, search }); } }}
          />
        </div>

        {listError && (
          <div className="adm-card-sub" style={{
            padding: "9px 11px", borderRadius: 10, border: "1px solid var(--adm-bd)",
            background: "rgba(190,60,60,0.08)", color: "rgb(150,40,40)",
          }}>
            {listError}
          </div>
        )}

        {!listError && posts.length === 0 && !listing && (
          <div className="adm-card-sub">No posts match.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {posts.map((p) => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px",
              border: "1px solid var(--adm-bd)", borderRadius: 12, background: "var(--adm-card)",
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {p.title}
                </div>
                <div className="adm-card-sub" style={{ marginTop: 3, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <StatusPill status={p.status} />
                  {p.modified && <span>edited {new Date(p.modified).toLocaleString()}</span>}
                </div>
              </div>
              {p.status === "publish" && (
                <button type="button" className="adm-btn-ghost adm-fb-act"
                        onClick={() => setShareTarget({ id: p.id, celebrate: false })}
                        aria-label={`Share ${p.title}`} title="Share / promote">
                  <ShareIcon className="h-4 w-4" />
                </button>
              )}
              <button type="button" className="adm-btn-ghost adm-fb-act" onClick={() => void openForEdit(p.id)}
                      disabled={pending || loadingPost} title="Edit in this dashboard">
                <PencilIcon className="h-4 w-4" />
              </button>
              <a className="adm-btn-ghost adm-fb-act" href={p.link} target="_blank" rel="noopener noreferrer" title="Open on WordPress">
                <ExternalLinkIcon className="h-4 w-4" />
              </a>
              <button type="button" className="adm-btn-ghost adm-fb-act adm-fb-danger" onClick={() => remove(p)}
                      disabled={pending} title="Move to trash on WordPress">
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>

        {totals.totalPages > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, justifyContent: "center" }}>
            <button type="button" className="adm-btn-ghost" disabled={page <= 1 || listing}
                    onClick={() => { const n = page - 1; setPage(n); void loadPosts({ page: n }); }}>
              Previous
            </button>
            <span className="adm-card-sub">Page {page} of {totals.totalPages}</span>
            <button type="button" className="adm-btn-ghost" disabled={page >= totals.totalPages || listing}
                    onClick={() => { const n = page + 1; setPage(n); void loadPosts({ page: n }); }}>
              Next
            </button>
          </div>
        )}
      </div>

      {shareTarget && (
        <SharePromoteModal
          source={{ kind: "wordpress", id: shareTarget.id }}
          celebrate={shareTarget.celebrate}
          onClose={() => setShareTarget(null)}
        />
      )}
    </div>
  );
}
