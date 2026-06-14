"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { AiModelPicker } from "@/components/admin/AiModelPicker";
import { useAiModel } from "@/lib/useAiModel";
import { timeAgo } from "@/lib/site";
import {
  SparklesIcon,
  RefreshIcon,
  CheckIcon,
  CloseIcon,
  SettingsIcon,
  CopyIcon,
  TrendingIcon,
  ArticlesIcon,
  BookIcon,
  PlusIcon,
} from "@/components/admin/icons";
import { toLocalInput, nowLocalInput, localInputToUtcISO, formatSchedule } from "@/lib/fbSchedule";
import { formatDay } from "@/lib/fbInsightsRange";

type ToolLogEntry = { tool: string; summary: string; isError?: boolean };
type EarnRow = { pageName: string; date: string; amount: number; previousAmount?: number | null };
type EarnSkip = { inputPageName: string; inputDate?: string; inputAmount?: string; status: string; reason?: string; candidates?: { pageName: string }[] };
type AgentAction = {
  id: string;
  type: string;
  status: string;
  summary: string;
  detail?: string;
  createdAt: string;
  result?: string;
  error?: string;
  params?: { scheduledAt?: string; rows?: EarnRow[]; skipped?: EarnSkip[] };
};
type ChatMsg = { id: string; role: "user" | "assistant"; content: string; at: string; toolLog?: ToolLogEntry[]; actions?: AgentAction[]; error?: boolean };
type DecideState = { status: string; busy?: boolean; result?: string; error?: string };
type Ctx = { drafts: number; scheduledToday: number; nextRun: string | null };

// Suggestion cards (the original three prompts + "Review my drafts"), shown as a
// tidy 2×2 grid on the empty state. Behaviour is unchanged — each just sends a prompt.
const SUGGESTIONS: { Icon: typeof BookIcon; label: string; desc: string; prompt: string }[] = [
  { Icon: BookIcon, label: "My drafts", desc: "List what I’m working on", prompt: "What drafts do I have right now?" },
  { Icon: TrendingIcon, label: "Trending tech", desc: "Find news + draft the top story", prompt: "Find trending technology news and draft an original article from the top story." },
  { Icon: SparklesIcon, label: "Story ideas", desc: "3 original ideas from world news", prompt: "Search world news and suggest 3 story ideas." },
  { Icon: ArticlesIcon, label: "Review drafts", desc: "What’s ready to publish", prompt: "Review my drafts and tell me what’s ready to publish." },
];

const TYPE_LABEL: Record<string, string> = {
  publish_article: "Publish",
  update_published_article: "Edit live article",
  share_to_facebook: "Share to Facebook",
  set_page_earnings: "Set page earnings",
  cron_ping: "Auto-Pilot ping",
};

/** Approval-card preview for the set_page_earnings tool: the exact rows that will be
 *  written (Page · Date · Amount, overwrites flagged) + any rows that need clarification. */
function EarningsPreview({ rows, skipped }: { rows: EarnRow[]; skipped?: EarnSkip[] }) {
  const shown = rows.slice(0, 60);
  return (
    <div className="adm-agent-earn">
      <table className="adm-agent-earn-tbl">
        <thead>
          <tr>
            <th>Page</th>
            <th>Date</th>
            <th className="r">Amount</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={i}>
              <td className="adm-agent-earn-pg" title={r.pageName}>{r.pageName}</td>
              <td>{formatDay(r.date)}</td>
              <td className="r">
                ${r.amount.toFixed(2)}
                {r.previousAmount != null && (
                  <span className="adm-agent-earn-ovw" title={`Overwrites $${r.previousAmount.toFixed(2)}`}>was ${r.previousAmount.toFixed(2)}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <div className="adm-agent-earn-more">+{rows.length - shown.length} more row(s)…</div>}
      {skipped && skipped.length > 0 && (
        <div className="adm-agent-earn-skip">
          <div className="adm-agent-earn-skip-h">⚠ Not saved — needs your input:</div>
          <ul>
            {skipped.slice(0, 12).map((s, i) => (
              <li key={i}>
                <strong>{s.inputPageName || "(no name)"}</strong>
                {s.candidates && s.candidates.length > 0
                  ? ` — pick: ${s.candidates.map((x) => x.pageName).join(", ")}`
                  : s.reason
                    ? ` — ${s.reason}`
                    : ""}
              </li>
            ))}
            {skipped.length > 12 && <li>+{skipped.length - 12} more…</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

const SendIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4 20-7z" />
  </svg>
);

let idSeq = 0;
const nextId = () => `m${Date.now()}-${idSeq++}`;
function fmtClock(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function AgentChat({ aiConfigured, context }: { aiConfigured: boolean; context?: Ctx }) {
  const ctx: Ctx = context ?? { drafts: 0, scheduledToday: 0, nextRun: null };
  const [model, setModel] = useAiModel();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [decide, setDecide] = useState<Record<string, DecideState>>({});
  const [showActivity, setShowActivity] = useState(false);
  const [activity, setActivity] = useState<AgentAction[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [showFab, setShowFab] = useState(false);
  // Scheduling for publish approval cards: next free preferred slots + per-card
  // mode ("now" | "at") and the chosen Phnom-Penh datetime-local value.
  const [slots, setSlots] = useState<string[]>([]);
  const [schedMode, setSchedMode] = useState<Record<string, "now" | "at">>({});
  const [schedTime, setSchedTime] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const atBottomRef = useRef(true);
  const kbOpenRef = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const vvUpdateRef = useRef<() => void>(() => {});

  const autosize = useCallback(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`; // grow 1→~5 lines
  }, []);
  useEffect(() => {
    autosize();
  }, [input, autosize]);

  // iOS keyboard handling. The composer is position:fixed. The keyboard is detected
  // by INPUT FOCUS, not a visualViewport-overlap threshold — in the standalone PWA
  // the layout viewport shrinks with the keyboard, so the overlap reads ~0 and a
  // threshold would think it's closed (leaving the composer above the nav with a
  // gap). On focus we add `.ac-kb` (CSS hides the bottom nav + pins the composer via
  // --ac-kbh); on blur we restore. --ac-kbh = innerHeight − (vv.height + vv.offsetTop)
  // places the bar flush on the keyboard (≈0 in the PWA where the view already
  // shrank, = keyboard height in Safari); --ac-navh-px is the closed offset.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      const overlap = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      if (kbOpenRef.current) {
        root.style.setProperty("--ac-kbh", `${overlap}px`);
        root.style.setProperty("--ac-extra", `${overlap}px`);
        if (atBottomRef.current && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      } else {
        root.style.setProperty("--ac-kbh", "0px");
        root.style.setProperty("--ac-extra", "0px");
        const nav = document.querySelector(".adm-tabbar");
        root.style.setProperty("--ac-navh-px", nav ? `${Math.round(nav.getBoundingClientRect().height)}px` : "0px");
      }
    };
    vvUpdateRef.current = update;
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    update();
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      vvUpdateRef.current = () => {};
      if (blurTimer.current) clearTimeout(blurTimer.current);
      root.classList.remove("ac-kb");
      root.style.removeProperty("--ac-kbh");
      root.style.removeProperty("--ac-extra");
      root.style.removeProperty("--ac-navh-px");
    };
  }, []);

  // Drive the keyboard-open state off the composer's focus. A short debounce on blur
  // means tapping Send (which briefly blurs) doesn't flash the nav back in.
  function setKeyboardOpen(open: boolean) {
    kbOpenRef.current = open;
    document.documentElement.classList.toggle("ac-kb", open);
    vvUpdateRef.current();
  }
  function onComposerFocus() {
    if (blurTimer.current) { clearTimeout(blurTimer.current); blurTimer.current = undefined; }
    setKeyboardOpen(true);
    atBottomRef.current = true;
    setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, 350);
  }
  function onComposerBlur() {
    blurTimer.current = setTimeout(() => setKeyboardOpen(false), 200);
  }

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

  // Auto-scroll to the newest message, but only when the user is already at the
  // bottom (so reading older messages isn't interrupted — the FAB jumps down).
  useEffect(() => {
    if (atBottomRef.current) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = atBottom;
    setShowFab(!atBottom);
  }
  function scrollToBottom() {
    atBottomRef.current = true;
    setShowFab(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

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

  // POST the conversation to the agent + append its reply (or an error). Shared by
  // sending a new message and retrying after a failure.
  async function run(history: ChatMsg[]) {
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
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.error ?? "Something went wrong. Please try again.", at: new Date().toISOString(), error: true }]);
      } else {
        setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: data.reply ?? "(no reply)", at: new Date().toISOString(), toolLog: data.toolLog ?? [], actions: data.proposedActions ?? [] }]);
      }
    } catch {
      setMessages((prev) => [...prev, { id: nextId(), role: "assistant", content: "Couldn’t reach the assistant. Check your connection and try again.", at: new Date().toISOString(), error: true }]);
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  }

  function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    const userMsg: ChatMsg = { id: nextId(), role: "user", content, at: new Date().toISOString() };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    atBottomRef.current = true;
    requestAnimationFrame(autosize);
    void run(history);
  }

  function retryLast() {
    if (busy) return;
    let hist = messages;
    if (hist.length && hist[hist.length - 1].role === "assistant" && hist[hist.length - 1].error) hist = hist.slice(0, -1);
    if (hist.length === 0) return;
    setMessages(hist);
    atBottomRef.current = true;
    void run(hist);
  }

  function newChat() {
    if (busy) return;
    setMessages([]);
    setDecide({});
    setSchedMode({});
    setSchedTime({});
    setInput("");
    requestAnimationFrame(autosize);
  }

  async function copyMsg(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      /* clipboard blocked — no-op */
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

  const modelLabel = model; // AiModelPicker shows the human label; kept for a11y

  return (
    <div className="adm-ac">
      {/* ── Header row ── */}
      <header className="adm-ac-head">
        <div className="adm-ac-title">
          <span className="adm-ac-mark"><SparklesIcon className="h-[18px] w-[18px]" /></span>
          <span className="adm-ac-titletext">AI Assistant</span>
        </div>
        <div className="adm-ac-headtools" aria-label="Assistant controls">
          <AiModelPicker value={modelLabel} onChange={setModel} disabled={busy} />
          <button
            type="button"
            className={`adm-iconbtn adm-ac-iconbtn ${showActivity ? "on" : ""}`}
            aria-label="Activity log"
            aria-pressed={showActivity}
            title="Activity log"
            onClick={() => setShowActivity((v) => !v)}
          >
            <RefreshIcon className="h-[18px] w-[18px]" />
          </button>
          <Link href="/admin/ai-assistant/settings" className="adm-iconbtn adm-ac-iconbtn" aria-label="Agent settings" title="Agent settings">
            <SettingsIcon className="h-[18px] w-[18px]" />
          </Link>
          <button type="button" className="adm-btn-ghost adm-ac-newchat" onClick={newChat} disabled={busy || messages.length === 0} title="Start a new chat">
            <PlusIcon className="h-4 w-4" /> <span className="adm-ac-newchat-lbl">New chat</span>
          </button>
        </div>
      </header>

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
        <div className="adm-card adm-card-pad">
          <div className="adm-empty">
            <div className="adm-ill"><SparklesIcon className="h-[34px] w-[34px]" /></div>
            <h2 className="adm-serif">Set up AI first</h2>
            <p>Add <code>ANTHROPIC_API_KEY</code> in your environment, then redeploy. The assistant reuses the same key as the AI draft tools.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="adm-ac-scroll" ref={scrollRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <div className="adm-ac-hero">
                <span className="adm-ac-herochip"><SparklesIcon className="h-7 w-7" /></span>
                <h2 className="adm-ac-greet adm-serif">What should we work on?</h2>
                <p className="adm-ac-herosub">Find news, review your drafts, or write an original draft. Publishing &amp; Facebook sharing always wait for your approval.</p>

                <div className="adm-ac-ctx">
                  <button type="button" className="adm-ac-ctxchip" onClick={() => send("Review my drafts and tell me what’s ready to publish.")}>
                    📝 {ctx.drafts > 0 ? `${ctx.drafts} draft${ctx.drafts === 1 ? "" : "s"} waiting` : "No drafts yet"}
                  </button>
                  {ctx.scheduledToday > 0 && (
                    <Link href="/admin/scheduled" className="adm-ac-ctxchip">⏰ {ctx.scheduledToday} scheduled today</Link>
                  )}
                  {ctx.nextRun && (
                    <Link href="/admin/ai-assistant/settings" className="adm-ac-ctxchip">🌅 Next run {ctx.nextRun}</Link>
                  )}
                </div>

                <div className="adm-ac-grid">
                  {SUGGESTIONS.map(({ Icon, label, desc, prompt }) => (
                    <button key={label} type="button" className="adm-ac-suggest" onClick={() => send(prompt)} disabled={busy}>
                      <span className="adm-ac-suggest-ic"><Icon className="h-[18px] w-[18px]" /></span>
                      <span className="adm-ac-suggest-txt">
                        <span className="adm-ac-suggest-lbl">{label}</span>
                        <span className="adm-ac-suggest-desc">{desc}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="adm-ac-msg user">
                    <div className="adm-ac-col">
                      <div className="adm-ac-bubble user">{m.content}</div>
                      <div className="adm-ac-meta"><time className="adm-ac-time">{fmtClock(m.at)}</time></div>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="adm-ac-msg assistant">
                    <span className="adm-ac-avatar" aria-hidden><SparklesIcon className="h-4 w-4" /></span>
                    <div className="adm-ac-col">
                      {m.toolLog && m.toolLog.length > 0 && (
                        <div className="adm-ac-tools">
                          {m.toolLog.map((t, i) => (
                            <span key={i} className={`adm-ac-toolchip ${t.isError ? "err" : ""}`} title={t.tool}><span aria-hidden>🔧</span> {t.summary}</span>
                          ))}
                        </div>
                      )}
                      <div className={`adm-ac-bubble assistant ${m.error ? "err" : ""}`}>
                        {m.error ? (
                          <>
                            <p style={{ margin: 0 }}>{m.content}</p>
                            <button type="button" className="adm-btn-ghost adm-ac-retry" onClick={retryLast} disabled={busy}>
                              <RefreshIcon className="h-4 w-4" /> Retry
                            </button>
                          </>
                        ) : (
                          <div className="adm-ac-md"><ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{m.content}</ReactMarkdown></div>
                        )}
                      </div>
                      {!m.error && (
                        <div className="adm-ac-meta">
                          <button type="button" className="adm-ac-copy" onClick={() => copyMsg(m.id, m.content)} aria-label="Copy message">
                            {copied === m.id ? <CheckIcon className="h-[13px] w-[13px]" /> : <CopyIcon className="h-[13px] w-[13px]" />}
                            {copied === m.id ? "Copied" : "Copy"}
                          </button>
                          <time className="adm-ac-time">{fmtClock(m.at)}</time>
                        </div>
                      )}

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
                            {a.type === "set_page_earnings" && a.params?.rows && a.params.rows.length > 0 && (
                              <EarningsPreview rows={a.params.rows} skipped={a.params.skipped} />
                            )}
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
              <div className="adm-ac-msg assistant">
                <span className="adm-ac-avatar" aria-hidden><SparklesIcon className="h-4 w-4" /></span>
                <div className="adm-ac-bubble assistant working" aria-label="Working">
                  <span className="adm-ac-dots" aria-hidden><i /><i /><i /></span>
                </div>
              </div>
            )}
          </div>

          {showFab && (
            <button type="button" className="adm-ac-fab" aria-label="Scroll to latest" onClick={scrollToBottom}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
          )}

          <form className="adm-ac-composer" onSubmit={(e) => { e.preventDefault(); send(input); }}>
            <div className="adm-ac-inputwrap">
              <textarea
                ref={taRef}
                className="adm-ac-ta"
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={onComposerFocus}
                onBlur={onComposerBlur}
                placeholder="Message the assistant…"
                aria-label="Message the assistant"
                disabled={busy}
              />
              <button
                type="submit"
                className="adm-ac-send"
                disabled={busy || !input.trim()}
                aria-label="Send"
                onMouseDown={(e) => e.preventDefault()} /* keep the textarea focused → keyboard stays up */
              >
                {busy ? <span className="adm-spinner" aria-hidden /> : SendIcon}
              </button>
            </div>
            <p className="adm-ac-hint" aria-hidden>Enter to send · Shift+Enter for a new line</p>
          </form>
        </>
      )}
    </div>
  );
}
