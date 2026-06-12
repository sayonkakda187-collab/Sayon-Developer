"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveFacebookShareSettingsAction } from "@/app/admin/facebook-actions";
import {
  type FbShareSettings,
  type ShareMode,
  SHARE_MODE_LABEL,
  DEFAULT_PHOTO_CAPTION,
  DEFAULT_PHOTO_COMMENT,
} from "@/lib/facebookShareTemplates";

const MODES: ShareMode[] = ["link", "photo"];

/** Global Facebook share settings: default mode + photo caption/comment templates. */
export function FacebookShareSettings({ initial }: { initial: FbShareSettings }) {
  const { success, error } = useToast();
  const [s, setS] = useState<FbShareSettings>(initial);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const res = await saveFacebookShareSettingsAction(s);
    setSaving(false);
    if (res.ok) success("Share settings saved.");
    else error(res.error ?? "Couldn’t save.");
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-card-title">Default share mode</div>
      <div className="adm-card-sub" style={{ marginBottom: 10 }}>
        How shares post by default — you can override it per share in “Share now”. Applies to auto-share
        on publish, scheduled shares, agent shares, and Re-share.
      </div>
      <div role="radiogroup" aria-label="Default share mode" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {MODES.map((m) => (
          <label key={m} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "var(--adm-ink)" }}>
            <input type="radio" name="fb-share-mode" checked={s.mode === m} onChange={() => setS((p) => ({ ...p, mode: m }))} />
            {SHARE_MODE_LABEL[m]}
          </label>
        ))}
      </div>
      {s.mode === "photo" && (
        <p className="adm-card-sub" style={{ marginTop: 8 }}>
          Posts the featured image as a native <strong>photo post</strong> with the caption below, then adds
          the article link as the <strong>first comment</strong> from the Page. Articles with no featured
          image use the branded card. ⚠️ Commenting as the Page needs the{" "}
          <code className="adm-fb-code">pages_manage_engagement</code> permission on the Page token.
        </p>
      )}

      <div className="adm-card-title" style={{ marginTop: 18 }}>Photo caption template</div>
      <div className="adm-card-sub" style={{ marginBottom: 6 }}>
        Tokens: <code className="adm-fb-code">{"{headline}"}</code> <code className="adm-fb-code">{"{excerpt}"}</code>{" "}
        <code className="adm-fb-code">{"{credit}"}</code> <code className="adm-fb-code">{"{url}"}</code>
      </div>
      <textarea
        className="adm-input"
        rows={7}
        value={s.captionTemplate}
        onChange={(e) => setS((p) => ({ ...p, captionTemplate: e.target.value }))}
      />
      <button type="button" className="adm-link" style={{ marginTop: 4 }} onClick={() => setS((p) => ({ ...p, captionTemplate: DEFAULT_PHOTO_CAPTION }))}>
        Reset caption to default
      </button>

      <div className="adm-card-title" style={{ marginTop: 18 }}>Link comment template</div>
      <div className="adm-card-sub" style={{ marginBottom: 6 }}>
        Token: <code className="adm-fb-code">{"{url}"}</code>
      </div>
      <input
        className="adm-input"
        value={s.commentTemplate}
        onChange={(e) => setS((p) => ({ ...p, commentTemplate: e.target.value }))}
      />
      <button type="button" className="adm-link" style={{ marginTop: 4 }} onClick={() => setS((p) => ({ ...p, commentTemplate: DEFAULT_PHOTO_COMMENT }))}>
        Reset comment to default
      </button>

      <div style={{ marginTop: 18 }}>
        <button type="button" className="adm-btn-primary" onClick={save} disabled={saving} style={{ minHeight: 44 }}>
          {saving && <span className="adm-spinner" aria-hidden />} Save share settings
        </button>
      </div>
    </div>
  );
}
