"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useToast } from "@/components/admin/Toast";
import { toLocalInput, nowLocalInput, formatSchedule } from "@/lib/fbSchedule";
import { rescheduleArticle, publishScheduledNow, cancelScheduledArticle } from "@/app/admin/schedule-actions";

type Item = { id: string; title: string; category: string | null; scheduledAt: string | null; shareCount: number; source: string | null };

/** The "Scheduled" queue: upcoming articles with their Phnom-Penh times — each can
 *  have its time changed, be published now, or be cancelled back to a draft. */
export function ScheduledManager({ items }: { items: Item[] }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [editing, setEditing] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    start(async () => {
      const res = await fn();
      if (res.ok) {
        success(okMsg);
        setEditing({});
        router.refresh();
      } else {
        error(res.error ?? "Something went wrong.");
      }
    });
  }

  return (
    <div>
      <div className="adm-page-h">
        <h1>Scheduled</h1>
        <p>
          Articles set to publish automatically. All times are Asia/Phnom_Penh. The Facebook auto-share
          fires when each story goes live (not now).
        </p>
      </div>

      {items.length === 0 ? (
        <div className="adm-card adm-card-pad">
          <p className="adm-card-sub">
            No scheduled articles. Schedule one from the article editor, or by approving an AI Assistant
            publish with a time.
          </p>
        </div>
      ) : (
        <div className="adm-sched-list">
          {items.map((it) => {
            const isEditing = editing[it.id] !== undefined;
            return (
              <div key={it.id} className="adm-card adm-card-pad adm-sched-row">
                <div className="adm-sched-main">
                  <div className="adm-sched-title">{it.title}</div>
                  <div className="adm-sched-meta">
                    {it.category && <span className="adm-pill">{it.category}</span>}
                    <span className="adm-pill" style={{ background: it.source ? "rgba(147,51,234,.14)" : "rgba(120,130,150,.14)", color: it.source ? "#7c3aed" : "var(--adm-muted)" }}>
                      {it.source ?? "Manual"}
                    </span>
                    <span>🕒 {it.scheduledAt ? formatSchedule(it.scheduledAt) : "—"}</span>
                    {it.shareCount > 0 && <span>· shares to {it.shareCount} page{it.shareCount === 1 ? "" : "s"}</span>}
                  </div>
                  {isEditing && (
                    <div className="adm-sched-edit">
                      <input
                        type="datetime-local"
                        className="adm-input"
                        min={nowLocalInput()}
                        value={editing[it.id]}
                        onChange={(e) => setEditing((p) => ({ ...p, [it.id]: e.target.value }))}
                      />
                      <button type="button" className="adm-btn-primary" disabled={pending} onClick={() => run(() => rescheduleArticle(it.id, editing[it.id]), "Time updated.")}>
                        Save time
                      </button>
                      <button type="button" className="adm-btn-ghost" disabled={pending} onClick={() => setEditing((p) => { const n = { ...p }; delete n[it.id]; return n; })}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
                {!isEditing && (
                  <div className="adm-sched-acts">
                    <Link className="adm-btn-ghost" href={`/admin/articles/${it.id}/edit`}>Edit</Link>
                    <button type="button" className="adm-btn-ghost" disabled={pending} onClick={() => setEditing((p) => ({ ...p, [it.id]: it.scheduledAt ? toLocalInput(new Date(it.scheduledAt)) : nowLocalInput() }))}>
                      Change time
                    </button>
                    <button type="button" className="adm-btn-ghost" disabled={pending} onClick={() => run(() => publishScheduledNow(it.id), "Published.")}>
                      Publish now
                    </button>
                    <button type="button" className="adm-btn-ghost adm-sched-cancel" disabled={pending} onClick={() => run(() => cancelScheduledArticle(it.id), "Moved back to draft.")}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
