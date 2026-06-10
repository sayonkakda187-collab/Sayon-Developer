"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";

type State = "loading" | "unsupported" | "unconfigured" | "blocked" | "subscribed" | "ready";

function urlB64ToUint8(base64: string): Uint8Array {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** "Enable notifications" for this device — requests permission, subscribes via
 *  PushManager (VAPID), and registers the subscription server-side. */
export function PushToggle() {
  const { success, error } = useToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setState("unsupported");
        return;
      }
      try {
        const res = await fetch("/api/admin/agent/push");
        const data = (await res.json().catch(() => ({}))) as { configured?: boolean; publicKey?: string | null };
        if (cancelled) return;
        if (!data.configured || !data.publicKey) {
          setState("unconfigured");
          return;
        }
        setPublicKey(data.publicKey);
        if (Notification.permission === "denied") {
          setState("blocked");
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        setState(existing ? "subscribed" : "ready");
      } catch {
        if (!cancelled) setState("ready");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    if (!publicKey) return;
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "blocked" : "ready");
        if (perm === "denied") error("Notifications are blocked in the browser settings.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8(publicKey) as unknown as BufferSource,
        });
      }
      const res = await fetch("/api/admin/agent/push", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn’t register this device.");
      setState("subscribed");
      success("Notifications enabled — a test alert was sent to this device.");
    } catch (e) {
      error(e instanceof Error ? e.message : "Couldn’t enable notifications.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/admin/agent/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ unsubscribe: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("ready");
      success("Notifications disabled on this device.");
    } catch {
      error("Couldn’t disable notifications.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-card adm-card-pad" style={{ marginBottom: 16 }}>
      <div className="adm-card-title">Notifications</div>
      <div className="adm-card-sub" style={{ marginBottom: 10 }}>
        Get a push when the assistant needs approval (Publish / Share). Enable per device — do this on your phone.
      </div>
      {state === "loading" ? (
        <p className="adm-card-sub"><span className="adm-spinner" aria-hidden /> Checking…</p>
      ) : state === "unsupported" ? (
        <p className="adm-card-sub">This browser doesn’t support web push. On iPhone, <strong>install to Home Screen</strong> first, then open the installed app and try here.</p>
      ) : state === "unconfigured" ? (
        <p className="adm-card-sub">Push isn’t configured — add <code>VAPID_PUBLIC_KEY</code> + <code>VAPID_PRIVATE_KEY</code> in the environment, then redeploy.</p>
      ) : state === "blocked" ? (
        <p className="adm-card-sub">Notifications are blocked in your browser/site settings. Re-allow them there, then reload this page.</p>
      ) : state === "subscribed" ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span className="adm-pill" style={{ color: "#166534", background: "rgba(22,163,74,.16)" }}>✓ Enabled on this device</span>
          <button type="button" className="adm-btn-ghost" onClick={disable} disabled={busy}>
            {busy && <span className="adm-spinner" aria-hidden />} Disable
          </button>
        </div>
      ) : (
        <button type="button" className="adm-btn-primary" onClick={enable} disabled={busy}>
          {busy && <span className="adm-spinner" aria-hidden />} Enable notifications on this device
        </button>
      )}
    </div>
  );
}
