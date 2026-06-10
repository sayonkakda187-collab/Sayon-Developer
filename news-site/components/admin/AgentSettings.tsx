"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AI_MODELS } from "@/lib/aiModels";
import { useToast } from "@/components/admin/Toast";
import { updateAgentSettings } from "@/app/admin/agent-actions";
import type { AgentSettings } from "@/lib/agent/store";
import { PushToggle } from "@/components/admin/PushToggle";
import { CheckIcon } from "@/components/admin/icons";

function Toggle({
  checked,
  onChange,
  label,
  hint,
  locked,
}: {
  checked: boolean;
  onChange?: (v: boolean) => void;
  label: string;
  hint?: string;
  locked?: boolean;
}) {
  return (
    <label className={`adm-agset-row ${locked ? "locked" : ""}`}>
      <span className="adm-agset-rowtext">
        <span className="adm-agset-rowlabel">{label}</span>
        {hint && <span className="adm-agset-rowhint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="adm-agset-switch"
        checked={checked}
        disabled={locked}
        onChange={(e) => onChange?.(e.target.checked)}
      />
    </label>
  );
}

export function AgentSettingsForm({ initial, aiConfigured }: { initial: AgentSettings; aiConfigured: boolean }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [s, setS] = useState<AgentSettings>(initial);
  const [saving, setSaving] = useState(false);

  const setCap = (k: keyof AgentSettings["capabilities"]) => (v: boolean) =>
    setS((p) => ({ ...p, capabilities: { ...p.capabilities, [k]: v } }));

  async function save() {
    setSaving(true);
    const res = await updateAgentSettings(s);
    setSaving(false);
    if (res.ok) {
      success("Agent settings saved.");
      router.refresh();
    } else {
      error(res.error ?? "Couldn’t save.");
    }
  }

  return (
    <div>
      <div className="adm-page-h">
        <h1>Agent Settings</h1>
        <p>
          Control what the <Link href="/admin/ai-assistant" className="adm-link">AI Assistant</Link> can do and what needs your approval.
        </p>
      </div>

      {!aiConfigured && (
        <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
          <p className="adm-card-sub">⚠ AI isn’t set up — add <code>ANTHROPIC_API_KEY</code>, then redeploy.</p>
        </div>
      )}

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Capabilities</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>Turn a capability off and its tool disappears from the assistant entirely.</div>
        <Toggle label="News search" hint="Find trending headlines (cached; small quotas)" checked={s.capabilities.newsSearch} onChange={setCap("newsSearch")} />
        <Toggle label="Drafting" hint="Write original drafts" checked={s.capabilities.drafting} onChange={setCap("drafting")} />
        <Toggle label="Editing" hint="Edit drafts (and propose edits to live articles)" checked={s.capabilities.editing} onChange={setCap("editing")} />
        <Toggle label="Publishing" hint="Propose making drafts public" checked={s.capabilities.publishing} onChange={setCap("publishing")} />
        <Toggle label="Facebook sharing" hint="Propose sharing to connected Pages" checked={s.capabilities.sharing} onChange={setCap("sharing")} />
      </div>

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Require approval</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>When required, the assistant proposes an action card you must Approve before it runs.</div>
        <Toggle label="Editing live articles" checked={s.requireApproval.editLive} onChange={(v) => setS((p) => ({ ...p, requireApproval: { ...p.requireApproval, editLive: v } }))} />
        <Toggle label="Publishing" hint="Always required for safety" checked locked />
        <Toggle label="Facebook sharing" hint="Always required for safety" checked locked />
      </div>

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Custom instructions</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>Added to the assistant’s system prompt — e.g. house style, tone, topics to favor or avoid.</div>
        <textarea
          className="adm-input"
          rows={5}
          maxLength={4000}
          value={s.customInstructions}
          onChange={(e) => setS((p) => ({ ...p, customInstructions: e.target.value }))}
          placeholder="e.g. Use British spelling. Keep headlines under 70 characters. Avoid speculation."
        />
      </div>

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Default model</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>Used unless you pick another in the chat.</div>
        <select
          className="adm-input"
          style={{ maxWidth: 360 }}
          value={s.model ?? ""}
          onChange={(e) => setS((p) => ({ ...p, model: e.target.value || null }))}
        >
          <option value="">Default ({AI_MODELS[0].label})</option>
          {AI_MODELS.map((m) => (
            <option key={m.id} value={m.id}>{m.label} — {m.note}</option>
          ))}
        </select>
      </div>

      <PushToggle />

      <div className="adm-settings-actions">
        <button type="button" className="adm-btn-primary" onClick={save} disabled={saving}>
          {saving ? <span className="adm-spinner" aria-hidden /> : <CheckIcon className="h-4 w-4" />} Save settings
        </button>
      </div>
    </div>
  );
}
