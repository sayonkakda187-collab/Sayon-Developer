"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/admin/Toast";
import { updateAutoShareSettings } from "@/app/admin/facebook-actions";
import { RefreshIcon, CheckIcon } from "@/components/admin/icons";

type PageOpt = { id: string; pageName: string; status: string };
type Settings = { enabled: boolean; delayMinutes: number; pageIds: string[] | null; captionTemplate: string };

const DELAY_PRESETS = [1, 2, 5, 10];

/**
 * Opt-in "auto-share new articles to Facebook" settings (DEFAULT OFF). When ON,
 * newly-published articles enqueue staggered ScheduledPosts to the chosen pages
 * (posted by the existing cron). Honest notes cover the Hobby-cron limitation,
 * token expiry, and the single-page case.
 */
export function FacebookAutoShareSettings({ settings, pages }: { settings: Settings; pages: PageOpt[] }) {
  const { success, error } = useToast();
  const [enabled, setEnabled] = useState(settings.enabled);
  const [delay, setDelay] = useState(settings.delayMinutes);
  const [customDelay, setCustomDelay] = useState(!DELAY_PRESETS.includes(settings.delayMinutes));
  const [allPages, setAllPages] = useState(settings.pageIds === null);
  const [pageIds, setPageIds] = useState<Set<string>>(new Set(settings.pageIds ?? pages.map((p) => p.id)));
  const [caption, setCaption] = useState(settings.captionTemplate);
  const [pending, startTransition] = useTransition();

  function togglePage(id: string) {
    setPageIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const res = await updateAutoShareSettings({
        enabled,
        delayMinutes: delay,
        pageIds: allPages ? null : [...pageIds],
        captionTemplate: caption,
      });
      if (res.ok) success(enabled ? "Auto-share is ON and saved." : "Auto-share settings saved (OFF).");
      else error(res.error);
    });
  }

  const targetCount = allPages ? pages.length : pageIds.size;

  return (
    <div className="adm-card adm-card-pad" style={{ marginTop: 22 }}>
      <div className="adm-list-head" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="adm-card-title">Auto-share new articles to Facebook</div>
          <div className="adm-card-sub">
            When you publish an article, automatically queue it to your Pages (staggered) via the Graph API.
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
          <span className="adm-pill" style={enabled ? { color: "#16a34a", background: "rgba(22,163,74,.12)" } : undefined}>
            {enabled ? "ON" : "OFF"}
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            aria-label="Enable auto-share on publish"
            onClick={() => setEnabled((v) => !v)}
            style={{
              position: "relative",
              width: 46,
              height: 26,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: enabled ? "rgb(var(--accent))" : "rgba(120,130,150,.35)",
              transition: "background .15s",
              flex: "none",
            }}
          >
            <span style={{ position: "absolute", top: 3, left: enabled ? 23 : 3, width: 20, height: 20, borderRadius: 999, background: "#fff", transition: "left .15s", boxShadow: "0 1px 3px rgba(0,0,0,.3)" }} />
          </button>
        </div>
      </div>

      {pages.length === 0 && (
        <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 8 }}>
          No Pages connected yet — connect a Page below for auto-share to have somewhere to post.
        </p>
      )}

      {/* Config (always editable; only acts when ON) */}
      <div style={{ opacity: enabled ? 1 : 0.6, transition: "opacity .15s", marginTop: 12 }}>
        {/* Delay */}
        <label className="adm-field">
          <span>Delay between pages</span>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <select
              className="adm-input"
              style={{ maxWidth: 150 }}
              value={customDelay ? "custom" : String(delay)}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "custom") setCustomDelay(true);
                else { setCustomDelay(false); setDelay(Number(v)); }
              }}
              disabled={pending}
            >
              {DELAY_PRESETS.map((m) => (
                <option key={m} value={String(m)}>{m} min</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            {customDelay && (
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={720}
                  className="adm-input"
                  style={{ width: 90 }}
                  value={delay}
                  onChange={(e) => setDelay(Math.max(0, Math.min(720, Math.floor(Number(e.target.value) || 0))))}
                  disabled={pending}
                  aria-label="Custom delay in minutes"
                />
                <span className="adm-field-hint" style={{ margin: 0 }}>minutes</span>
              </span>
            )}
          </div>
        </label>

        {/* Pages */}
        <div className="adm-field" style={{ marginTop: 12 }}>
          <span>Which pages</span>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <label className="adm-check" style={{ margin: 0 }}>
              <input type="radio" name="autoshare-pages" checked={allPages} onChange={() => setAllPages(true)} disabled={pending} />
              <span>All connected pages</span>
            </label>
            <label className="adm-check" style={{ margin: 0 }}>
              <input type="radio" name="autoshare-pages" checked={!allPages} onChange={() => setAllPages(false)} disabled={pending || pages.length === 0} />
              <span>Choose pages</span>
            </label>
          </div>
          {!allPages && (
            <div className="adm-fb-checkgroups" style={{ marginTop: 8 }}>
              <fieldset className="adm-fb-checkgroup">
                {pages.map((p) => (
                  <label key={p.id} className="adm-check">
                    <input type="checkbox" checked={pageIds.has(p.id)} onChange={() => togglePage(p.id)} disabled={pending} />
                    <span>
                      {p.pageName}
                      {p.status !== "Connected" && <span className="adm-pill amber" style={{ marginLeft: 6 }}>Expired</span>}
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>
          )}
        </div>

        {/* Caption template */}
        <label className="adm-field" style={{ marginTop: 12 }}>
          <span>Caption template</span>
          <textarea
            className="adm-input"
            rows={4}
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            disabled={pending}
            placeholder={"{title}\n\n{hook}\n\nRead more on {site}:\n{link}"}
          />
          <span className="adm-field-hint">
            Tokens: <code className="adm-fb-code">{"{title}"}</code> <code className="adm-fb-code">{"{hook}"}</code> <code className="adm-fb-code">{"{link}"}</code> <code className="adm-fb-code">{"{site}"}</code>. The link preview is also attached automatically.
          </span>
        </label>
      </div>

      {/* Honest notes */}
      <div className="adm-trend-note" role="note" style={{ marginTop: 14 }}>
        <p style={{ margin: 0 }}>
          <strong>Heads up:</strong> auto-share uses the same server cron as scheduling. On <strong>Vercel Hobby the cron runs once per day</strong>, so the per-page delay won’t space posts by minutes — they all go out in the next daily run. True {delay}-minute spacing needs <strong>Vercel Pro</strong> (cron <code className="adm-fb-code">*/5 * * * *</code>).{" "}
          {targetCount <= 1 && <>With one page the delay has no effect. </>}
          Expired tokens make those posts fail (with a reason) in <strong>Scheduled posts</strong> above — reconnect to fix. Queued posts appear there and can be canceled. Facebook’s Meta Business Suite Planner is a free native alternative.
        </p>
      </div>

      <div className="adm-settings-actions" style={{ marginTop: 14 }}>
        <button type="button" className="adm-btn-primary" onClick={save} disabled={pending}>
          {pending ? <span className="adm-spinner" aria-hidden /> : <CheckIcon className="h-4 w-4" />}
          Save settings
        </button>
        {enabled && (
          <span className="adm-fb-sub" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <RefreshIcon className="h-3.5 w-3.5" /> New articles → {targetCount} page{targetCount === 1 ? "" : "s"}, every {delay} min
          </span>
        )}
      </div>
    </div>
  );
}
