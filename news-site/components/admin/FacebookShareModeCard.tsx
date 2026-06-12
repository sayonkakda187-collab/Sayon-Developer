"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveFacebookShareSettingsAction } from "@/app/admin/facebook-actions";
import { type FbShareSettings, type ShareMode, SHARE_MODE_LABEL } from "@/lib/facebookShareTemplates";

const MODES: ShareMode[] = ["link", "photo"];

/**
 * Always-visible "Share mode" card at the very top of Admin → Facebook (above the
 * tab row). Lets you switch the default Link / Photo mode + Save from a phone
 * without reaching the (easily-cut-off) Settings tab. Preserves the caption/comment
 * templates (only the mode changes here); the link jumps to the full templates.
 */
export function FacebookShareModeCard({ initial }: { initial: FbShareSettings }) {
  const { success, error } = useToast();
  const [mode, setMode] = useState<ShareMode>(initial.mode);
  const [saved, setSaved] = useState<ShareMode>(initial.mode);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveFacebookShareSettingsAction({ ...initial, mode });
    setSaving(false);
    if (res.ok) {
      setSaved(mode);
      success("Default share mode saved.");
    } else {
      error(res.error ?? "Couldn’t save.");
    }
  }

  return (
    <div className="adm-card adm-card-pad adm-fb-modecard">
      <div className="adm-card-title">Share mode</div>
      <div className="adm-card-sub" style={{ marginBottom: 10 }}>
        How shares post by default. Override per share in “Share now”.
      </div>

      <div className="adm-fb-modeopts" role="radiogroup" aria-label="Default share mode">
        {MODES.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={`adm-seg-btn ${mode === m ? "on" : ""}`}
            onClick={() => setMode(m)}
          >
            {SHARE_MODE_LABEL[m]}
          </button>
        ))}
      </div>

      {mode === "photo" && (
        <p className="adm-card-sub" style={{ marginTop: 8 }}>
          Photo post + the article link as the first comment. Needs{" "}
          <code className="adm-fb-code">pages_manage_engagement</code> on the Page token.
        </p>
      )}

      <div className="adm-fb-modeacts">
        <button type="button" className="adm-btn-primary" onClick={save} disabled={saving || mode === saved} style={{ minHeight: 44 }}>
          {saving && <span className="adm-spinner" aria-hidden />} {mode === saved ? "Saved" : "Save"}
        </button>
        <a className="adm-link" href="#fb-settings">Edit caption &amp; comment templates →</a>
      </div>
    </div>
  );
}
