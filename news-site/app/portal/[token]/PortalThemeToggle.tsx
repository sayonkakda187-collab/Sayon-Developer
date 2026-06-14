"use client";

import { useEffect, useState } from "react";

type Mode = "light" | "dark";

/**
 * Light/dark toggle for the Manager Portal. Mirrors the admin toggle but persists to an
 * INDEPENDENT localStorage('portal-theme') key (the portal layout's pre-paint script
 * applies it on first load, so there's no flash). Touches neither the admin theme nor
 * the public site theme. Falls back to the device setting until the manager picks.
 */
export function PortalThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-adm-theme") as Mode | null) ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    setMode(current);
  }, []);

  function toggle() {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.setAttribute("data-adm-theme", next);
    try {
      localStorage.setItem("portal-theme", next);
    } catch {
      /* private mode / storage disabled — toggle still works for the session */
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "dark" ? "#0b1220" : "#101b2d");
  }

  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggle}
      className="adm-iconbtn"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Light mode" : "Dark mode"}
    >
      {mode === null ? (
        <span className="h-5 w-5" />
      ) : isDark ? (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      )}
    </button>
  );
}
