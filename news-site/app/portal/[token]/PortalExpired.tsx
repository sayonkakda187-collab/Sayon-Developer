import { LinkIcon } from "@/components/admin/icons";

/**
 * Shown when a portal token is unknown, regenerated (old link), or disabled. A clean
 * dead-end — NEVER a login form (there are no portal passwords). The reused admin
 * styling is themed via the portal layout's pre-paint script.
 */
export function PortalExpired() {
  return (
    <div
      className="admin-shell adm-stage adm-portal"
      data-section="page-control"
      style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, minHeight: "100dvh" }}
    >
      <div className="adm-portal-expired adm-rise">
        <span className="adm-portal-expired-ic" aria-hidden>
          <LinkIcon className="h-7 w-7" />
        </span>
        <h1>This link isn’t active</h1>
        <p>
          This portal link has expired or been turned off. Please ask your administrator for an up-to-date link.
        </p>
        <div className="adm-portal-expired-brand">The Daily Ledger · Page Control</div>
      </div>
    </div>
  );
}
