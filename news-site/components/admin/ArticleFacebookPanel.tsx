"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  publishArticleNow,
  publishArticleToPageUrl,
  discoverRunnerPages,
  scheduleArticlePosts,
} from "@/app/admin/facebook-actions";
import type { PublishResult } from "@/lib/facebookPublish";
import { sortCategoryGroups } from "@/lib/facebookGroups";
import { useToast } from "@/components/admin/Toast";
import { FacebookIcon, CalendarIcon } from "@/components/admin/icons";
import { permalinkForPost } from "@/lib/facebook";

type PageOption = {
  id: string;
  pageName: string;
  categoryGroup: string;
  status: string;
};

type SessionOption = {
  id: string;
  label: string;
  accountName: string | null;
  status: string;
};

type HistoryItem = {
  id: string;
  pageName: string;
  status: string;
  scheduledFor: string;
  postedAt: string | null;
  error: string | null;
  graphPostId: string | null;
};

/**
 * "Publish to Facebook Pages" section for the article editor. Lets the admin
 * pick pages (grouped by niche) and either publish immediately or schedule for
 * later. All posting happens server-side via the Graph API (server actions).
 */
export function ArticleFacebookPanel({
  articleId,
  articleStatus,
  pages,
  history,
  defaultCaption = "",
  runnerConfigured = false,
  runnerSessions = [],
}: {
  articleId: string;
  articleStatus: string;
  pages: PageOption[];
  history: HistoryItem[];
  // Prefilled, editable caption for the Graph "Post to this page" action.
  defaultCaption?: string;
  // When the self-hosted browser runner is configured, offer it as a posting
  // method alongside the default Graph API.
  runnerConfigured?: boolean;
  // Saved browser sessions to choose from when posting via the runner.
  runnerSessions?: SessionOption[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState<null | "now" | "schedule" | "quick" | "url" | "discover" | "multipost">(null);
  const [results, setResults] = useState<PublishResult[] | null>(null);
  // URL-based runner posting (no connected Page / Graph token needed).
  const [pageUrlInput, setPageUrlInput] = useState("");
  const [urlSessionId, setUrlSessionId] = useState("");
  const [urlResult, setUrlResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Multi-Page runner posting: discover the account's Pages, tick several, and
  // post this article to all of them (sequentially — the runner drives one
  // browser; one request per Page keeps each call short).
  const [discovered, setDiscovered] = useState<{ id: string; name: string; url: string }[] | null>(null);
  const [discSessionId, setDiscSessionId] = useState("");
  const [pickedPages, setPickedPages] = useState<Set<string>>(new Set());
  const [postProgress, setPostProgress] = useState<
    Record<string, { status: "pending" | "posting" | "ok" | "fail"; error?: string }>
  >({});

  // Quick "post to ONE page" target (the Page Selector dropdown). Defaults to the
  // first connected page so the confirmation label always shows a real target.
  const connectablePages = useMemo(() => pages.filter((p) => p.status === "Connected"), [pages]);
  const [targetPageId, setTargetPageId] = useState<string>("");
  const targetPage =
    pages.find((p) => p.id === targetPageId) ?? connectablePages[0] ?? pages[0] ?? null;
  // Posting method for the quick "post to one page" action: official Graph API
  // (default) or the self-hosted persistent-browser runner (when configured).
  const [via, setVia] = useState<"graph" | "runner">("graph");
  // Saved browser session to post with (runner only). "" = runner's live login.
  const activeSessions = useMemo(() => runnerSessions.filter((s) => s.status === "Active"), [runnerSessions]);
  const [sessionId, setSessionId] = useState<string>("");
  // Editable caption for the Graph "Post to this page" action (prefilled).
  const [caption, setCaption] = useState(defaultCaption);

  const grouped = useMemo(() => {
    const map = new Map<string, PageOption[]>();
    for (const p of pages) {
      const arr = map.get(p.categoryGroup) ?? [];
      arr.push(p);
      map.set(p.categoryGroup, arr);
    }
    return sortCategoryGroups([...map.keys()]).map((group) => ({
      group,
      rows: map.get(group)!,
    }));
  }, [pages]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleGroup(rows: PageOption[], on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (on) next.add(r.id);
        else next.delete(r.id);
      }
      return next;
    });
  }

  // Post to exactly the selected target page. Because each page has its own
  // access token and we post directly to /{pageId}/feed, the target is always
  // exact — there's no shared "current page" to switch (unlike a browser session).
  async function onQuickPost() {
    if (!targetPage) return error("No connected page to post to.");
    if (targetPage.status !== "Connected") return error(`“${targetPage.pageName}” needs reconnecting before posting.`);
    setBusy("quick");
    setResults(null);
    const res = await publishArticleNow({
      articleId,
      pageDbIds: [targetPage.id],
      via,
      sessionId: via === "runner" && sessionId ? sessionId : undefined,
      caption: via === "graph" ? caption : undefined,
    });
    setBusy(null);
    if (!res.ok) return error(res.error);
    setResults(res.data);
    const ok = res.data[0]?.ok;
    if (ok) success(`Posted to ${targetPage.pageName}.`);
    else error(res.data[0]?.error ?? "Failed to post.");
    router.refresh();
  }

  // Post this article to any Page by URL, using the runner + a saved session.
  async function onPostToUrl() {
    if (!pageUrlInput.trim()) return error("Enter a Page URL or @username.");
    setBusy("url");
    setUrlResult(null);
    const res = await publishArticleToPageUrl({
      articleId,
      pageUrl: pageUrlInput.trim(),
      sessionId: urlSessionId || undefined,
    });
    setBusy(null);
    if (!res.ok) {
      setUrlResult({ ok: false, msg: res.error });
      return error(res.error);
    }
    setUrlResult({ ok: true, msg: `Posted to ${res.data.pageName}` });
    success("Posted via browser session.");
    router.refresh();
  }

  // Pull every Page the chosen session manages into a multi-select list.
  async function onLoadPages() {
    setBusy("discover");
    setDiscovered(null);
    const res = await discoverRunnerPages(discSessionId || undefined);
    setBusy(null);
    if (!res.ok) return error(res.error);
    setDiscovered(res.data.pages);
    setPickedPages(new Set());
    setPostProgress({});
    if (res.data.pages.length === 0) error("No Pages found for this session (Facebook’s list may have changed).");
    else success(`Loaded ${res.data.pages.length} Page${res.data.pages.length === 1 ? "" : "s"}.`);
  }

  function togglePicked(url: string) {
    setPickedPages((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  }

  function togglePickAll(on: boolean) {
    setPickedPages(on && discovered ? new Set(discovered.map((p) => p.url)) : new Set());
  }

  // Post this article to every ticked Page, one at a time (the runner drives a
  // single browser; sequential avoids racing it and keeps each request short).
  async function onPostSelected() {
    if (!discovered) return;
    const targets = discovered.filter((p) => pickedPages.has(p.url));
    if (targets.length === 0) return error("Select at least one Page.");
    setBusy("multipost");
    setPostProgress(Object.fromEntries(targets.map((p) => [p.url, { status: "pending" as const }])));
    let okCount = 0;
    for (const page of targets) {
      setPostProgress((prev) => ({ ...prev, [page.url]: { status: "posting" } }));
      const res = await publishArticleToPageUrl({
        articleId,
        pageUrl: page.url,
        sessionId: discSessionId || undefined,
      });
      if (res.ok) {
        okCount++;
        setPostProgress((prev) => ({ ...prev, [page.url]: { status: "ok" } }));
      } else {
        setPostProgress((prev) => ({ ...prev, [page.url]: { status: "fail", error: res.error } }));
      }
    }
    setBusy(null);
    const failCount = targets.length - okCount;
    if (failCount === 0) success(`Posted to ${okCount} Page${okCount === 1 ? "" : "s"}.`);
    else if (okCount === 0) error(`All ${failCount} failed. See details below.`);
    else success(`Posted to ${okCount}, ${failCount} failed. See details below.`);
    router.refresh();
  }

  async function onPublishNow() {
    if (selected.size === 0) return error("Select at least one page.");
    setBusy("now");
    setResults(null);
    const res = await publishArticleNow({ articleId, pageDbIds: [...selected] });
    setBusy(null);
    if (!res.ok) return error(res.error);
    setResults(res.data);
    const okCount = res.data.filter((r) => r.ok).length;
    const failCount = res.data.length - okCount;
    if (failCount === 0) success(`Posted to ${okCount} page${okCount === 1 ? "" : "s"}.`);
    else if (okCount === 0) error(`All ${failCount} posts failed. See details below.`);
    else success(`Posted to ${okCount}, ${failCount} failed. See details below.`);
    router.refresh();
  }

  async function onSchedule() {
    if (selected.size === 0) return error("Select at least one page.");
    if (!scheduledFor) return error("Pick a date and time.");
    setBusy("schedule");
    // datetime-local has no timezone; interpret in the browser's local zone.
    const iso = new Date(scheduledFor).toISOString();
    const res = await scheduleArticlePosts({ articleId, pageDbIds: [...selected], scheduledFor: iso });
    setBusy(null);
    if (!res.ok) return error(res.error);
    success(`Scheduled ${res.data.count} post${res.data.count === 1 ? "" : "s"}.`);
    setSelected(new Set());
    setScheduledFor("");
    router.refresh();
  }

  return (
    <div className="adm-card adm-card-pad adm-fbpanel">
      <div className="adm-fbpanel-hd">
        <FacebookIcon className="h-[18px] w-[18px]" />
        <span>Publish to Facebook Pages</span>
      </div>

      {articleStatus !== "published" && (
        <p className="adm-fbpanel-note">
          Tip: Facebook pulls the title and cover image from the article’s public page, so publish
          the article first for the best link preview.
        </p>
      )}

      {/* ── Post to any Page by URL via the browser runner — needs no connected
          Page or Graph token, just a saved session. Always available when the
          runner is configured. ── */}
      {runnerConfigured && (
        <div className="adm-fb-quick" style={{ marginBottom: 14 }}>
          <span className="adm-fb-quick-lbl" style={{ display: "block", marginBottom: 6 }}>
            Post to a Page by URL — browser session (no Page token)
          </span>
          <label className="adm-fb-quick-field">
            <span className="adm-fb-quick-lbl">Page URL or @username</span>
            <input
              className="adm-input"
              placeholder="facebook.com/YourPage   or   @YourPage"
              value={pageUrlInput}
              onChange={(e) => setPageUrlInput(e.target.value)}
              aria-label="Facebook Page URL or username"
            />
          </label>
          <label className="adm-fb-quick-field">
            <span className="adm-fb-quick-lbl">Browser session</span>
            <select
              className="adm-input"
              value={urlSessionId}
              onChange={(e) => setUrlSessionId(e.target.value)}
              aria-label="Saved browser session to post with"
            >
              <option value="">Runner’s live login</option>
              {activeSessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.accountName ? ` · ${s.accountName}` : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="adm-btn-primary adm-fb-quick-btn"
            onClick={onPostToUrl}
            disabled={busy !== null || !pageUrlInput.trim()}
          >
            {busy === "url" && <span className="adm-spinner" aria-hidden />}
            <FacebookIcon className="h-4 w-4" />
            {busy === "url" ? "Posting…" : "Post with session"}
          </button>
          {urlResult && (
            <p className="adm-fb-target" aria-live="polite" style={urlResult.ok ? undefined : { color: "#b91c1c" }}>
              {urlResult.msg}
            </p>
          )}
          <p className="adm-field-hint">
            Posts this article to any Page you manage using your saved login — no Graph token or
            connected Page required. Publish the article first for the best link preview.
          </p>
        </div>
      )}

      {/* ── Load every Page the logged-in session manages, then post this article
          to MANY at once (browser runner; no Graph token / connected Page). ── */}
      {runnerConfigured && (
        <div className="adm-fb-quick" style={{ marginBottom: 14 }}>
          <span className="adm-fb-quick-lbl" style={{ display: "block", marginBottom: 6 }}>
            Post to multiple Pages — load your Pages, tick several, publish to all
          </span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label className="adm-fb-quick-field" style={{ flex: "1 1 200px" }}>
              <span className="adm-fb-quick-lbl">Browser session</span>
              <select
                className="adm-input"
                value={discSessionId}
                onChange={(e) => setDiscSessionId(e.target.value)}
                aria-label="Session to load Pages from"
              >
                <option value="">Runner’s live login</option>
                {activeSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                    {s.accountName ? ` · ${s.accountName}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="adm-btn-ghost adm-fb-quick-btn"
              onClick={onLoadPages}
              disabled={busy !== null}
            >
              {busy === "discover" && <span className="adm-spinner" aria-hidden />}
              {busy === "discover" ? "Loading…" : "Load my Pages"}
            </button>
          </div>

          {discovered && discovered.length > 0 && (
            <>
              <div style={{ display: "flex", gap: 12, alignItems: "center", margin: "10px 0 6px" }}>
                <button
                  type="button"
                  className="adm-fb-grouptoggle"
                  onClick={() => togglePickAll(pickedPages.size !== discovered.length)}
                >
                  {pickedPages.size === discovered.length ? "Clear all" : "Select all"}
                </button>
                <span className="adm-field-hint" style={{ margin: 0 }}>
                  {pickedPages.size} of {discovered.length} selected
                </span>
              </div>
              <div className="adm-fb-checkgroups">
                <fieldset className="adm-fb-checkgroup">
                  {discovered.map((p) => {
                    const prog = postProgress[p.url];
                    return (
                      <label key={p.url} className="adm-check">
                        <input
                          type="checkbox"
                          checked={pickedPages.has(p.url)}
                          onChange={() => togglePicked(p.url)}
                          disabled={busy === "multipost"}
                        />
                        <span>
                          {p.name}
                          {prog && (
                            <span
                              className={`adm-pill ${prog.status === "ok" ? "" : "amber"}`}
                              style={{ marginLeft: 6, ...(prog.status === "fail" ? { color: "#b91c1c", background: "#fee2e2" } : {}) }}
                              title={prog.error ?? ""}
                            >
                              {prog.status === "posting"
                                ? "posting…"
                                : prog.status === "ok"
                                  ? "posted"
                                  : prog.status === "fail"
                                    ? "failed"
                                    : "pending"}
                            </span>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </fieldset>
              </div>
              <button
                type="button"
                className="adm-btn-primary adm-fb-quick-btn"
                style={{ marginTop: 10 }}
                onClick={onPostSelected}
                disabled={busy !== null || pickedPages.size === 0}
              >
                {busy === "multipost" && <span className="adm-spinner" aria-hidden />}
                <FacebookIcon className="h-4 w-4" />
                {busy === "multipost"
                  ? "Posting…"
                  : `Post to ${pickedPages.size} selected Page${pickedPages.size === 1 ? "" : "s"}`}
              </button>
            </>
          )}
          {discovered && discovered.length === 0 && (
            <p className="adm-field-hint">
              No Pages found. Make sure this session is logged into an account that manages Pages.
            </p>
          )}
          <p className="adm-field-hint">
            Loads every Page your logged-in account manages, then posts this article to each one you
            tick — using your browser session (no Graph token). Posts run one Page at a time.
          </p>
        </div>
      )}

      {pages.length === 0 ? (
        <p className="adm-field-hint" style={{ marginTop: 6 }}>
          No Facebook Pages connected yet (for the Graph API path).{" "}
          <Link href="/admin/facebook" className="adm-link">Connect a Page →</Link>
        </p>
      ) : (
        <>
          {/* ── Page Selector: post to ONE chosen page, with a clear target
              confirmation before the action runs. ── */}
          <div className="adm-fb-quick">
            <label className="adm-fb-quick-field">
              <span className="adm-fb-quick-lbl">Page Selector</span>
              <select
                className="adm-input"
                value={targetPage?.id ?? ""}
                onChange={(e) => setTargetPageId(e.target.value)}
                aria-label="Choose the Facebook page to post to"
              >
                {pages.map((p) => (
                  <option key={p.id} value={p.id} disabled={p.status !== "Connected"}>
                    {p.pageName} · {p.categoryGroup}
                    {p.status !== "Connected" ? " (reconnect)" : ""}
                  </option>
                ))}
              </select>
            </label>

            {targetPage && (
              <p className="adm-fb-target" aria-live="polite">
                <span className="adm-fb-target-dot" aria-hidden />
                Currently posting to: <strong>{targetPage.pageName}</strong>
                <span className="adm-fb-target-via"> · via {via === "runner" ? "Browser runner" : "Graph API"}</span>
              </p>
            )}

            {runnerConfigured && (
              <label className="adm-fb-quick-field">
                <span className="adm-fb-quick-lbl">Posting method</span>
                <select className="adm-input" value={via} onChange={(e) => setVia(e.target.value as "graph" | "runner")} aria-label="Posting method">
                  <option value="graph">Graph API (official, recommended)</option>
                  <option value="runner">Browser runner (self-hosted)</option>
                </select>
              </label>
            )}

            {runnerConfigured && via === "runner" && (
              <label className="adm-fb-quick-field">
                <span className="adm-fb-quick-lbl">Browser session</span>
                <select
                  className="adm-input"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  aria-label="Saved browser session to post with"
                >
                  <option value="">Runner’s live login</option>
                  {activeSessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                      {s.accountName ? ` · ${s.accountName}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {via === "graph" && (
              <label className="adm-fb-quick-field">
                <span className="adm-fb-quick-lbl">Caption (editable)</span>
                <textarea
                  className="adm-input"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={4}
                  aria-label="Post caption"
                  placeholder="Caption for the Facebook post"
                />
                <span className="adm-field-hint">
                  The article link + preview are attached automatically. Edit the text, or leave the default.
                </span>
              </label>
            )}

            <button
              type="button"
              className="adm-btn-primary adm-fb-quick-btn"
              onClick={onQuickPost}
              disabled={busy !== null || !targetPage || targetPage.status !== "Connected"}
            >
              {busy === "quick" && <span className="adm-spinner" aria-hidden />}
              <FacebookIcon className="h-4 w-4" />
              {busy === "quick" ? "Posting…" : "Post to this page"}
            </button>
          </div>

          <div className="adm-fb-or"><span>or pick multiple pages</span></div>

          <div className="adm-fb-checkgroups">
            {grouped.map(({ group, rows }) => {
              const allOn = rows.every((r) => selected.has(r.id));
              return (
                <fieldset key={group} className="adm-fb-checkgroup">
                  <legend>
                    <button
                      type="button"
                      className="adm-fb-grouptoggle"
                      onClick={() => toggleGroup(rows, !allOn)}
                    >
                      {group}
                    </button>
                  </legend>
                  {rows.map((p) => (
                    <label key={p.id} className="adm-check">
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggle(p.id)}
                      />
                      <span>
                        {p.pageName}
                        {p.status !== "Connected" && (
                          <span className="adm-pill amber" style={{ marginLeft: 6 }}>Expired</span>
                        )}
                      </span>
                    </label>
                  ))}
                </fieldset>
              );
            })}
          </div>

          <div className="adm-fb-publishrow">
            <button
              type="button"
              className="adm-btn-primary"
              onClick={onPublishNow}
              disabled={busy !== null}
            >
              {busy === "now" && <span className="adm-spinner" aria-hidden />}
              {busy === "now" ? "Posting…" : "Publish Now"}
            </button>

            <div className="adm-fb-schedule">
              <input
                type="datetime-local"
                className="adm-input"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                aria-label="Schedule date and time"
              />
              <button
                type="button"
                className="adm-btn-ghost"
                onClick={onSchedule}
                disabled={busy !== null}
              >
                {busy === "schedule" && <span className="adm-spinner" aria-hidden />}
                <CalendarIcon className="h-4 w-4" />
                Schedule
              </button>
            </div>
          </div>
          <p className="adm-field-hint">Selected: {selected.size} page{selected.size === 1 ? "" : "s"}. Times use your local timezone.</p>

          {results && (
            <div className="adm-fb-results">
              {results.map((r) => (
                <div key={r.pageDbId} className={`adm-fb-result ${r.ok ? "ok" : "bad"}`}>
                  <span className="adm-fb-result-dot" aria-hidden />
                  <span style={{ fontWeight: 600 }}>{r.pageName}</span>
                  <span className="adm-fb-result-msg">
                    {r.ok ? (
                      r.graphPostId ? (
                        <a href={permalinkForPost(r.graphPostId)} target="_blank" rel="noreferrer" className="adm-link">
                          View post →
                        </a>
                      ) : (
                        "Posted"
                      )
                    ) : (
                      r.error ?? "Failed to post."
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <div className="adm-fb-history">
          <div className="adm-fb-history-hd">Post history</div>
          <table className="adm-table">
            <thead>
              <tr>
                <th>Page</th>
                <th>Status</th>
                <th>When</th>
                <th>Link</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.pageName}</td>
                  <td>
                    <span className={`adm-pill ${h.status === "posted" ? "" : h.status === "failed" ? "" : "amber"}`}
                      style={h.status === "failed" ? { color: "#b91c1c", background: "#fee2e2" } : undefined}
                    >
                      {h.status}
                    </span>
                    {h.error && <span className="adm-fb-sub" title={h.error}>{h.error}</span>}
                  </td>
                  <td className="adm-amt">
                    {h.postedAt
                      ? new Date(h.postedAt).toLocaleString()
                      : new Date(h.scheduledFor).toLocaleString()}
                  </td>
                  <td>
                    {h.graphPostId ? (
                      <a href={permalinkForPost(h.graphPostId)} target="_blank" rel="noreferrer" className="adm-link">
                        View →
                      </a>
                    ) : (
                      <span className="adm-amt">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
