"use client";

import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/lib/markdownComponents";
import { AiModelPicker } from "@/components/admin/AiModelPicker";
import { useAiModel } from "@/lib/useAiModel";
import { AI_EDIT_ACTIONS, type AiEditAction } from "@/lib/aiModels";
import { SparklesIcon, CloseIcon, CheckIcon } from "@/components/admin/icons";

type Phase = "idle" | "loading" | "ready" | "error";

export type AiEdit = { title?: string; body?: string; summary: string };

/**
 * AI editing panel for the article editor. Sends the admin's OWN title + body
 * with a quick-action or free-form instruction to /api/admin/ai-assist
 * (mode:"edit"), previews the revision, and lets them APPLY it into the editor
 * as an unsaved change (they can still undo / re-edit). Never auto-saves.
 */
export function ArticleAiEditModal({
  title,
  body,
  onApply,
  onClose,
}: {
  title: string;
  body: string;
  onApply: (edit: AiEdit) => void;
  onClose: () => void;
}) {
  const [model, setModel] = useAiModel();
  const [phase, setPhase] = useState<Phase>("idle");
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState<AiEdit | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && phase !== "loading") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, phase]);

  async function run(promptText: string, target: "title" | "body") {
    const text = promptText.trim();
    if (!text) return;
    setPhase("loading");
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/admin/ai-assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode: "edit", title, articleBody: body, instruction: text, target, model }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setError(data.error ?? "The AI couldn’t complete that edit.");
        setPhase("error");
        return;
      }
      setResult(data.result as AiEdit);
      setPhase("ready");
    } catch {
      setError("Couldn’t reach the AI service. Please try again.");
      setPhase("error");
    }
  }

  function runAction(a: AiEditAction) {
    setInstruction(a.label);
    run(a.instruction, a.target);
  }

  function apply() {
    if (result) onApply(result);
  }

  const hasContent = title.trim().length > 0 || body.trim().length > 0;

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget && phase !== "loading") onClose(); }}>
      <div className="adm-modal adm-ai-modal" role="dialog" aria-modal="true" aria-label="AI edit this article">
        <div className="adm-modal-head">
          <div className="adm-ai-title">
            <span className="adm-ai-spark"><SparklesIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>AI Assist · edit article</h2>
              <p className="adm-ai-sub">Improve or rewrite your current draft — you review before it applies.</p>
            </div>
          </div>
          <div className="adm-ai-headtools">
            <AiModelPicker value={model} onChange={setModel} disabled={phase === "loading"} />
            <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="adm-ai-disclaimer" role="note">
          <strong>AI edit — review and fact-check before publishing.</strong> Edits apply to the
          editor as unsaved changes; verify facts and keep it in your own words. Nothing is published.
        </div>

        <div className="adm-modal-body adm-ai-body">
          {!hasContent ? (
            <p className="adm-ai-text">Add a title or some body text first, then AI Assist can help you edit it.</p>
          ) : (
            <>
              {/* Quick actions. */}
              <div className="adm-ai-actions">
                {AI_EDIT_ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="adm-ai-action"
                    onClick={() => runAction(a)}
                    disabled={phase === "loading"}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {/* Free-form instruction. */}
              <form
                className="adm-ai-instruct"
                onSubmit={(e) => { e.preventDefault(); run(instruction, "body"); }}
              >
                <input
                  className="adm-input"
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  placeholder="Or tell the AI what to change…"
                  aria-label="Edit instruction"
                  disabled={phase === "loading"}
                />
                <button type="submit" className="adm-btn-primary" disabled={phase === "loading" || instruction.trim().length < 2}>
                  {phase === "loading" ? <span className="adm-spinner" aria-hidden /> : <SparklesIcon className="h-4 w-4" />}
                  {phase === "loading" ? "Working…" : "Run"}
                </button>
              </form>

              {phase === "loading" && (
                <div className="adm-ai-loading">
                  <div className="adm-ai-spinwrap">
                    <span className="adm-spinner adm-ai-spinner" aria-hidden />
                    <p>Editing your article… this runs a paid AI call.</p>
                  </div>
                </div>
              )}

              {phase === "error" && <div className="adm-ai-error"><p>{error}</p></div>}

              {phase === "ready" && result && (
                <div className="adm-ai-section highlight">
                  <div className="adm-ai-section-head">
                    <h3>Proposed {result.title && !result.body ? "headline" : "revision"}</h3>
                    <span className="adm-ai-foot-note" style={{ margin: 0 }}>{result.summary}</span>
                  </div>
                  {result.title && (
                    <p className="adm-ai-text" style={{ fontWeight: 700 }}>{result.title}</p>
                  )}
                  {result.body && (
                    <div className="adm-ai-md adm-ai-preview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{result.body}</ReactMarkdown>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {phase === "ready" && result && (
          <div className="adm-modal-foot">
            <span className="adm-ai-foot-note">Applies to the editor as an unsaved change — you can still undo.</span>
            <button type="button" className="adm-btn-primary" onClick={apply}>
              <CheckIcon className="h-4 w-4" />
              Apply {result.title && !result.body ? "headline" : "to article"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
