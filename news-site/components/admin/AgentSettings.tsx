"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AI_MODELS } from "@/lib/aiModels";
import { useToast } from "@/components/admin/Toast";
import { updateAgentSettings } from "@/app/admin/agent-actions";
import type { AgentSettings, AutopilotSettings, AutopilotRun } from "@/lib/agent/store";
import { PushToggle } from "@/components/admin/PushToggle";
import { CheckIcon, CloseIcon } from "@/components/admin/icons";

// Asia/Phnom_Penh is a fixed UTC+7 (no DST), so a plain hour shift is exact.
const PP_OFFSET_MIN = 7 * 60;
function shiftHHMM(hhmm: string, deltaMin: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m + deltaMin + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
const utcToPp = (hhmm: string) => shiftHHMM(hhmm, PP_OFFSET_MIN);
const ppToUtc = (hhmm: string) => shiftHHMM(hhmm, -PP_OFFSET_MIN);

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

  // ── Auto-Pilot Runs ─────────────────────────────────────────────────────────
  const runs = ap.runs;
  const updateRun = (id: string, patch: Partial<AutopilotRun>) =>
    setAp({ runs: runs.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  const deleteRun = (id: string) => setAp({ runs: runs.filter((r) => r.id !== id) });
  const toggleRunCat = (run: AutopilotRun, slug: string) =>
    updateRun(run.id, { categories: run.categories.includes(slug) ? run.categories.filter((x) => x !== slug) : [...run.categories, slug] });
  function addRun() {
    if (runs.length >= 6) return;
    const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `run-${Date.now()}`;
    setAp({ runs: [...runs, { id, timeUtc: ppToUtc("12:00"), categories: [], keyword: "", count: 3, mode: "draft", publishMode: "stagger", enabled: true }] });
  }

  // Next-24h upcoming Runs (sorted by next occurrence), for the strip at the top.
  const upcoming = (() => {
    const now = Date.now();
    return runs
      .filter((r) => r.enabled)
      .map((r) => {
        const [h, m] = r.timeUtc.split(":").map(Number);
        const t = new Date();
        t.setUTCHours(h, m, 0, 0);
        let occ = t.getTime();
        if (occ <= now) occ += 86_400_000;
        return { run: r, occ };
      })
      .filter((x) => x.occ - now <= 24 * 3_600_000)
      .sort((a, b) => a.occ - b.occ);
  })();
  const anyPublish = runs.some((r) => r.enabled && r.mode === "publish");

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
        <Toggle label="Page earnings" hint="Propose recording Page Control daily earnings (approval required)" checked={s.capabilities.pageEarnings} onChange={setCap("pageEarnings")} />
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
        <div className="adm-card-title">Auto-Pilot Runs</div>
        <div className="adm-card-sub" style={{ marginBottom: 8 }}>
          Schedule one or more daily <strong>Runs</strong> (up to 6). Each finds top trending stories and either
          saves <strong>drafts for your approval</strong> (default) or <strong>auto-publishes</strong> them. New Runs
          always start in draft mode — auto-publish is an explicit per-Run choice.
        </div>

        <Toggle label="Enable Auto-Pilot" hint="Master switch — off by default" checked={ap.enabled} onChange={(v) => setAp({ enabled: v })} />
        <Toggle
          label="Pause all auto-publish"
          hint="Kill switch — while on, every Run drafts only (nothing auto-publishes)"
          checked={ap.pauseAutoPublish}
          onChange={(v) => setAp({ pauseAutoPublish: v })}
        />

        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginTop: 12 }}>
          <span className="adm-agset-rowlabel">Daily auto-publish cap (across all Runs)</span>
          <input
            type="number"
            min={0}
            max={100}
            className="adm-input"
            style={{ maxWidth: 120 }}
            value={ap.dailyAutoPublishCap}
            onChange={(e) => setAp({ dailyAutoPublishCap: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
          />
        </label>

        {/* Upcoming runs strip (next 24h) */}
        <div style={{ marginTop: 14, padding: "8px 12px", border: "1px solid var(--adm-bd)", borderRadius: 10, background: "var(--adm-card)" }}>
          <span className="adm-fb-sub" style={{ fontWeight: 700, marginRight: 8 }}>Next 24h:</span>
          {!ap.enabled ? (
            <span className="adm-fb-sub">Auto-Pilot is off</span>
          ) : upcoming.length === 0 ? (
            <span className="adm-fb-sub">No runs scheduled</span>
          ) : (
            <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 6 }}>
              {upcoming.map(({ run }) => {
                const isPub = run.mode === "publish" && !ap.pauseAutoPublish;
                return (
                  <span key={run.id} className="adm-pill" style={{ background: isPub ? "rgba(147,51,234,.14)" : "rgba(120,130,150,.14)", color: isPub ? "#7c3aed" : "var(--adm-muted)" }}>
                    {utcToPp(run.timeUtc)} · {isPub ? (run.publishMode === "now" ? "Publish now" : "Stagger") : "Drafts"}
                  </span>
                );
              })}
            </span>
          )}
        </div>

        {/* Run cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
          {runs.map((run) => {
            const isPub = run.mode === "publish";
            return (
              <div key={run.id} style={{ border: "1px solid var(--adm-bd)", borderRadius: 12, padding: 12, background: "var(--adm-card)" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span className="adm-agset-rowlabel">Run time (Phnom Penh)</span>
                    <input type="time" className="adm-input" style={{ maxWidth: 140 }} value={utcToPp(run.timeUtc)} onChange={(e) => e.target.value && updateRun(run.id, { timeUtc: ppToUtc(e.target.value) })} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
                    <span className="adm-agset-rowlabel">Articles (1–5)</span>
                    <input type="number" min={1} max={5} className="adm-input" style={{ maxWidth: 90 }} value={run.count} onChange={(e) => updateRun(run.id, { count: Math.min(5, Math.max(1, Number(e.target.value) || 1)) })} />
                  </label>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                    <label className="adm-check" style={{ margin: 0 }}>
                      <input type="checkbox" checked={run.enabled} onChange={(e) => updateRun(run.id, { enabled: e.target.checked })} />
                      <span>On</span>
                    </label>
                    <button type="button" className="adm-iconbtn" aria-label="Delete run" onClick={() => deleteRun(run.id)}>
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                  <div className="adm-seg" role="tablist" aria-label="Run mode">
                    <button type="button" role="tab" aria-selected={!isPub} className={`adm-seg-btn ${!isPub ? "on" : ""}`} onClick={() => updateRun(run.id, { mode: "draft" })}>Drafts for approval</button>
                    <button type="button" role="tab" aria-selected={isPub} className={`adm-seg-btn ${isPub ? "on" : ""}`} onClick={() => updateRun(run.id, { mode: "publish" })}>Auto-publish</button>
                  </div>
                  {isPub && (
                    <div className="adm-seg" role="tablist" aria-label="Publish timing">
                      <button type="button" role="tab" aria-selected={run.publishMode === "now"} className={`adm-seg-btn ${run.publishMode === "now" ? "on" : ""}`} onClick={() => updateRun(run.id, { publishMode: "now" })}>Publish now</button>
                      <button type="button" role="tab" aria-selected={run.publishMode === "stagger"} className={`adm-seg-btn ${run.publishMode === "stagger" ? "on" : ""}`} onClick={() => updateRun(run.id, { publishMode: "stagger" })}>Stagger into slots</button>
                    </div>
                  )}
                </div>
                {isPub && (
                  <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 8 }}>
                    ⚠ This Run publishes live automatically{run.publishMode === "stagger" ? " into your preferred posting times" : " as soon as each article is written"}. Facebook auto-share fires at publish time if the article has share pages set.
                  </p>
                )}

                <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, marginTop: 12 }}>
                  <span className="adm-agset-rowlabel">Keyword focus (optional)</span>
                  <input type="text" className="adm-input" style={{ maxWidth: 320 }} maxLength={80} value={run.keyword} placeholder="e.g. global news, technology" onChange={(e) => updateRun(run.id, { keyword: e.target.value })} />
                </label>

                <div className="adm-card-sub" style={{ marginTop: 12, marginBottom: 6 }}>
                  Categories {run.categories.length === 0 && <em>(all)</em>}
                </div>
                {categories.length === 0 ? (
                  <p className="adm-card-sub">No categories yet — add some under Categories.</p>
                ) : (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {categories.map((c) => (
                      <label key={c.slug} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                        <input type="checkbox" checked={run.categories.includes(c.slug)} onChange={() => toggleRunCat(run, c.slug)} />
                        {c.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button type="button" className="adm-btn-ghost" style={{ marginTop: 12 }} disabled={runs.length >= 6} onClick={addRun}>
          + Add run{runs.length >= 6 ? " (max 6)" : ""}
        </button>

        <p className="adm-card-sub" style={{ marginTop: 14 }}>
          ⏰ Runs (and timed scheduled publishes) fire via the <strong>external pinger</strong> that calls{" "}
          <code>/api/cron/publish-due</code> every ~10 min — see the note below. The once-daily Vercel cron is only a
          safety net, so on <strong>Hobby</strong> without the pinger, Runs fire at most once a day.{anyPublish && (
            <> {" "}<strong>Auto-publish is enabled on at least one Run</strong> — articles will go live without review.</>
          )}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 12 }}>
          <button type="button" className="adm-btn-ghost" onClick={runNow} disabled={running || !aiConfigured}>
            {running && <span className="adm-spinner" aria-hidden />}
            {running ? "Running… (up to ~60s)" : "Run now (drafts only)"}
          </button>
          <span className="adm-card-sub" style={{ margin: 0 }}>
            Safe test — drafts immediately (even while off, never auto-publishes); they appear in{" "}
            <Link href="/admin/articles" className="adm-link">Articles</Link>.
          </span>
        </div>
      </div>

      <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
        <div className="adm-card-title">Preferred posting times</div>
        <div className="adm-card-sub" style={{ marginBottom: 10 }}>
          Quick-schedule presets (Asia/Phnom_Penh). Shown on publish approval cards and used by
          auto-stagger when you approve several drafts in a row.
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          {s.preferredTimes.map((t, i) => (
            <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <input
                type="time"
                className="adm-input"
                style={{ maxWidth: 130 }}
                value={t}
                onChange={(e) => setS((p) => ({ ...p, preferredTimes: p.preferredTimes.map((x, idx) => (idx === i ? e.target.value : x)) }))}
              />
              <button
                type="button"
                className="adm-iconbtn"
                aria-label="Remove time"
                onClick={() => setS((p) => ({ ...p, preferredTimes: p.preferredTimes.filter((_, idx) => idx !== i) }))}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </span>
          ))}
        </div>
        <button
          type="button"
          className="adm-btn-ghost"
          style={{ marginTop: 10 }}
          disabled={s.preferredTimes.length >= 8}
          onClick={() => setS((p) => ({ ...p, preferredTimes: [...p.preferredTimes, "12:00"] }))}
        >
          + Add time
        </button>
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
