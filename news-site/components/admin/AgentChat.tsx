"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { AiModelPicker } from "@/components/admin/AiModelPicker";
import { useAiModel } from "@/lib/useAiModel";
import { timeAgo } from "@/lib/site";
import { SparklesIcon, RefreshIcon, CheckIcon, CloseIcon, SettingsIcon } from "@/components/admin/icons";
import { toLocalInput, nowLocalInput, localInputToUtcISO, formatSchedule } from "@/lib/fbSchedule";

type ToolLogEntry = { tool: string; summary: string; isError?: boolean };
type AgentAction = { id: string; type: string; status: string; summary: string; detail?: string; createdAt: string; result?: string; error?: string; params?: { scheduledAt?: string } };
type ChatMsg = { id: string; role: "user" | "assistant"; content: string; toolLog?: ToolLogEntry[]; actions?: AgentAction[]; error?: boolean };
type DecideState = { status: string; busy?: boolean; result?: string; error?: string };

const SUGGESTIONS = [
  "What drafts do I have right now?",
  "Find trending technology news and draft an original article from the top story.",
  "Search world news and suggest 3 story ideas.",
];

const TYPE_LABEL: Record<string, string> = {
  publish_article: "Publish",
  update_published_article: "Edit live article",
  share_to_facebook: "Share to Facebook",
};

let idSeq = 0;
const nextId = () => `m${Date.now()}-${idSeq++}`;

export function AgentChat({ aiConfigured }: { aiConfigured: boolean }) {
  const [model, setModel] = useAiModel();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [decide, setDecide] = useState<Record<string, DecideState>>({});
  const [showActivity, setShowActivity] = useState(false);
  const [activity, setActivity] = useState<AgentAction[]>([]);
  // Scheduling for publish approval cards: next free preferred slots + per-card
  // mode ("now" | "at") and the chosen Phnom-Penh datetime-local value.
  const [slots, setSlots] = useState<string[]>([]);
  const [schedMode, setSchedMode] = useState<Record<string, "now" | "at">>({});
  const [schedTime, setSchedTime] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const fetchSlots = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agent/scheduled-slots?count=5");
      const data = (await res.json().catch(() => ({}))) as { slots?: string[] };
      setSlots(data.slots ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  // When publish cards appear, fetch slots + seed each card's mode/time from any
  // time the agent proposed (else default to "Publish now").
  useEffect(() => {
    const pub = messages.flatMap((m) => m.actions ?? []).filter((a) => a.type === "publish_article");
    if (pub.length === 0) return;
    fetchSlots();
    setSchedMode((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of pub) if (next[a.id] === undefined) { next[a.id] = a.params?.scheduledAt ? "at" : "now"; changed = true; }
      return changed ? next : prev;
    });
    setSchedTime((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const a of pub) if (next[a.id] === undefined && a.params?.scheduledAt) { next[a.id] = toLocalInput(new Date(a.params.scheduledAt)); changed = true; }
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  const fetchActivity = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/agent/activity");
      const data = (await res.json().catch(() => ({}))) as { actions?: AgentAction[] };
      setActivity(data.actions ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (showActivity) fetchActivity();
  }, [showActivity, fetchActivity]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: ChatMsg = { id: nextId(), role: "user", content };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/admin/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, messages: history.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean; reply?: string; toolLog?: ToolLogEntry[]; proposedActions?: AgentAction[]; error?: string;
      };
      if (!res.ok || !data.ok) {
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.error ?? "Something went wrong. Please try again.", error: true }]);
      } else {
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.reply ?? "(no reply)", toolLog: data.toolLog ?? [], actions: data.proposedActions ?? [] }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: "Couldn’t reach the assistant. Check your connection and try again.", error: true }]);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  async function decideAction(id: string, decision: "approve" | "reject", scheduledAt?: string | null) {
    setDecide((p) => ({ ...p, [id]: { ...(p[id] ?? { status: "pending" }), busy: true } }));
    try {
      const res = await fetch("/api/admin/agent/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, decision, scheduledAt: scheduledAt ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; action?: AgentAction; result?: string; error?: string };
      const status = data.action?.status ?? (decision === "reject" ? "rejected" : data.ok ? "done" : "failed");
      setDecide((p) => ({ ...p, [id]: { busy: false, status, result: data.result ?? data.action?.result, error: data.error ?? data.action?.error } }));
    } catch {
      setDecide((p) => ({ ...p, [id]: { busy: false, status: "failed", error: "Network error." } }));
    } finally {
      if (showActivity) fetchActivity();
      fetchSlots(); // a just-scheduled slot is now taken → next card staggers
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  return (
    <div className="adm-agent">
      <div className="adm-agent-head">
        <div className="adm-agent-titles">
          <h1 className="adm-serif" style={{ margin: 0, display: "flex", alignItems: "center", gap: 9 }}>
            <span className="adm-ai-spark"><SparklesIcon className="h-[18px] w-[18px]" /></span>
            AI Assistant
          </h1>
          <p className="adm-agent-sub">Reads articles &amp; trending news and writes drafts. Publishing &amp; Facebook sharing need your approval.</p>
        </div>
        <div className="adm-agent-headtools">
          <AiModelPicker value={model} onChange={setModel} disabled={busy} />
          <button type="button" className={`adm-btn-ghost ${showActivity ? "on" : ""}`} onClick={() => setShowActivity((v) => !v)}>
            <RefreshIcon className="h-4 w-4" /> Activity
          </button>
          <Link href="/admin/ai-assistant/settings" className="adm-btn-ghost"><SettingsIcon className="h-4 w-4" /> Settings</Link>
          {messages.length > 0 && (
            <button type="button" className="adm-btn-ghost" onClick={() => setMessages([])} disabled={busy} title="Clear this conversation">New chat</button>
          )}
        </div>
      </div>

      {showActivity && (
        <div className="adm-agent-activity">
          <div className="adm-agent-activity-head">
            <span>Activity log</span>
            <button type="button" className="adm-iconbtn" aria-label="Close" onClick={() => setShowActivity(false)}><CloseIcon className="h-4 w-4" /></button>
          </div>
          {activity.length === 0 ? (
            <p className="adm-card-sub">No actions yet. Approved publishes/shares and auto-run actions appear here.</p>
          ) : (
            <div className="adm-agent-actlist">
              {activity.map((a) => (
                <div key={a.id} className="adm-agent-actrow">
                  <span className={`adm-pill adm-agent-stat ${a.status}`}>{a.status}</span>
                  <span className="adm-agent-actsum">{a.summary}</span>
                  <time className="adm-agent-acttime">{timeAgo(a.createdAt)}</time>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!aiConfigured ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill"><SparklesIcon className="h-[34px] w-[34px]" /></div>
            <h2 className="adm-serif">Set up AI first</h2>
            <p>Add <code>ANTHROPIC_API_KEY</code> in your environment, then redeploy. The assistant reuses the same key as the AI draft tools.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="adm-agent-scroll" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="adm-agent-empty">
                <p>Ask me to find news, review your drafts, or write an original draft. I’ll propose an approval card before anything goes public.</p>
                <div className="adm-agent-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="adm-srcchip on" onClick={() => send(s)} disabled={busy}>{s}</button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="adm-agent-row user">
                    <div className="adm-agent-bubble user">{m.content}</div>
                  </div>
                ) : (
                  <div key={m.id} className="adm-agent-row assistant">
                    <div className="adm-agent-aside">
                      {m.toolLog && m.toolLog.length > 0 && (
                        <div className="adm-agent-tools">
                          {m.toolLog.map((t, i) => (
                            <div key={i} className={`adm-agent-toolline ${t.isError ? "err" : ""}`} title={t.tool}><span aria-hidden>🔧</span> {t.summary}</div>
                          ))}
                        </div>
                      )}
                      <div className={`adm-agent-bubble assistant ${m.error ? "err" : ""}`}>
                        {m.error ? <p style={{ margin: 0 }}>{m.content}</p> : (
                          <div className="adm-agent-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.content}</ReactMarkdown></div>
                        )}
                      </div>
                      {m.actions?.map((a) => {
                        const st = decide[a.id] ?? { status: a.status };
                        return (
                          <div key={a.id} className="adm-agent-card">
                            <div className="adm-agent-card-head">
                              <span className="adm-agent-card-type">{TYPE_LABEL[a.type] ?? a.type}</span>
                              <span>approval needed</span>
                            </div>
                            <div className="adm-agent-card-summary">{a.summary}</div>
                            {a.detail && <div className="adm-agent-card-detail">{a.detail}</div>}
                            {st.status === "pending" ? (
                              <>
                                {a.type === "publish_article" && (() => {
                                  const mode = schedMode[a.id] ?? "now";
                                  return (
                                    <div className="adm-agent-when">
                                      <div className="adm-agent-when-modes">
                                        <label className="adm-agent-when-opt">
                                          <input type="radio" name={`when-${a.id}`} checked={mode === "now"} disabled={st.busy} onChange={() => setSchedMode((p) => ({ ...p, [a.id]: "now" }))} /> Publish now
                                        </label>
                                        <label className="adm-agent-when-opt">
                                          <input type="radio" name={`when-${a.id}`} checked={mode === "at"} disabled={st.busy} onChange={() => setSchedMode((p) => ({ ...p, [a.id]: "at" }))} /> Schedule
                                        </label>
                                      </div>
                                      {mode === "at" && (
                                        <div className="adm-agent-when-at">
                                          <input
                                            type="datetime-local"
                                            className="adm-input"
                                            min={nowLocalInput()}
                                            value={schedTime[a.id] ?? ""}
                                            disabled={st.busy}
                                            onChange={(e) => setSchedTime((p) => ({ ...p, [a.id]: e.target.value }))}
                                          />
                                          {slots.length > 0 && (
                                            <div className="adm-agent-presets">
                                              {slots.slice(0, 4).map((s) => (
                                                <button key={s} type="button" className="adm-chip" disabled={st.busy} onClick={() => setSchedTime((p) => ({ ...p, [a.id]: toLocalInput(new Date(s)) }))}>
                                                  {formatSchedule(s)}
                                                </button>
                                              ))}
                                            </div>
                                          )}
                                          <p className="adm-agent-when-tz">All times Asia/Phnom_Penh.</p>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                <div className="adm-agent-card-acts">
                                  <button
                                    type="button"
                                    className="adm-btn-primary adm-agent-approve"
                                    disabled={st.busy}
                                    onClick={() => {
                                      const mode = schedMode[a.id] ?? "now";
                                      const tv = schedTime[a.id] ?? "";
                                      const sa = a.type === "publish_article" && mode === "at" && tv ? localInputToUtcISO(tv) : null;
                                      decideAction(a.id, "approve", sa);
                                    }}
                                  >
                                    {st.busy ? <span className="adm-spinner" aria-hidden /> : <CheckIcon className="h-4 w-4" />}{" "}
                                    {a.type === "publish_article" && (schedMode[a.id] ?? "now") === "at" ? "Approve & schedule" : "Approve"}
                                  </button>
                                  <button type="button" className="adm-btn-ghost adm-agent-reject" disabled={st.busy} onClick={() => decideAction(a.id, "reject")}>
                                    <CloseIcon className="h-4 w-4" /> Reject
                                  </button>
                                </div>
                              </>
                            ) : (
                              <div className={`adm-agent-card-result ${st.status === "done" ? "ok" : st.status === "rejected" ? "muted" : "err"}`}>
                                {st.status === "done" ? `✓ ${st.result ?? "Done."}` : st.status === "rejected" ? "Rejected." : `✗ ${st.error ?? "Failed."}`}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ),
              )
            )}

            {busy && (
              <div className="adm-agent-row assistant">
                <div className="adm-agent-bubble assistant working"><span className="adm-spinner" aria-hidden /> Working…</div>
              </div>
            )}
          </div>

          <form className="adm-agent-inputbar" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <textarea
              ref={taRef}
              className="adm-input adm-agent-input"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Message the assistant…  (Enter to send, Shift+Enter for a new line)"
              aria-label="Message the assistant"
              disabled={busy}
            />
            <button type="submit" className="adm-btn-primary adm-agent-send" disabled={busy || !input.trim()} aria-label="Send">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
