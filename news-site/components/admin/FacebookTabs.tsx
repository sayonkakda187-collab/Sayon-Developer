"use client";

import { useEffect, useState, type ReactNode } from "react";

export type FacebookTab = { id: string; label: string; node: ReactNode };

/**
 * Section switcher for the Facebook tab. Shows ONE panel at a time (so you don't
 * scroll past Share to reach Pages) via a segmented bar at the top. All panels
 * stay mounted (hidden, not unmounted) so in-progress state — a half-filled share
 * form, selected pages — survives switching. The active section is mirrored in the
 * URL hash (#fb-pages) so it's refresh-safe and deep-linkable.
 */
export function FacebookTabs({ tabs, defaultId }: { tabs: FacebookTab[]; defaultId?: string }) {
  const [active, setActive] = useState(defaultId ?? tabs[0]?.id ?? "");

  // Adopt a valid section from the URL hash (deep-link / refresh / back-forward).
  useEffect(() => {
    const fromHash = window.location.hash.replace(/^#fb-/, "");
    if (fromHash && tabs.some((t) => t.id === fromHash)) setActive(fromHash);
  }, [tabs]);

  function go(id: string) {
    setActive(id);
    try {
      window.history.replaceState(null, "", `#fb-${id}`);
    } catch {
      /* ignore (e.g. sandboxed history) */
    }
  }

  return (
    <div className="adm-fb-tabs">
      <div className="adm-fb-tabbar">
        <div className="adm-seg" role="tablist" aria-label="Facebook sections">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active === t.id}
              className={`adm-seg-btn ${active === t.id ? "on" : ""}`}
              onClick={() => go(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          aria-label={t.label}
          hidden={active !== t.id}
          style={{ display: active === t.id ? "block" : "none" }}
        >
          {t.node}
        </div>
      ))}
    </div>
  );
}
