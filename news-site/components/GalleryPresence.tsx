"use client";

import { useEffect } from "react";

/**
 * Sends a lightweight presence heartbeat while a /g/<token> gallery page is open,
 * so the admin can see live viewer counts. A random per-session visitorId (kept in
 * sessionStorage) lets the server de-duplicate one person across heartbeats. Pings
 * on mount, every 15s, and when the tab becomes visible again. Renders nothing.
 */
export function GalleryPresence({ token }: { token: string }) {
  useEffect(() => {
    let id = "";
    try {
      id = sessionStorage.getItem("gpid") || "";
      if (!id) {
        id = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
        sessionStorage.setItem("gpid", id);
      }
    } catch {
      id = `${Math.random().toString(36).slice(2)}`;
    }

    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      fetch(`/api/g/${token}/ping`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId: id }),
        keepalive: true,
      }).catch(() => {});
    };

    ping();
    const iv = window.setInterval(ping, 15000);
    const onVis = () => {
      if (document.visibilityState === "visible") ping();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [token]);

  return null;
}
