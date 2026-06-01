"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { AiModelPicker } from "@/components/admin/AiModelPicker";
import { useAiModel } from "@/lib/useAiModel";
import { SparklesIcon, CloseIcon, CopyIcon, CheckIcon, PencilIcon } from "@/components/admin/icons";

export type AiAssistResult = {
  brief: string;
  headlines: string[];
  outline: string;
  background: string;
  draft: string;
};

// Key for the one-shot editor handoff (read once on the new-article page).
export const AI_HANDOFF_KEY = "dl:ai-handoff";

type Phase = "loading" | "ready" | "error";

/**
 * AI Assist modal. Calls /api/admin/ai-assist (server-side, paid) with a
 * headline + topic ONLY — never scraped source text — and renders the 5
 * sections with copy buttons. "Use as draft" hands the original draft + a
 * chosen headline to the editor as an UNSAVED draft (never auto-published).
 */
export function AiAssistModal({
  headline,
  topic,
  onClose,
}: {
  headline: string;
  topic?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [model, setModel] = useAiModel();
  const [phase, setPhase] = useState<Phase>("loading");
  const [result, setResult] = useState<AiAssistResult | null>(null);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDivElement>(null);

  // Re-run when the model changes so the admin can regenerate with another model.
  useEffect(() => {
    let cancelled = false;
    setPhase("loading");
    (async () => {
      try {
        const res = await fetch("/api/admin/ai-assist", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ headline, topic, model }),
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.ok) {
          setError(data.error ?? "The AI assistant couldn’t generate a draft.");
          setPhase("error");
          return;
        }
        setResult(data.result as AiAssistResult);
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setError("Couldn’t reach the AI service. Please try again.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [headline, topic, model]);

  // Close on Escape; lock background scroll while open.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function applyAsDraft(chosenHeadline?: string) {
    if (!result) return;
    try {
      sessionStorage.setItem(
        AI_HANDOFF_KEY,
        JSON.stringify({
          title: (chosenHeadline || headline || "").slice(0, 200),
          draft: result.draft,
          at: Date.now(),
        }),
      );
    } catch {
      /* sessionStorage may be unavailable; navigation still works with a title */
    }
    onClose();
    router.push(`/admin/articles/new?ai=1`);
  }

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-ai-modal" role="dialog" aria-modal="true" aria-label="AI writing assistant" ref={dialogRef}>
        <div className="adm-modal-head">
          <div className="adm-ai-title">
            <span className="adm-ai-spark"><SparklesIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>AI Assist</h2>
              <p className="adm-ai-sub">{headline}</p>
            </div>
          </div>
          <div className="adm-ai-headtools">
            <AiModelPicker value={model} onChange={setModel} disabled={phase === "loading"} />
            <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Always-visible disclaimer. */}
        <div className="adm-ai-disclaimer" role="note">
          <strong>AI draft — review, fact-check, and edit before publishing.</strong> Verify all
          facts. Write in your own words. This is a starting point generated from general knowledge,
          not a copy of any source.
        </div>

        <div className="adm-modal-body adm-ai-body">
          {phase === "loading" ? (
            <AiLoading />
          ) : phase === "error" ? (
            <div className="adm-ai-error">
              <p>{error}</p>
              <button type="button" className="adm-btn-ghost" onClick={onClose}>Close</button>
            </div>
          ) : result ? (
            <>
              <Section title="Short brief" body={result.brief} />

              {result.headlines.length > 0 && (
                <div className="adm-ai-section">
                  <div className="adm-ai-section-head">
                    <h3>Suggested headlines</h3>
                  </div>
                  <div className="adm-ai-headlines">
                    {result.headlines.map((h, i) => (
                      <div key={i} className="adm-ai-headline">
                        <span>{h}</span>
                        <div className="adm-ai-headline-acts">
                          <CopyButton text={h} label="Copy headline" />
                          <button type="button" className="adm-btn-ghost adm-ai-mini" onClick={() => applyAsDraft(h)} title="Use this headline + draft">
                            Use
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Section title="Outline" body={result.outline} markdown />
              <Section title="Background & angles" body={result.background} markdown />
              <Section title="Original first draft" body={result.draft} markdown highlight />
            </>
          ) : null}
        </div>

        {phase === "ready" && result && (
          <div className="adm-modal-foot">
            <span className="adm-ai-foot-note">Opens in the editor as an unsaved draft — nothing is published.</span>
            <button type="button" className="adm-btn-primary" onClick={() => applyAsDraft(result.headlines[0])}>
              <PencilIcon className="h-4 w-4" />
              Use as draft
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, body, markdown, highlight }: { title: string; body: string; markdown?: boolean; highlight?: boolean }) {
  if (!body) return null;
  return (
    <div className={`adm-ai-section ${highlight ? "highlight" : ""}`}>
      <div className="adm-ai-section-head">
        <h3>{title}</h3>
        <CopyButton text={body} label={`Copy ${title.toLowerCase()}`} />
      </div>
      {markdown ? (
        <div className="adm-ai-md">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{body}</ReactMarkdown>
        </div>
      ) : (
        <p className="adm-ai-text">{body}</p>
      )}
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 1500);
    } catch {
      /* clipboard may be blocked; no-op */
    }
  }
  return (
    <button type="button" className="adm-ai-copy" onClick={copy} aria-label={label} title={label}>
      {done ? <CheckIcon className="h-4 w-4" /> : <CopyIcon className="h-4 w-4" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function AiLoading() {
  return (
    <div className="adm-ai-loading">
      <div className="adm-ai-spinwrap">
        <span className="adm-spinner adm-ai-spinner" aria-hidden />
        <p>Drafting from the headline… this runs a paid AI call and takes a few seconds.</p>
      </div>
      {["40%", "92%", "78%", "96%", "60%"].map((w, i) => (
        <div key={i} className="sk h-3 rounded" style={{ width: w, marginTop: 10 }} />
      ))}
    </div>
  );
}
