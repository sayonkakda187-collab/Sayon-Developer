"use client";

import { useState } from "react";
import { AI_MODELS, AI_MODEL_STORAGE_KEY, isValidModel } from "@/lib/aiModels";
import { useToast } from "@/components/admin/Toast";
import { updateDefaultAiModel } from "@/app/admin/settings-actions";

// Plain-language trade-off note per model (the short cost hint lives in AI_MODELS).
const DESCRIPTIONS: Record<string, string> = {
  "claude-haiku-4-5-20251001": "Cheapest & fastest. Great default for everyday drafting and edits.",
  "claude-sonnet-4-6": "Balanced quality and cost — a solid step up for trickier pieces.",
  "claude-opus-4-8": "Highest quality, slowest and priciest. Use for your most important writing.",
};

/**
 * AI-model section of Settings. Sets the account-wide DEFAULT model (persisted
 * server-side). It also writes the per-browser localStorage key so the AI Assist
 * panels on this device use it immediately; you can still switch per use there.
 */
export function SettingsAiModel({ defaultModel }: { defaultModel: string }) {
  const { success, error } = useToast();
  const [model, setModel] = useState(isValidModel(defaultModel) ? defaultModel : AI_MODELS[0].id);
  const [busy, setBusy] = useState(false);

  async function choose(id: string) {
    if (id === model || busy) return;
    const prev = model;
    setModel(id); // optimistic
    setBusy(true);
    const res = await updateDefaultAiModel(id);
    setBusy(false);
    if (!res.ok) {
      setModel(prev);
      return error(res.error);
    }
    try {
      localStorage.setItem(AI_MODEL_STORAGE_KEY, id);
    } catch {
      /* localStorage may be unavailable */
    }
    success("Default AI model saved.");
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-card-title">AI Assistant model</div>
      <p className="adm-card-sub" style={{ marginTop: 4 }}>
        The default model AI Assist uses. You can still switch it per use in the AI panels.
      </p>

      <div className="adm-modelopts" role="radiogroup" aria-label="Default AI model">
        {AI_MODELS.map((m) => {
          const on = m.id === model;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={on}
              className={`adm-modelopt ${on ? "on" : ""}`}
              onClick={() => choose(m.id)}
              disabled={busy}
            >
              <span className="adm-modelopt-main">
                <span className="adm-modelopt-top">
                  <span className="adm-modelopt-name">{m.label}</span>
                  <span className="adm-modelopt-cost">{m.note}</span>
                </span>
                <span className="adm-modelopt-desc">{DESCRIPTIONS[m.id] ?? ""}</span>
              </span>
              <span className={`adm-modelopt-dot ${on ? "on" : ""}`} aria-hidden />
            </button>
          );
        })}
      </div>
    </div>
  );
}
