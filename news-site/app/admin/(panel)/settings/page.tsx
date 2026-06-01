import { ToastProvider } from "@/components/admin/Toast";
import { NewsApiSettings } from "@/components/admin/NewsApiSettings";
import { getActiveProvider, getProviderStatuses } from "@/lib/newsSearch/settings";

// Live, env/DB-dependent; never statically cache.
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  // Statuses report whether each provider's key is set (via DB or env) — WITHOUT
  // ever returning the key value to the client.
  const [statuses, activeProvider] = await Promise.all([getProviderStatuses(), getActiveProvider()]);

  return (
    <div>
      <div className="adm-page-h">
        <h1>API Settings</h1>
        <p>Manage the news-search provider and API keys. Keys are encrypted and stay server-side.</p>
      </div>
      <ToastProvider>
        <NewsApiSettings
          statuses={statuses.map((s) => ({
            id: s.id,
            label: s.label,
            site: s.site,
            envVar: s.envVar,
            paidNote: s.paidNote,
            source: s.source,
            configured: s.configured,
          }))}
          activeProvider={activeProvider}
        />
      </ToastProvider>
    </div>
  );
}
