"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  publishArticleNow,
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
}: {
  articleId: string;
  articleStatus: string;
  pages: PageOption[];
  history: HistoryItem[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [scheduledFor, setScheduledFor] = useState("");
  const [busy, setBusy] = useState<null | "now" | "schedule">(null);
  const [results, setResults] = useState<PublishResult[] | null>(null);

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

      {pages.length === 0 ? (
        <p className="adm-field-hint" style={{ marginTop: 6 }}>
          No Facebook Pages connected yet.{" "}
          <Link href="/admin/facebook" className="adm-link">Connect a Page →</Link>
        </p>
      ) : (
        <>
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
