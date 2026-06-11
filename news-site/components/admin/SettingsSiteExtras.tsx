"use client";

import { useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { saveBreakingBanner, setAdSlotsEnabled } from "@/app/admin/settings-actions";

/** Breaking-news banner control: ON/OFF, text, and an optional link. Stored in
 *  AppSetting; the public banner picks it up within ~60s. */
export function SettingsBreakingBanner({
  initial,
}: {
  initial: { enabled: boolean; text: string; link: string };
}) {
  const { success, error } = useToast();
  const [enabled, setEnabled] = useState(initial.enabled);
  const [text, setText] = useState(initial.text);
  const [link, setLink] = useState(initial.link);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await saveBreakingBanner({ enabled, text, link });
    setBusy(false);
    if (!res.ok) return error(res.error);
    success(enabled ? "Breaking banner is live." : "Breaking banner saved.");
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-card-title">Breaking news banner</div>
      <p className="adm-card-sub" style={{ marginTop: 4 }}>
        A slim red alert bar shown site-wide above the header. Readers can dismiss it for their
        session. Updates on the site within about a minute.
      </p>

      <label className="adm-switch-row" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <span>Show the banner</span>
      </label>

      <div style={{ marginTop: 12 }}>
        <label className="block text-sm font-medium text-fg-muted">Banner text</label>
        <input
          className="adm-input mt-1"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Live: Polls have closed — results coming in"
        />
      </div>

      <div style={{ marginTop: 12 }}>
        <label className="block text-sm font-medium text-fg-muted">Link (optional)</label>
        <input
          className="adm-input mt-1"
          value={link}
          maxLength={500}
          onChange={(e) => setLink(e.target.value)}
          placeholder="/news/your-live-story  or  https://…"
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <button type="button" className="adm-btn-primary" onClick={save} disabled={busy} style={{ minHeight: 44 }}>
          {busy && <span className="adm-spinner" aria-hidden />}
          {busy ? "Saving…" : "Save banner"}
        </button>
      </div>
    </div>
  );
}

/** Toggle the reserved AdSense slot layout (separate from AdsKeeper). Off by
 *  default; when on, slots reserve space (no real ad code until approval). */
export function SettingsAdSlots({ initialEnabled }: { initialEnabled: boolean }) {
  const { success, error } = useToast();
  const [on, setOn] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    if (busy) return;
    setOn(next); // optimistic
    setBusy(true);
    const res = await setAdSlotsEnabled(next);
    setBusy(false);
    if (!res.ok) {
      setOn(!next);
      return error(res.error);
    }
    success(next ? "Ad slots enabled (reserved placements)." : "Ad slots disabled.");
  }

  return (
    <div className="adm-card adm-card-pad">
      <div className="adm-card-title">Ad slots (Google AdSense)</div>
      <p className="adm-card-sub" style={{ marginTop: 4 }}>
        Reserved AdSense placements (in-article, end of article, homepage). This is layout prep —
        no real ad code runs until your AdSense account is approved. Your AdsKeeper ads are
        unaffected. Off by default; when on, slots reserve space to avoid layout shift.
      </p>

      <label className="adm-switch-row" style={{ marginTop: 14 }}>
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} />
        <span>{on ? "Reserved ad slots are ON" : "Reserved ad slots are OFF"}</span>
      </label>
    </div>
  );
}
