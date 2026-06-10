"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { AiModelPicker } from "@/components/admin/AiModelPicker";
import { useAiModel } from "@/lib/useAiModel";
import { SparklesIcon, RefreshIcon } from "@/components/admin/icons";

type ToolLogEntry = { tool: string; summary: string; isError?: boolean };
type ChatMsg = { id: string; role: "user" | "assistant"; content: string; toolLog?: ToolLogEntry[]; error?: boolean };

const SUGGESTIONS = [
  "What drafts do I have right now?",
  "Find trending technology news and draft an original article from the top story.",
  "Search world news and suggest 3 story ideas.",
];

let idSeq = 0;
const nextId = () => `m${Date.now()}-${idSeq++}`;

export function AgentChat({ aiConfigured }: { aiConfigured: boolean }) {
  const [model, setModel] = useAiModel();
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

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
        body: JSON.stringify({
          model,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reply?: string;
        toolLog?: ToolLogEntry[];
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: data.error ?? "Something went wrong. Please try again.", error: true },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", content: data.reply ?? "(no reply)", toolLog: data.toolLog ?? [] },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "assistant", content: "Couldn’t reach the assistant. Check your connection and try again.", error: true },
      ]);
    } finally {
      setBusy(false);
      taRef.current?.focus();
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
          <p className="adm-agent-sub">Reads your articles &amp; trending news and writes original drafts. It can’t publish or share — that comes with approval (Phase 2).</p>
        </div>
        <div className="adm-agent-headtools">
          <AiModelPicker value={model} onChange={setModel} disabled={busy} />
          {messages.length > 0 && (
            <button type="button" className="adm-btn-ghost" onClick={() => setMessages([])} disabled={busy} title="Clear this conversation">
              <RefreshIcon className="h-4 w-4" /> New chat
            </button>
          )}
        </div>
      </div>

      {!aiConfigured ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill"><SparklesIcon className="h-[34px] w-[34px]" /></div>
            <h2 className="adm-serif">Set up AI first</h2>
            <p>Add <code>ANTHROPIC_API_KEY</code> in your environment (Vercel → Settings → Environment Variables), then redeploy. The assistant reuses the same key as the AI draft tools.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="adm-agent-scroll" ref={scrollRef}>
            {messages.length === 0 ? (
              <div className="adm-agent-empty">
                <p>Ask me to find news, review your drafts, or write an original draft from a trending story.</p>
                <div className="adm-agent-suggest">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} type="button" className="adm-srcchip on" onClick={() => send(s)} disabled={busy}>
                      {s}
                    </button>
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
                            <div key={i} className={`adm-agent-toolline ${t.isError ? "err" : ""}`} title={t.tool}>
                              <span aria-hidden>🔧</span> {t.summary}
                            </div>
                          ))}
                        </div>
                      )}
                      <div className={`adm-agent-bubble assistant ${m.error ? "err" : ""}`}>
                        {m.error ? (
                          <p style={{ margin: 0 }}>{m.content}</p>
                        ) : (
                          <div className="adm-agent-md">
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                              {m.content}
                            </ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ),
              )
            )}

            {busy && (
              <div className="adm-agent-row assistant">
                <div className="adm-agent-bubble assistant working">
                  <span className="adm-spinner" aria-hidden /> Working…
                </div>
              </div>
            )}
          </div>

          <form
            className="adm-agent-inputbar"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
          >
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
                <path d="M22 2 11 13" />
                <path d="M22 2 15 22l-4-9-9-4 20-7z" />
              </svg>
            </button>
          </form>
        </>
      )}
    </div>
  );
}
