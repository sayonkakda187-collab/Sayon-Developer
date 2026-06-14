"use client";

import { useEffect, useState } from "react";
import { avatarColor } from "@/components/admin/FacebookPageAvatar";

/** A page manager / team member — LOCAL app data (a name + optional uploaded photo).
 *  `linkCode` / `linked` are populated on the Managers tab (earnings-bot link state). */
export type Manager = { id: string; name: string; photo: string | null; linkCode?: string; linked?: boolean; portalSet?: boolean; portalEnabled?: boolean };

/**
 * Small round avatar for a page manager (team member). Mirrors FacebookPageAvatar's
 * fallback pattern, but for LOCAL manager records (never a Facebook token):
 *  • an uploaded `photo` URL (from /api/admin/upload — Blob in prod / /uploads locally)
 *    when present, falling back on load error to…
 *  • a deterministic coloured circle with the manager's initial.
 * Never renders a broken <img>. `size` is the diameter in px (~22 on list rows,
 * ~26 in pickers, ~38 in the managers screen).
 */
export function ManagerAvatar({ name, photo, size = 26 }: { name: string; photo?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  // Reset the error state if the photo changes (e.g. after an edit/replace).
  useEffect(() => setBroken(false), [photo]);
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  const showPhoto = !!photo && !broken;

  return (
    <span
      aria-hidden
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        borderRadius: 999,
        overflow: "hidden",
        background: avatarColor(name || "?"),
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: Math.round(size * 0.44) }}>
        {initial}
      </span>
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo!}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setBroken(true)}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}
