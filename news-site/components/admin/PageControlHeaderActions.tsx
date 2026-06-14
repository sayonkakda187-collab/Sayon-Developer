"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/Toast";
import { RefreshIcon, TrashIcon } from "@/components/admin/icons";
import { pageControlReconnectPage, removeMonitoredPage } from "@/app/admin/page-control-actions";

/**
 * Admin-only Reconnect / Remove actions for a monitored page's detail header. Pulled
 * into its own module so the Manager Portal (which reuses the dashboard read-only) can
 * dynamically NOT load it — keeping these admin server actions out of the portal bundle.
 * Must render inside a ToastProvider.
 */
export function HeaderActions({ id, status }: { id: string; status: string }) {
  const { success, error } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState<null | "reconnect" | "remove">(null);

  async function onReconnect() {
    setBusy("reconnect");
    const res = await pageControlReconnectPage(id);
    setBusy(null);
    if (res.ok) {
      success("Reconnected — token refreshed.");
      router.refresh();
    } else {
      error(res.error);
    }
  }
  async function onRemove() {
    if (!window.confirm("Stop monitoring this page? This only affects Page Control — the posting farm is untouched.")) return;
    setBusy("remove");
    const res = await removeMonitoredPage(id);
    if (res.ok) router.push("/admin/page-control");
    else {
      setBusy(null);
      error(res.error);
    }
  }

  return (
    <>
      <button type="button" className="adm-btn-ghost" onClick={onReconnect} disabled={busy !== null} title="Refresh this page's token">
        {busy === "reconnect" ? <span className="adm-spinner" aria-hidden /> : <RefreshIcon className="h-4 w-4" />}
        {status === "Connected" ? "Refresh token" : "Reconnect"}
      </button>
      <button type="button" className="adm-btn-ghost" onClick={onRemove} disabled={busy !== null} title="Stop monitoring this page">
        {busy === "remove" ? <span className="adm-spinner" aria-hidden /> : <TrashIcon className="h-4 w-4" />}
        Remove
      </button>
    </>
  );
}
