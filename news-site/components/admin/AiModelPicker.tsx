"use client";

import { AI_MODELS } from "@/lib/aiModels";

// Compact model dropdown for the AI panels. The selected id is owned by the
// parent (which persists it to localStorage via useAiModel).
export function AiModelPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="adm-ai-modelpick" title="Choose the AI model (affects quality + cost)">
      <span className="adm-ai-modelpick-lbl">Model</span>
      <select
        className="adm-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="AI model"
      >
        {AI_MODELS.map((m) => (
          <option key={m.id} value={m.id}>
            {m.label} — {m.note}
          </option>
        ))}
      </select>
    </label>
  );
}
