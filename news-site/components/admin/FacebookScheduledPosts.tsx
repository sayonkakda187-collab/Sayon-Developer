"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { updateScheduledShare, cancelScheduledShare, deleteScheduledShare } from "@/app/admin/facebook-actions";
import { CalendarIcon, PencilIcon, TrashIcon, CloseIcon, CheckIcon } from "@/components/admin/icons";
import { permalinkForPost } from "@/lib/facebook";
import { usePaged, AdminPager } from "@/components/admin/Pager";
import { formatSchedule, toLocalInput, localInputToUtcISO, nowLocalInput, SCHEDULE_TZ } from "@/lib/fbSchedule";

export type ScheduledPostView = {
  id: string;
  articleTitle: string;
  pageName: string;
  scheduledFor: string; // ISO UTC
  status: string; // pending | posting | posted | failed | canceled
  caption: string | null;
  graphPostId: string | null;
  error: string | null;
  postedAt: string | null;
};

const FILTERS = ["all", "pending", "posted", "failed", "canceled"] as const;
type Filter = (typeof FILTERS)[number];
const TZ_LABEL = SCHEDULE_TZ.replace("_", " ");

function StatusPill({ status }: { status: string }) {
  if (status === "posted") return <span className="adm-pill">Posted ✓</span>;
  if (status === "failed") return <span className="adm-pill" style={{ color: "#b91c1c", background: "#fee2e2" }}>Failed ✗</span>;
  if (status === "canceled") return <span className="adm-pill" style={{ color: "var(--adm-muted)", background: "rgba(120,130,150,.14)" }}>Canceled</span>;
  if (status === "posting") return <span className="adm-pill amber">Sending…</span>;
  return <span className="adm-pill amber">Pending</span>;
}

/**
 * "Scheduled posts" manager on the Facebook tab. Lists upcoming + past scheduled
 * shares (upcoming first), filter by status, and edit/cancel/delete pending ones.
 * Actual posting happens server-side via the Vercel Cron runner — this is just
 * the source-of-truth list + controls.
 */
export function FacebookScheduledPosts({ posts }: { posts: ScheduledPostView[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editAt, setEditAt] = useState("");
  const [editCaption, setEditCaption] = useState("");

  // Upcoming (pending/posting, soonest first) then the rest (most recent first).
  const sorted = useMemo(() => {
    const upcoming = posts.filter((p) => p.status === "pending" || p.status === "posting").sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
    const rest = posts.filter((p) => p.status !== "pending" && p.status !== "posting").sort((a, b) => b.scheduledFor.localeCompare(a.scheduledFor));
    return [...upcoming, ...rest];
  }, [posts]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of posts) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [posts]);

  const shown = filter === "all"
    ? sorted
    : sorted.filter((p) => p.status === filter || (filter === "pending" && p.status === "posting"));

  const { page, setPage, pageCount, pageItems } = usePaged(shown, 15);

  function startEdit(p: ScheduledPostView) {
    setEditId(p.id);
    setEditAt(toLocalInput(new Date(p.scheduledFor)));
    setEditCaption(p.caption ?? "");
  }

  async function saveEdit(id: string) {
    const iso = localInputToUtcISO(editAt);
    if (!iso) return error("Pick a valid date & time.");
    setBusyId(id);
    const res = await updateScheduledShare({ id, scheduledAt: iso, caption: editCaption });
    setBusyId(null);
    if (res.ok) { success("Scheduled post updated."); setEditId(null); router.refresh(); }
    else error(res.error);
  }

  async function cancel(id: string) {
    setBusyId(id);
    const res = await cancelScheduledShare(id);
    setBusyId(null);
    if (res.ok) { success("Scheduled post canceled."); router.refresh(); }
    else error(res.error);
  }

  async function del(id: string) {
    if (!confirm("Delete this scheduled post from the list?")) return;
    setBusyId(id);
    const res = await deleteScheduledShare(id);
    setBusyId(null);
    if (res.ok) { success("Deleted."); router.refresh(); }
    else error(res.error);
  }

  return (
    <div className="adm-card adm-card-pad" style={{ marginTop: 22 }}>
      <div className="adm-list-head" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <span className="adm-qa-ic" style={{ background: "rgba(37,99,235,.12)", color: "#2563eb" }}>
            <CalendarIcon className="h-[18px] w-[18px]" />
          </span>
          <div>
            <div className="adm-card-title">Scheduled posts</div>
            <div className="adm-card-sub">Auto-posted via the Graph API at the chosen time · {TZ_LABEL}</div>
          </div>
        </div>
        {posts.length > 0 && (
          <div className="adm-seg" role="tablist" aria-label="Filter scheduled posts">
            {FILTERS.map((f) => (
              <button key={f} type="button" role="tab" aria-selected={filter === f} className={`adm-seg-btn ${filter === f ? "on" : ""}`} onClick={() => { setFilter(f); setPage(1); }}>
                {f[0].toUpperCase() + f.slice(1)}{f !== "all" && counts[f] ? ` (${counts[f]})` : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 14 }}>
          No scheduled posts yet. Use <strong>Schedule</strong> in the Share flow above to queue one.
        </p>
      ) : shown.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 14 }}>No {filter} posts.</p>
      ) : (
        <>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
          {pageItems.map((p) => (
            <div key={p.id} style={{ border: "1px solid var(--adm-bd)", borderRadius: 12, padding: 12, background: "var(--adm-card)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 700, color: "var(--adm-ink)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.articleTitle}</div>
                  <div className="adm-fb-sub">→ {p.pageName} · {formatSchedule(p.scheduledFor)}</div>
                  {p.status === "failed" && p.error && <div className="adm-fb-sub" style={{ color: "#b91c1c" }} title={p.error}>{p.error}</div>}
                  {p.status === "posted" && p.graphPostId && (
                    <a href={permalinkForPost(p.graphPostId)} target="_blank" rel="noreferrer" className="adm-link" style={{ fontSize: 12.5 }}>View post →</a>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <StatusPill status={p.status} />
                  {p.status === "pending" && (
                    <>
                      <button type="button" className="adm-btn-ghost adm-fb-act" disabled={busyId === p.id} onClick={() => (editId === p.id ? setEditId(null) : startEdit(p))} title="Edit time / caption">
                        <PencilIcon className="h-4 w-4" /><span className="adm-fb-actlabel">Edit</span>
                      </button>
                      <button type="button" className="adm-btn-ghost adm-fb-act" disabled={busyId === p.id} onClick={() => cancel(p.id)} title="Cancel (keeps it in the list)">
                        <CloseIcon className="h-4 w-4" /><span className="adm-fb-actlabel">Cancel</span>
                      </button>
                    </>
                  )}
                  {p.status !== "posting" && (
                    <button type="button" className="adm-btn-ghost adm-fb-act adm-fb-danger" disabled={busyId === p.id} onClick={() => del(p.id)} title="Delete from list">
                      <TrashIcon className="h-4 w-4" /><span className="adm-fb-actlabel">Delete</span>
                    </button>
                  )}
                </div>
              </div>

              {editId === p.id && (
                <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--adm-bd)" }}>
                  <label className="adm-field">
                    <span>Date &amp; time ({TZ_LABEL})</span>
                    <input type="datetime-local" className="adm-input" value={editAt} min={nowLocalInput()} onChange={(e) => setEditAt(e.target.value)} />
                  </label>
                  <label className="adm-field" style={{ marginTop: 8 }}>
                    <span>Caption</span>
                    <textarea className="adm-input" rows={4} value={editCaption} onChange={(e) => setEditCaption(e.target.value)} placeholder="Leave blank for the default message" />
                  </label>
                  <div className="adm-settings-actions">
                    <button type="button" className="adm-btn-primary" disabled={busyId === p.id} onClick={() => saveEdit(p.id)}>
                      {busyId === p.id ? <span className="adm-spinner" aria-hidden /> : <CheckIcon className="h-4 w-4" />} Save
                    </button>
                    <button type="button" className="adm-btn-ghost" disabled={busyId === p.id} onClick={() => setEditId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
        <AdminPager page={page} pageCount={pageCount} onPage={setPage} />
        </>
      )}
    </div>
  );
}
