"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AI_MODELS } from "@/lib/aiModels";
import { useToast } from "@/components/admin/Toast";
import { updateAgentSettings } from "@/app/admin/agent-actions";
import type { AgentSettings, AutopilotSettings } from "@/lib/agent/store";
import { PushToggle } from "@/components/admin/PushToggle";
import { CheckIcon } from "@/components/admin/icons";

// Asia/Phnom_Penh is a fixed UTC+7 (no DST), so a plain hour shift is exact.
const PP_OFFSET_MIN = 7 * 60;
function shiftHHMM(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + deltaMin + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const utcToPp = (hhmm: string) => shiftHHMM(hhmm, PP_OFFSET_MIN);
const ppToUtc = (hhmm: string) => shiftHHMM(hhmm, -PP_OFFSET_MIN);
/** The vercel.json cron expression (UTC) for a given UTC HH:MM. */
function cronFromUtc(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return `${m} ${h} * * *`;
}

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

export function AgentSettingsForm({
  initial,
  aiConfigured,
  categories,
}: {
  initial: AgentSettings;
  aiConfigured: boolean;
  categories: { name: string; slug: string }[];
}) {
  const router = useRouter();
  const { success, error } = useToast();
  const [s, setS] = useState<AgentSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const setCap = (k: keyof AgentSettings["capabilities"]) => (v: boolean) =>
    setS((p) => ({ ...p, capabilities: { ...p.capabilities, [k]: v } }));

  const ap = s.autopilot;
  const setAp = (patch: Partial<AutopilotSettings>) =>
    setS((p) => ({ ...p, autopilot: { ...p.autopilot, ...patch } }));
  const toggleCat = (slug: string) =>
    setAp({
      categories: ap.categories.includes(slug)
        ? ap.categories.filter((x) => x !== slug)
        : [...ap.categories, slug],
    });

  // "Run now": triggers the same job via the admin route (runs even while OFF).
  // It can take ~30–60s; the push + activity log capture the result too.
  async function runNow() {
    if (running) return;
    setRunning(true);
    try {
      const res = await fetch("/api/admin/agent/autopilot-run", { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        created?: number;
        message?: string;
      };
      if (res.ok && data.ok && (data.created ?? 0) > 0) {
        success(`Auto-Pilot created ${data.created} draft${data.created === 1 ? "" : "s"}.`);
        router.refresh();
      } else {
        error(data.message || "No new drafts were created — see the activity log.");
      }
    } catch {
      error("Couldn’t reach the server. Please try again.");
    } finally {
      setRunning(false);
    }
  }

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

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Morning Auto-Pilot</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>
          Once a day, automatically find top trending stories and write original <strong>drafts</strong> for
          your review. It <strong>never publishes or shares</strong> — only drafts. You get one push when they’re ready.
        </div>

        <Toggle
          label="Enable Auto-Pilot"
          hint="Off by default — turn it on when you’re ready"
          checked={ap.enabled}
          onChange={(v) => setAp({ enabled: v })}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginTop: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <span className="adm-agset-rowlabel">Run time (Phnom Penh)</span>
            <input
              type="time"
              className="adm-input"
              style={{ maxWidth: 160 }}
              value={utcToPp(ap.runTimeUtc)}
              onChange={(e) => e.target.value && setAp({ runTimeUtc: ppToUtc(e.target.value) })}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            <span className="adm-agset-rowlabel">Drafts per run (1–5)</span>
            <input
              type="number"
              min={1}
              max={5}
              className="adm-input"
              style={{ maxWidth: 100 }}
              value={ap.draftCount}
              onChange={(e) => setAp({ draftCount: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })}
            />
          </label>
        </div>

        <div className="adm-card-sub" style={{ marginTop: 12, marginBottom: 6 }}>
          Categories to include {ap.categories.length === 0 && <em>(all categories)</em>}
        </div>
        {categories.length === 0 ? (
          <p className="adm-card-sub">No categories yet — add some under Categories.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {categories.map((c) => (
              <label key={c.slug} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                <input type="checkbox" checked={ap.categories.includes(c.slug)} onChange={() => toggleCat(c.slug)} />
                {c.name}
              </label>
            ))}
          </div>
        )}

        <p className="adm-card-sub" style={{ marginTop: 12 }}>
          ⏰ On the Vercel <strong>Hobby</strong> plan the job runs <strong>once a day</strong> at the time set in{" "}
          <code>vercel.json</code> (Vercel may fire it up to an hour late). It ships at <strong>06:00 Phnom Penh</strong>.
          To change when it actually fires, set this schedule in <code>vercel.json</code> and redeploy (or upgrade to
          Pro for finer control):
          <br />
          <code>{cronFromUtc(ap.runTimeUtc)}</code> — {utcToPp(ap.runTimeUtc)} Phnom Penh / {ap.runTimeUtc} UTC
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button type="button" className="adm-btn-ghost" onClick={runNow} disabled={running || !aiConfigured}>
            {running && <span className="adm-spinner" aria-hidden />}
            {running ? "Running… (up to ~60s)" : "Run now"}
          </button>
          <span className="adm-card-sub" style={{ margin: 0 }}>
            Drafts immediately (even while off) for testing — they appear in{" "}
            <Link href="/admin/articles" className="adm-link">Articles</Link>.
          </span>
        </div>
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
