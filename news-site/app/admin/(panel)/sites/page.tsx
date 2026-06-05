import { ToastProvider } from "@/components/admin/Toast";
import { SitesManager } from "@/components/admin/SitesManager";
import { listSites } from "@/lib/sites";

export const dynamic = "force-dynamic";

export default async function AdminSitesPage() {
  const sites = await listSites();
  return (
    <div>
      <div className="adm-page-h">
        <h1>Sites</h1>
        <p>Manage the news sites this dashboard publishes. Your current site is the default; add more here for the future.</p>
      </div>
      <ToastProvider>
        <SitesManager sites={sites} />
      </ToastProvider>
    </div>
  );
}
