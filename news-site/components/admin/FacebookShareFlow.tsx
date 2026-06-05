"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  publishArticleNow,
  listPublishedArticlesForShare,
  facebookRefreshPages,
  type ShareArticleItem,
} from "@/app/admin/facebook-actions";
import { useToast } from "@/components/admin/Toast";
import { ConnectModal } from "./FacebookConnectModal";
import { ArticleThumb } from "./ArticleThumb";
import type { FacebookPageView } from "./FacebookPagesManager";
import {
  FacebookIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  CheckIcon,
} from "@/components/admin/icons";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";
import { permalinkForPost } from "@/lib/facebook";

type Step = "pages" | "articles";
type PostStatus = { status: "pending" | "posting" | "ok" | "fail"; error?: string; postId?: string };

const PER_PAGE = 9;
const AVATAR_COLORS = ["#1877f2", "#16a34a", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9"];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/** Page avatar: best-effort public Page picture with a tidy initials fallback. */
function PageAvatar({ pageId, name, size = 40 }: { pageId: string; name: string; size?: number }) {
  const [imgOk, setImgOk] = useState(true);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        overflow: "hidden",
        background: avatarColor(pageId || name),
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.42 }}>
        {initial}
      </span>
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://graph.facebook.com/${encodeURIComponent(pageId)}/picture?type=square&width=${size * 2}&height=${size * 2}`}
          alt=""
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

/**
 * Two-step Facebook sharing flow.
 *  Step 1 — select one or more connected Pages (cards w/ checkboxes).
 *  Step 2 — pick a published article, tweak the caption, post to each selected
 *           Page via the Graph API (existing `publishArticleNow`), one at a time
 *           with live per-page status so a single failure never blocks the rest.
 * Page management (connect / refresh / disconnect) stays in the Pages manager
 * below; this flow reuses the same ConnectModal + refresh action.
 */
export function FacebookShareFlow({
  pages,
  connect,
}: {
  pages: FacebookPageView[];
  connect?: { appConfigured: boolean; userTokenSaved: boolean; userTokenExpiresAt: string | null };
}) {
  const router = useRouter();
  const { success, error } = useToast();

  const [step, setStep] = useState<Step>("pages");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    () => (pages.length === 1 ? new Set([pages[0].id]) : new Set()),
  );
  const [showConnect, setShowConnect] = useState(false);
  const [refreshingAll, setRefreshingAll] = useState(false);

  // Step 2 — article picker
  const [items, setItems] = useState<ShareArticleItem[]>([]);
  const [total, setTotal] = useState(0);
  const [q, setQ] = useState("");
  const [pageNum, setPageNum] = useState(1);
  const [loadingArticles, setLoadingArticles] = useState(false);

  // Step 2 — compose / post
  const [article, setArticle] = useState<ShareArticleItem | null>(null);
  const [caption, setCaption] = useState("");
  const [posting, setPosting] = useState(false);
  const [progress, setProgress] = useState<Record<string, PostStatus>>({});
  const [done, setDone] = useState(false);

  const selectedPages = useMemo(() => pages.filter((p) => selectedPageIds.has(p.id)), [pages, selectedPageIds]);
  const expiredSelected = selectedPages.filter((p) => p.status !== "Connected");
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Fetch published articles when on Step 2 (debounced on the query).
  useEffect(() => {
    if (step !== "articles") return;
    let cancelled = false;
    setLoadingArticles(true);
    const t = setTimeout(async () => {
      const res = await listPublishedArticlesForShare({ q, page: pageNum, perPage: PER_PAGE });
      if (cancelled) return;
      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
      } else {
        error(res.error);
      }
      setLoadingArticles(false);
    }, q ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [step, q, pageNum, error]);

  function togglePage(id: string) {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allSelected = pages.length > 0 && pages.every((p) => selectedPageIds.has(p.id));
  function toggleAll() {
    setSelectedPageIds(allSelected ? new Set() : new Set(pages.map((p) => p.id)));
  }

  async function onRefreshPages() {
    setRefreshingAll(true);
    const res = await facebookRefreshPages();
    setRefreshingAll(false);
    if (!res.ok) return error(res.error);
    const { refreshed, added } = res.data;
    success(added > 0 ? `Synced ${refreshed + added} Page${refreshed + added === 1 ? "" : "s"} (${added} new).` : `Refreshed ${refreshed} Page${refreshed === 1 ? "" : "s"}.`);
    router.refresh();
  }

  function goToArticles() {
    if (selectedPageIds.size === 0) return;
    setStep("articles");
    setArticle(null);
    setQ("");
    setPageNum(1);
    setDone(false);
    setProgress({});
  }

  function defaultCaption(a: ShareArticleItem): string {
    const parts = [a.title];
    if (a.excerpt) parts.push("", a.excerpt);
    parts.push("", `Read more on ${siteConfig.name}:`, `${siteConfig.url}/news/${a.slug}`);
    return parts.join("\n");
  }

  function chooseArticle(a: ShareArticleItem) {
    setArticle(a);
    setCaption(defaultCaption(a));
    setDone(false);
    setProgress({});
  }

  // Post to each selected Page sequentially (Graph API) with live status; one
  // page failing never stops the others. Records history via the action.
  async function share() {
    if (!article) return;
    const ids = [...selectedPageIds];
    if (ids.length === 0) return error("Select at least one page.");
    setPosting(true);
    setDone(false);
    setProgress(Object.fromEntries(ids.map((id) => [id, { status: "pending" as const }])));

    let okCount = 0;
    for (const id of ids) {
      setProgress((p) => ({ ...p, [id]: { status: "posting" } }));
      const res = await publishArticleNow({ articleId: article.id, pageDbIds: [id], caption });
      const r = res.ok ? res.data[0] : null;
      if (res.ok && r?.ok) {
        okCount++;
        setProgress((p) => ({ ...p, [id]: { status: "ok", postId: r.graphPostId } }));
      } else {
        const msg = res.ok ? r?.error ?? "Failed to post." : res.error;
        setProgress((p) => ({ ...p, [id]: { status: "fail", error: msg } }));
      }
    }

    setPosting(false);
    setDone(true);
    const totalSel = ids.length;
    if (okCount === totalSel) success(`Posted to all ${totalSel} page${totalSel === 1 ? "" : "s"}.`);
    else if (okCount === 0) error(`All ${totalSel} posts failed — see details below.`);
    else success(`Posted to ${okCount} of ${totalSel} pages — see details below.`);
    router.refresh();
  }

  const okCount = Object.values(progress).filter((p) => p.status === "ok").length;

  return (
    <div style={{ marginBottom: 22 }}>
      <div className="adm-pagehead">
        <div className="adm-page-h" style={{ marginBottom: 0 }}>
          <h1>Share to Facebook</h1>
          <p>
            {step === "pages"
              ? "Step 1 of 2 — choose the Page(s) to share an article to"
              : "Step 2 of 2 — pick an article and post it"}
          </p>
        </div>
        {step === "pages" && pages.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {connect?.userTokenSaved && (
              <button type="button" className="adm-btn-ghost adm-head-cta" onClick={onRefreshPages} disabled={refreshingAll} title="Re-sync Pages from Facebook">
                <RefreshIcon className={`h-[18px] w-[18px] ${refreshingAll ? "adm-spinning" : ""}`} />
                {refreshingAll ? "Refreshing…" : "Refresh Pages"}
              </button>
            )}
            <button type="button" className="adm-btn-ghost adm-head-cta" onClick={() => setShowConnect(true)}>
              <PlusIcon className="h-[18px] w-[18px]" />
              Connect New Page
            </button>
          </div>
        )}
      </div>

      {/* ───────────────────────── STEP 1 — pages ───────────────────────── */}
      {step === "pages" && (
        pages.length === 0 ? (
          <div className="adm-card">
            <div className="adm-empty">
              <div className="adm-ill"><FacebookIcon className="h-[38px] w-[38px]" /></div>
              <h2 className="adm-serif">No Pages connected yet</h2>
              <p>Connect a Facebook Page to share articles to it via the Graph API. Tokens are encrypted and never leave the server.</p>
              <button type="button" className="adm-btn-primary" style={{ marginTop: 18 }} onClick={() => setShowConnect(true)}>
                <PlusIcon className="h-[18px] w-[18px]" /> Connect New Page
              </button>
            </div>
          </div>
        ) : (
          <div className="adm-card adm-card-pad">
            <div className="adm-list-head" style={{ alignItems: "center" }}>
              <div className="adm-card-title">Select page{pages.length === 1 ? "" : "s"} to share to</div>
              {pages.length > 1 && (
                <button type="button" className="adm-fb-grouptoggle" onClick={toggleAll}>
                  {allSelected ? "Clear all" : "Select all"}
                </button>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12, marginTop: 12 }}>
              {pages.map((p) => {
                const on = selectedPageIds.has(p.id);
                const connected = p.status === "Connected";
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => togglePage(p.id)}
                    aria-pressed={on}
                    style={{
                      textAlign: "left",
                      display: "flex",
                      gap: 11,
                      alignItems: "center",
                      padding: 12,
                      borderRadius: 14,
                      cursor: "pointer",
                      background: "var(--adm-card)",
                      border: on ? "2px solid rgb(var(--accent))" : "1px solid var(--adm-bd)",
                      boxShadow: on ? "0 0 0 3px rgba(var(--accent), 0.12)" : "none",
                      transition: "border-color .12s, box-shadow .12s",
                    }}
                  >
                    <PageAvatar pageId={p.pageId} name={p.pageName} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 700, color: "var(--adm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {p.pageName}
                      </span>
                      <span className="adm-fb-sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 999, background: connected ? "#16a34a" : "#dc2626", display: "inline-block", flex: "none" }} />
                        {connected ? "Connected" : "Expired"} · {p.categoryGroup}
                      </span>
                      <span className="adm-fb-sub" style={{ display: "block" }}>
                        {formatNumber(p.postedCount)} posted{p.pendingCount > 0 ? ` · ${p.pendingCount} scheduled` : ""}
                      </span>
                    </span>
                    <span
                      aria-hidden
                      style={{
                        width: 22, height: 22, flex: "none", borderRadius: 7,
                        border: on ? "none" : "1.5px solid var(--adm-bd)",
                        background: on ? "rgb(var(--accent))" : "transparent",
                        color: "#fff", display: "grid", placeItems: "center",
                      }}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                  </button>
                );
              })}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
              <button type="button" className="adm-btn-primary" onClick={goToArticles} disabled={selectedPageIds.size === 0}>
                <FacebookIcon className="h-4 w-4" />
                Share Article →
              </button>
              <span className="adm-field-hint" style={{ margin: 0 }}>
                {selectedPageIds.size === 0
                  ? "Select at least one page to continue."
                  : `${selectedPageIds.size} page${selectedPageIds.size === 1 ? "" : "s"} selected.`}
              </span>
            </div>
          </div>
        )
      )}

      {/* ──────────────────────── STEP 2 — article ──────────────────────── */}
      {step === "articles" && (
        <div className="adm-card adm-card-pad">
          {/* Sharing-to bar */}
          <div className="adm-list-head" style={{ alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <button type="button" className="adm-link" onClick={() => setStep("pages")} disabled={posting} style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                ← Back to pages
              </button>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                <span className="adm-card-sub" style={{ marginTop: 0 }}>Sharing to:</span>
                {selectedPages.map((p) => (
                  <span key={p.id} className="adm-pill" style={{ gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: p.status === "Connected" ? "#16a34a" : "#dc2626", display: "inline-block" }} />
                    {p.pageName}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {expiredSelected.length > 0 && (
            <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 6 }}>
              {expiredSelected.map((p) => p.pageName).join(", ")} need{expiredSelected.length === 1 ? "s" : ""} reconnecting — fix it in “Facebook Pages” below; other pages will still post.
            </p>
          )}

          {/* Sub-step: pick an article, or compose once one is chosen */}
          {!article ? (
            <div style={{ marginTop: 14 }}>
              <label className="adm-search" style={{ maxWidth: 360 }}>
                <SearchIcon className="h-4 w-4" aria-hidden />
                <input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPageNum(1); }}
                  placeholder="Search published articles…"
                  aria-label="Search published articles"
                />
              </label>

              {loadingArticles ? (
                <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
                  <span className="adm-spinner" aria-hidden /> Loading articles…
                </p>
              ) : items.length === 0 ? (
                <p className="adm-card-sub" style={{ marginTop: 16 }}>
                  {q ? `No published articles match “${q}”.` : "No published articles yet."}
                </p>
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12, marginTop: 14 }}>
                    {items.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => chooseArticle(a)}
                        style={{
                          textAlign: "left", display: "flex", gap: 11, alignItems: "center", padding: 10,
                          borderRadius: 13, cursor: "pointer", background: "var(--adm-card)",
                          border: "1px solid var(--adm-bd)",
                        }}
                      >
                        <ArticleThumb cover={a.coverImage} title={a.title} />
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontWeight: 600, color: "var(--adm-ink)", fontSize: 13.5, lineHeight: 1.3 }}>
                            {a.title}
                          </span>
                          <span className="adm-fb-sub" style={{ display: "block", marginTop: 4 }}>
                            {a.publishedAt ? formatDate(a.publishedAt) : "—"} · {formatNumber(a.views)} views
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>

                  {totalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
                      <button type="button" className="adm-btn-ghost" onClick={() => setPageNum((n) => Math.max(1, n - 1))} disabled={pageNum <= 1}>
                        ← Prev
                      </button>
                      <span className="adm-field-hint" style={{ margin: 0 }}>Page {pageNum} of {totalPages}</span>
                      <button type="button" className="adm-btn-ghost" onClick={() => setPageNum((n) => Math.min(totalPages, n + 1))} disabled={pageNum >= totalPages}>
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : (
            <div style={{ marginTop: 14 }}>
              {/* Compose */}
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 300px", minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <ArticleThumb cover={article.coverImage} title={article.title} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: "var(--adm-ink)" }}>{article.title}</div>
                      <Link href={`${siteConfig.url}/news/${article.slug}`} target="_blank" rel="noreferrer" className="adm-link" style={{ fontSize: 12.5 }}>
                        /news/{article.slug}
                      </Link>
                    </div>
                  </div>

                  <label className="adm-field" style={{ marginTop: 12 }}>
                    <span>Caption (editable)</span>
                    <textarea
                      className="adm-input"
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      rows={7}
                      disabled={posting}
                      aria-label="Post caption"
                      placeholder="Caption for the Facebook post"
                    />
                    <span className="adm-field-hint">The article link preview is attached automatically by Facebook. Edit the text or leave the default.</span>
                  </label>
                </div>
              </div>

              {/* Per-page progress / results */}
              {Object.keys(progress).length > 0 && (
                <div className="adm-fb-results" style={{ marginTop: 6 }}>
                  {selectedPages.map((p) => {
                    const st = progress[p.id];
                    if (!st) return null;
                    const cls = st.status === "ok" ? "ok" : st.status === "fail" ? "bad" : "";
                    return (
                      <div key={p.id} className={`adm-fb-result ${cls}`}>
                        <span className="adm-fb-result-dot" aria-hidden />
                        <span style={{ fontWeight: 600 }}>{p.pageName}</span>
                        <span className="adm-fb-result-msg">
                          {st.status === "posting" ? "Posting…"
                            : st.status === "pending" ? "Waiting…"
                              : st.status === "ok"
                                ? st.postId
                                  ? <a href={permalinkForPost(st.postId)} target="_blank" rel="noreferrer" className="adm-link">View post →</a>
                                  : "Posted ✓"
                                : (st.error ?? "Failed to post.")}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {done && (
                <p className="adm-fb-target" aria-live="polite" style={{ marginTop: 10 }}>
                  <span className="adm-fb-target-dot" aria-hidden />
                  Posted to <strong>{okCount}</strong> of <strong>{selectedPages.length}</strong> page{selectedPages.length === 1 ? "" : "s"}.
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                {!done ? (
                  <>
                    <button type="button" className="adm-btn-primary" onClick={share} disabled={posting || !caption.trim()}>
                      {posting ? <span className="adm-spinner" aria-hidden /> : <FacebookIcon className="h-4 w-4" />}
                      {posting ? "Posting…" : `Share to ${selectedPages.length} page${selectedPages.length === 1 ? "" : "s"}`}
                    </button>
                    <button type="button" className="adm-btn-ghost" onClick={() => setArticle(null)} disabled={posting}>
                      Choose a different article
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="adm-btn-primary" onClick={() => { setArticle(null); setDone(false); setProgress({}); }}>
                      Share another article
                    </button>
                    <button type="button" className="adm-btn-ghost" onClick={() => setStep("pages")}>
                      Back to pages
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showConnect && (
        <ConnectModal
          onClose={() => setShowConnect(false)}
          onConnected={() => { setShowConnect(false); success("Page connected."); router.refresh(); }}
          onError={error}
        />
      )}
    </div>
  );
}
