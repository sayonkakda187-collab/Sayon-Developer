"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { facebookRefreshPages } from "@/app/admin/facebook-actions";
import { useToast } from "@/components/admin/Toast";
import { ConnectModal } from "./FacebookConnectModal";
import { PlusIcon, RefreshIcon } from "@/components/admin/icons";

/**
 * "Refresh Pages" + "Connect New Page" rendered into the admin top bar (next to
 * the theme toggle), via portals into the `.adm-top-actions-slot` mount points
 * AdminShell exposes. Because only the Facebook page renders this component, the
 * buttons appear only on that tab. Portals keep the React tree position, so toast
 * + router context still work. Labels collapse to icons on the narrow mobile bar.
 */
export function FacebookTopActions({ userTokenSaved }: { userTokenSaved: boolean }) {
  const router = useRouter();
  const { success, error } = useToast();
  const [slots, setSlots] = useState<Element[]>([]);
  const [showConnect, setShowConnect] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Find the top-bar mount points (one per responsive bar) after mount, and
  // re-query when the viewport crosses the desktop/mobile breakpoint.
  useEffect(() => {
    const update = () => setSlots(Array.from(document.querySelectorAll(".adm-top-actions-slot")));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    const res = await facebookRefreshPages();
    setRefreshing(false);
    if (!res.ok) return error(res.error);
    const { refreshed, added } = res.data;
    success(
      added > 0
        ? `Synced ${refreshed + added} Page${refreshed + added === 1 ? "" : "s"} (${added} new).`
        : `Refreshed ${refreshed} Page${refreshed === 1 ? "" : "s"}.`,
    );
    router.refresh();
  }

  const buttons = () => (
    <div className="adm-fb-topactions">
      {userTokenSaved && (
        <button
          type="button"
          className="adm-btn-ghost adm-fb-topbtn"
          onClick={onRefresh}
          disabled={refreshing}
          title="Re-sync Pages from Facebook (refresh tokens + pull in newly-added Pages)"
        >
          <RefreshIcon className={`h-[18px] w-[18px] ${refreshing ? "adm-spinning" : ""}`} />
          <span className="adm-fb-topbtn-label">{refreshing ? "Refreshing…" : "Refresh Pages"}</span>
        </button>
      )}
      <button type="button" className="adm-btn-primary adm-fb-topbtn" onClick={() => setShowConnect(true)} title="Connect a new Facebook Page">
        <PlusIcon className="h-[18px] w-[18px]" />
        <span className="adm-fb-topbtn-label">Connect New Page</span>
      </button>
    </div>
  );

  return (
    <>
      {slots.map((slot, i) => createPortal(buttons(), slot, `fb-top-${i}`))}
      {showConnect && (
        <ConnectModal
          onClose={() => setShowConnect(false)}
          onConnected={() => { setShowConnect(false); success("Page connected."); router.refresh(); }}
          onError={error}
        />
      )}
    </>
  );
}
