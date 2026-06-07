"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  publishArticleNow,
  listPublishedArticlesForShare,
  scheduleArticleShares,
  type ShareArticleItem,
} from "@/app/admin/facebook-actions";
import { useToast } from "@/components/admin/Toast";
import { ConnectModal } from "./FacebookConnectModal";
import { ArticleThumb } from "./ArticleThumb";
import type { FacebookPageView } from "./FacebookPagesManager";
import {
  FacebookIcon,
  PlusIcon,
  SearchIcon,
  CheckIcon,
  CalendarIcon,
} from "@/components/admin/icons";
import { formatDate, formatNumber, siteConfig } from "@/lib/site";
import { permalinkForPost } from "@/lib/facebook";
import { formatSchedule, nowLocalInput, localInputToUtcISO, SCHEDULE_TZ } from "@/lib/fbSchedule";
import { sortCategoryGroups } from "@/lib/facebookGroups";

type Step = "pages" | "articles";
type PostStatus = { status: "pending" | "posting" | "ok" | "fail" | "cancelled"; error?: string; postId?: string };

const PER_PAGE = 9;
const TZ_LABEL = SCHEDULE_TZ.replace("_", " ");
const AVATAR_COLORS = ["#1877f2", "#16a34a", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9"];

function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

// Presets for the gap between pages when posting to several at once (seconds).
// 0 = post immediately. A delay lowers spam-flag risk but is a courtesy, not a
// guarantee — reasonable volume + original content matter more.
const DELAY_PRESETS = [
  { label: "None", value: 0 },
  { label: "30 seconds", value: 30 },
  { label: "1 minute", value: 60 },
  { label: "2 minutes", value: 120 },
  { label: "5 minutes", value: 300 },
];
const DEFAULT_DELAY = 60; // safe default (30–60s range)

/** Vary a delay by ±25% so the gaps aren't suspiciously identical. */
function applyJitter(secs: number): number {
  if (secs <= 0) return 0;
  return Math.max(1, Math.round(secs * (0.75 + Math.random() * 0.5)));
}
function formatDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/** Page avatar: the real Page picture (resolved server-side with the Page token
 *  via the avatar proxy) over a tidy coloured-initial fallback. */
function PageAvatar({ dbId, name, size = 40 }: { dbId: string; name: string; size?: number }) {
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
        background: avatarColor(dbId || name),
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: size * 0.42 }}>
        {initial}
      </span>
      {imgOk && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/admin/facebook/${encodeURIComponent(dbId)}/picture?size=${size * 2}`}
          alt=""
          onError={() => setImgOk(false)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}

/** One selectable Page card (avatar, name, status, post count + check state). */
function PageCard({ page, selected, onToggle }: { page: FacebookPageView; selected: boolean; onToggle: () => void }) {
  const p = page;
  const on = selected;
  const connected = p.status === "Connected";
  return (
    <button
      type="button"
      onClick={onToggle}
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
      <PageAvatar dbId={p.id} name={p.pageName} />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span style={{ display: "block", fontWeight: 700, color: "var(--adm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {p.pageName}
        </span>
        <span className="adm-fb-sub" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: connected ? "#16a34a" : "#dc2626", display: "inline-block", flex: "none" }} />
          {connected ? "Connected" : "Expired"}
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
}: {
  pages: FacebookPageView[];
}) {
  const router = useRouter();
  const { success, error } = useToast();

  const [step, setStep] = useState<Step>("pages");
  const [selectedPageIds, setSelectedPageIds] = useState<Set<string>>(
    () => (pages.length === 1 ? new Set([pages[0].id]) : new Set()),
  );
  const [showConnect, setShowConnect] = useState(false);

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

  // Between-pages delay (only applies when posting to multiple pages).
  const [delaySeconds, setDelaySeconds] = useState(DEFAULT_DELAY);
  const [customMode, setCustomMode] = useState(false);
  const [jitter, setJitter] = useState(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [waitingFor, setWaitingFor] = useState<string | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const cancelRef = useRef(false);
  const countdownIvRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownResolveRef = useRef<(() => void) | null>(null);

  // Scheduling (server-side; fires via Vercel Cron even while offline)
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [scheduleAt, setScheduleAt] = useState("");
  const [perPageTime, setPerPageTime] = useState(false);
  const [perPageAt, setPerPageAt] = useState<Record<string, string>>({});
  const [scheduling, setScheduling] = useState(false);
  const [scheduledOk, setScheduledOk] = useState<{ pageName: string; at: string }[] | null>(null);

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

  // Remember the delay choice across sessions (per browser).
  useEffect(() => {
    try {
      const d = localStorage.getItem("fb.shareDelay");
      if (d != null) {
        const n = parseInt(d, 10);
        if (Number.isFinite(n) && n >= 0) {
          setDelaySeconds(n);
          setCustomMode(!DELAY_PRESETS.some((p) => p.value === n));
        }
      }
      const j = localStorage.getItem("fb.shareJitter");
      if (j != null) setJitter(j === "1");
    } catch {
      /* localStorage unavailable (private mode) */
    }
  }, []);
  useEffect(() => {
    try { localStorage.setItem("fb.shareDelay", String(delaySeconds)); } catch { /* ignore */ }
  }, [delaySeconds]);
  useEffect(() => {
    try { localStorage.setItem("fb.shareJitter", jitter ? "1" : "0"); } catch { /* ignore */ }
  }, [jitter]);
  // Clear any running countdown timer on unmount.
  useEffect(() => () => { if (countdownIvRef.current) clearInterval(countdownIvRef.current); }, []);

  function togglePage(id: string) {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  // Filter the Step-1 picker by name / group / id so a Page is easy to find.
  const [pageQuery, setPageQuery] = useState("");
  const visiblePages = useMemo(() => {
    const q = pageQuery.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter(
      (p) =>
        p.pageName.toLowerCase().includes(q) ||
        p.categoryGroup.toLowerCase().includes(q) ||
        p.pageId.toLowerCase().includes(q),
    );
  }, [pages, pageQuery]);

  // Group the (filtered) pages by their category/niche so each group gets its
  // own box with a "Select all / Unselect all" toggle. Known groups first
  // (sortCategoryGroups), then any custom ones A–Z; missing → "Uncategorized".
  const groupedPages = useMemo(() => {
    const byGroup = new Map<string, FacebookPageView[]>();
    for (const p of visiblePages) {
      const g = p.categoryGroup?.trim() || "Uncategorized";
      const arr = byGroup.get(g) ?? [];
      arr.push(p);
      byGroup.set(g, arr);
    }
    return sortCategoryGroups([...byGroup.keys()]).map((group) => ({
      group,
      pages: byGroup.get(group)!,
    }));
  }, [visiblePages]);

  // "Select all" acts on the currently-visible (filtered) Pages.
  const allVisibleSelected = visiblePages.length > 0 && visiblePages.every((p) => selectedPageIds.has(p.id));
  function toggleAll() {
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      for (const p of visiblePages) {
        if (allVisibleSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  // Select / unselect every Page within a single group box.
  function toggleGroup(groupPages: FacebookPageView[]) {
    const allOn = groupPages.length > 0 && groupPages.every((p) => selectedPageIds.has(p.id));
    setSelectedPageIds((prev) => {
      const next = new Set(prev);
      for (const p of groupPages) {
        if (allOn) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  }

  function goToArticles() {
    if (selectedPageIds.size === 0) return;
    setStep("articles");
    setArticle(null);
    setQ("");
    setPageNum(1);
    setDone(false);
    setCancelled(false);
    setScheduledOk(null);
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
    setCancelled(false);
    setScheduledOk(null);
    setProgress({});
  }

  // Cancellable countdown for the gap between pages. Resolves true if interrupted
  // (Stop pressed), false when it elapses naturally.
  function countdownSleep(totalSecs: number): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let left = totalSecs;
      setCountdown(left);
      const finish = (interrupted: boolean) => {
        if (countdownIvRef.current) { clearInterval(countdownIvRef.current); countdownIvRef.current = null; }
        countdownResolveRef.current = null;
        setCountdown(null);
        resolve(interrupted);
      };
      countdownResolveRef.current = () => finish(true);
      countdownIvRef.current = setInterval(() => {
        left -= 1;
        if (left <= 0) finish(false);
        else setCountdown(left);
      }, 1000);
    });
  }

  // Stop the sequence: skip remaining pages + interrupt any active countdown.
  function stop() {
    cancelRef.current = true;
    if (countdownResolveRef.current) countdownResolveRef.current();
  }

  // Post to each selected Page sequentially (Graph API) with a configurable gap
  // between pages + live status. One page failing never stops the rest; Stop
  // cancels the remaining queue. Client-driven — keep this page open until done.
  async function share() {
    if (!article) return;
    const ids = [...selectedPageIds];
    if (ids.length === 0) return error("Select at least one page.");
    cancelRef.current = false;
    setCancelled(false);
    setDone(false);
    setPosting(true);
    setCountdown(null);
    setWaitingFor(null);
    setProgress(Object.fromEntries(ids.map((id) => [id, { status: "pending" as const }])));

    const gap = ids.length > 1 ? Math.max(0, delaySeconds) : 0;
    let okCount = 0;

    for (let i = 0; i < ids.length; i++) {
      if (cancelRef.current) break;
      const id = ids[i];
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

      // Wait before the next page (skip after the last / when no gap / cancelled).
      if (i < ids.length - 1 && gap > 0 && !cancelRef.current) {
        setWaitingFor(pages.find((p) => p.id === ids[i + 1])?.pageName ?? null);
        const interrupted = await countdownSleep(jitter ? applyJitter(gap) : gap);
        setWaitingFor(null);
        if (interrupted || cancelRef.current) break;
      }
    }

    setCountdown(null);
    setWaitingFor(null);
    setPosting(false);

    const totalSel = ids.length;
    if (cancelRef.current) {
      setCancelled(true);
      setProgress((p) => {
        const next = { ...p };
        for (const id of ids) if (next[id]?.status === "pending") next[id] = { status: "cancelled" };
        return next;
      });
      success(`Stopped — posted to ${okCount} of ${totalSel} page${totalSel === 1 ? "" : "s"}.`);
    } else {
      setDone(true);
      if (okCount === totalSel) success(`Posted to all ${totalSel} page${totalSel === 1 ? "" : "s"}.`);
      else if (okCount === 0) error(`All ${totalSel} posts failed — see details below.`);
      else success(`Posted to ${okCount} of ${totalSel} pages — see details below.`);
    }
    router.refresh();
  }

  // Queue server-side scheduled posts (one per page) — they fire via the Vercel
  // Cron runner even while the admin is closed. Times are entered in Phnom_Penh.
  async function schedule() {
    if (!article) return;
    const ids = [...selectedPageIds];
    if (ids.length === 0) return error("Select at least one page.");
    const multi = ids.length > 1 && perPageTime;
    const schedules: { pageDbId: string; scheduledAt: string }[] = [];
    for (const id of ids) {
      const iso = localInputToUtcISO(multi ? perPageAt[id] ?? "" : scheduleAt);
      if (!iso) {
        const name = pages.find((p) => p.id === id)?.pageName ?? "a page";
        return error(multi ? `Pick a date & time for “${name}”.` : "Pick a date & time.");
      }
      if (new Date(iso).getTime() < Date.now()) return error("Pick a time in the future.");
      schedules.push({ pageDbId: id, scheduledAt: iso });
    }
    setScheduling(true);
    const res = await scheduleArticleShares({ articleId: article.id, caption, schedules });
    setScheduling(false);
    if (!res.ok) return error(res.error);
    setScheduledOk(schedules.map((s) => ({
      pageName: pages.find((p) => p.id === s.pageDbId)?.pageName ?? "Page",
      at: formatSchedule(s.scheduledAt),
    })));
    success(`Scheduled ${res.data.count} post${res.data.count === 1 ? "" : "s"}.`);
    router.refresh();
  }

  const okCount = Object.values(progress).filter((p) => p.status === "ok").length;

  return (
    <div style={{ marginBottom: 22 }}>
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
              {visiblePages.length > 1 && (
                <button type="button" className="adm-fb-grouptoggle" onClick={toggleAll}>
                  {allVisibleSelected ? (pageQuery.trim() ? "Clear these" : "Clear all") : "Select all"}
                </button>
              )}
            </div>

            {pages.length > 1 && (
              <label className="adm-search" style={{ maxWidth: 360, marginTop: 12 }}>
                <SearchIcon className="h-4 w-4" aria-hidden />
                <input
                  value={pageQuery}
                  onChange={(e) => setPageQuery(e.target.value)}
                  placeholder="Search pages by name or group…"
                  aria-label="Search pages"
                />
              </label>
            )}

            {visiblePages.length === 0 ? (
              <p className="adm-card-sub" style={{ marginTop: 14 }}>No pages match “{pageQuery}”.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12 }}>
                {groupedPages.map(({ group, pages: groupPages }) => {
                  const selectedInGroup = groupPages.reduce((n, p) => n + (selectedPageIds.has(p.id) ? 1 : 0), 0);
                  const allOn = selectedInGroup === groupPages.length;
                  return (
                    <div
                      key={group}
                      style={{ border: "1px solid var(--adm-bd)", borderRadius: 14, padding: 12, background: "rgba(127, 140, 170, 0.06)" }}
                    >
                      <div className="adm-fb-grouphd" style={{ justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                          <span className="adm-fb-groupname">{group}</span>
                          <span className="adm-fb-groupcount">{groupPages.length}</span>
                          {selectedInGroup > 0 && (
                            <span className="adm-fb-sub">{selectedInGroup} selected</span>
                          )}
                        </span>
                        <button type="button" className="adm-fb-grouptoggle" onClick={() => toggleGroup(groupPages)}>
                          {allOn ? "Unselect all" : "Select all"}
                        </button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 12 }}>
                        {groupPages.map((p) => (
                          <PageCard key={p.id} page={p} selected={selectedPageIds.has(p.id)} onToggle={() => togglePage(p.id)} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

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

              {/* When to post — now (immediate) or schedule (server-side) */}
              {!posting && !done && !cancelled && !scheduledOk && (
                <div className="adm-seg" role="tablist" aria-label="When to post" style={{ marginTop: 10, width: "fit-content" }}>
                  <button type="button" role="tab" aria-selected={mode === "now"} className={`adm-seg-btn ${mode === "now" ? "on" : ""}`} onClick={() => setMode("now")}>Post now</button>
                  <button type="button" role="tab" aria-selected={mode === "schedule"} className={`adm-seg-btn ${mode === "schedule" ? "on" : ""}`} onClick={() => setMode("schedule")}>Schedule</button>
                </div>
              )}

              {mode === "now" ? (
                <>
              {/* Delay between pages — only relevant when posting to several */}
              {selectedPages.length > 1 && (
                <div className="adm-field" style={{ marginTop: 10 }}>
                  <span>
                    Delay between pages{" "}
                    <span className="adm-field-hint" style={{ display: "inline" }}>— posts run one at a time with this gap, to avoid rapid multi-page posting</span>
                  </span>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <select
                      className="adm-input"
                      style={{ maxWidth: 170 }}
                      value={customMode ? "custom" : String(delaySeconds)}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "custom") setCustomMode(true);
                        else { setCustomMode(false); setDelaySeconds(Number(v)); }
                      }}
                      disabled={posting}
                      aria-label="Delay between pages"
                    >
                      {DELAY_PRESETS.map((p) => (
                        <option key={p.value} value={String(p.value)}>{p.label}</option>
                      ))}
                      <option value="custom">Custom…</option>
                    </select>
                    {customMode && (
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <input
                          type="number"
                          min={0}
                          max={3600}
                          className="adm-input"
                          style={{ width: 92 }}
                          value={delaySeconds}
                          onChange={(e) => setDelaySeconds(Math.max(0, Math.min(3600, Math.floor(Number(e.target.value) || 0))))}
                          disabled={posting}
                          aria-label="Custom delay in seconds"
                        />
                        <span className="adm-field-hint" style={{ margin: 0 }}>seconds</span>
                      </span>
                    )}
                    <label className="adm-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={jitter} onChange={(e) => setJitter(e.target.checked)} disabled={posting} />
                      <span>Vary a little</span>
                    </label>
                  </div>
                  <span className="adm-field-hint">
                    {delaySeconds > 0
                      ? `~${formatDuration(delaySeconds)} between pages${jitter ? " (varied ±25%)" : ""} · about ${formatDuration(delaySeconds * (selectedPages.length - 1))} total. Keep this page open until it finishes.`
                      : "No delay — posts to all selected pages back-to-back."}
                  </span>
                </div>
              )}

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
                              : st.status === "cancelled" ? "Cancelled"
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

              {countdown != null && (
                <p className="adm-fb-target" aria-live="polite" style={{ marginTop: 8 }}>
                  <span className="adm-spinner" aria-hidden />
                  Waiting {formatDuration(countdown)} before {waitingFor ? `“${waitingFor}”` : "the next page"}…
                </p>
              )}

              {(done || cancelled) && (
                <p className="adm-fb-target" aria-live="polite" style={{ marginTop: 10 }}>
                  <span className="adm-fb-target-dot" aria-hidden />
                  {cancelled ? "Stopped — posted" : "Posted"} to <strong>{okCount}</strong> of <strong>{selectedPages.length}</strong> page{selectedPages.length === 1 ? "" : "s"}.
                </p>
              )}

              {/* Actions */}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                {posting ? (
                  <>
                    <button type="button" className="adm-btn-primary" disabled>
                      <span className="adm-spinner" aria-hidden /> Posting…
                    </button>
                    <button type="button" className="adm-btn-ghost adm-fb-danger" onClick={stop}>
                      Stop
                    </button>
                  </>
                ) : done || cancelled ? (
                  <>
                    <button type="button" className="adm-btn-primary" onClick={() => { setArticle(null); setDone(false); setCancelled(false); setProgress({}); }}>
                      Share another article
                    </button>
                    <button type="button" className="adm-btn-ghost" onClick={() => setStep("pages")}>
                      Back to pages
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="adm-btn-primary" onClick={share} disabled={!caption.trim()}>
                      <FacebookIcon className="h-4 w-4" />
                      {selectedPages.length > 1 ? `Share to ${selectedPages.length} pages` : "Share to page"}
                    </button>
                    <button type="button" className="adm-btn-ghost" onClick={() => setArticle(null)}>
                      Choose a different article
                    </button>
                  </>
                )}
              </div>
                </>
              ) : (
                <>
                  {/* Schedule mode — server-side, fires via cron while offline */}
                  {scheduledOk ? (
                    <div style={{ marginTop: 12 }}>
                      <p className="adm-fb-target" aria-live="polite">
                        <span className="adm-fb-target-dot" aria-hidden />
                        Scheduled — these will auto-post even while you’re offline:
                      </p>
                      <ul className="adm-fb-sub" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                        {scheduledOk.map((s) => (
                          <li key={s.pageName}><strong>{s.pageName}</strong> — {s.at}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <div style={{ marginTop: 10 }}>
                      {selectedPages.length > 1 && (
                        <label className="adm-check" style={{ marginBottom: 4 }}>
                          <input type="checkbox" checked={perPageTime} onChange={(e) => setPerPageTime(e.target.checked)} disabled={scheduling} />
                          <span>Set a different time per page</span>
                        </label>
                      )}
                      {selectedPages.length > 1 && perPageTime ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                          {selectedPages.map((p) => (
                            <label key={p.id} className="adm-field" style={{ marginTop: 0 }}>
                              <span>{p.pageName} — date &amp; time ({TZ_LABEL})</span>
                              <input type="datetime-local" className="adm-input" style={{ maxWidth: 260 }} value={perPageAt[p.id] ?? ""} min={nowLocalInput()} onChange={(e) => setPerPageAt((m) => ({ ...m, [p.id]: e.target.value }))} disabled={scheduling} />
                            </label>
                          ))}
                        </div>
                      ) : (
                        <label className="adm-field" style={{ marginTop: 0 }}>
                          <span>Date &amp; time ({TZ_LABEL}){selectedPages.length > 1 ? " — same time for all selected pages" : ""}</span>
                          <input type="datetime-local" className="adm-input" style={{ maxWidth: 260 }} value={scheduleAt} min={nowLocalInput()} onChange={(e) => setScheduleAt(e.target.value)} disabled={scheduling} />
                        </label>
                      )}
                      <span className="adm-field-hint" style={{ marginTop: 6 }}>
                        Times are {TZ_LABEL}. Scheduled posts fire automatically on the server — you don’t need to keep this open. Requires a connected long-lived token (reconnect in “Facebook Pages” if one expires).
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
                    {scheduledOk ? (
                      <>
                        <button type="button" className="adm-btn-primary" onClick={() => { setArticle(null); setScheduledOk(null); }}>
                          Schedule another
                        </button>
                        <button type="button" className="adm-btn-ghost" onClick={() => setStep("pages")}>
                          Back to pages
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="adm-btn-primary" onClick={schedule} disabled={scheduling || !caption.trim()}>
                          {scheduling ? <span className="adm-spinner" aria-hidden /> : <CalendarIcon className="h-4 w-4" />}
                          {scheduling ? "Scheduling…" : `Schedule ${selectedPages.length} post${selectedPages.length === 1 ? "" : "s"}`}
                        </button>
                        <button type="button" className="adm-btn-ghost" onClick={() => setArticle(null)} disabled={scheduling}>
                          Choose a different article
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
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
