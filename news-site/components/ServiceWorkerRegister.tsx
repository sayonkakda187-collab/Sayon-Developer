"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Registers the admin service worker AND keeps the installed PWA up to date.
 *
 * The old version registered once and never checked for updates, so an installed
 * PWA stayed frozen on the build it was installed with. This:
 *  - registers `/sw.js`,
 *  - proactively checks for a new version on focus + hourly,
 *  - detects a newly-installed (waiting) worker, and
 *  - shows a small "A new version is available — Reload" prompt. Tapping it
 *    activates the new SW and reloads into the fresh build (never auto-reloads,
 *    so it won't interrupt an in-progress edit).
 */
export function ServiceWorkerRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;
    let interval: ReturnType<typeof setInterval> | undefined;

    // Only prompt for a genuine UPDATE (a controller already exists) — never on
    // the very first install (that build is already the fresh one).
    const promote = (sw: ServiceWorker | null | undefined) => {
      if (sw && navigator.serviceWorker.controller) setWaiting(sw);
    };

    const watchInstalling = (r: ServiceWorkerRegistration) => {
      const installing = r.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") promote(r.waiting || installing);
      });
    };

    const register = async () => {
      try {
        reg = await navigator.serviceWorker.register("/sw.js");
        if (reg.waiting) promote(reg.waiting); // downloaded while the app was closed
        reg.addEventListener("updatefound", () => reg && watchInstalling(reg));
        interval = setInterval(() => reg?.update().catch(() => {}), 60 * 60 * 1000);
      } catch {
        /* registration is best-effort */
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") reg?.update().catch(() => {});
    };

    const start = () => void register();
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.removeEventListener("load", start);
      document.removeEventListener("visibilitychange", onVisible);
      if (interval) clearInterval(interval);
    };
  }, []);

  const reload = useCallback(() => {
    const sw = waiting;
    if (!sw) return;
    // Reload once the new SW takes control; safety-net timeout in case it doesn't.
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), {
      once: true,
    });
    sw.postMessage("SKIP_WAITING");
    setTimeout(() => window.location.reload(), 2500);
  }, [waiting]);

  if (!waiting) return null;

  return (
    <div className="adm-pwa-update" role="status" aria-live="polite">
      <span className="adm-pwa-update-txt">A new version of the admin is available.</span>
      <button type="button" className="adm-pwa-update-btn" onClick={reload}>
        Reload
      </button>
    </div>
  );
}
