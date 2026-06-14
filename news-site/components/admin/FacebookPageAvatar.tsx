"use client";

import { createContext, useContext, useState } from "react";

const AVATAR_COLORS = ["#1877f2", "#16a34a", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9"];

/**
 * Whether the admin-only picture proxy may be used as an avatar fallback. The Manager
 * Portal wraps its subtree in `<AvatarProxyContext.Provider value={false}>` so portal
 * avatars never call an admin endpoint — they fall straight from the cached CDN url to
 * initials. Defaults to `true` (admin), so nothing else changes.
 */
export const AvatarProxyContext = createContext(true);

/** Deterministic accent colour for a Page's initial fallback (stable per seed). */
export function avatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

/**
 * Shared round Facebook Page avatar — used everywhere Pages are listed (Insights
 * rows + detail header, Results cards, Pages tab, Share-now picker).
 *
 * Source order, all token-safe (the Page token never reaches the browser):
 *  1. `avatarUrl` — the public CDN URL we cached on the Page record (fast path, no
 *     Graph call). FB CDN URLs expire, so on error we fall through to…
 *  2. the admin-only proxy `/api/admin/facebook/{dbId}/picture` which re-resolves
 *     the picture server-side with the Page token and persists the fresh URL (so
 *     the next render uses the fast path again). On error we fall through to…
 *  3. a deterministic coloured circle with the Page's initial — never a broken img.
 *
 * Images are lazy-loaded (lists are long/paginated). `size` is the rendered
 * diameter in px (~32 in rows/lists, ~48 in detail headers / Results cards).
 */
export function FacebookPageAvatar({
  dbId,
  name,
  avatarUrl,
  size = 32,
}: {
  dbId: string;
  name: string;
  avatarUrl?: string | null;
  size?: number;
}) {
  const allowProxy = useContext(AvatarProxyContext);
  const proxy = `/api/admin/facebook/${encodeURIComponent(dbId)}/picture?size=${size * 2}`;
  // 0 = stored CDN url, 1 = server proxy, 2 = initials only. The Manager Portal disables
  // the proxy step (admin-only), so it goes straight from the CDN url to initials.
  const [step, setStep] = useState<0 | 1 | 2>(avatarUrl ? 0 : allowProxy ? 1 : 2);
  const src = step === 0 ? avatarUrl ?? (allowProxy ? proxy : null) : step === 1 ? proxy : null;
  const initial = (name.trim()[0] ?? "?").toUpperCase();

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
        background: avatarColor(dbId || name),
        display: "inline-block",
      }}
    >
      <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff", fontWeight: 700, fontSize: Math.round(size * 0.42) }}>
        {initial}
      </span>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setStep((s) => (s === 0 ? (allowProxy ? 1 : 2) : 2))}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </span>
  );
}
