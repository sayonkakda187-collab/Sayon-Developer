import { ToastProvider } from "@/components/admin/Toast";
import { NewsApiSettings } from "@/components/admin/NewsApiSettings";
import { AdskeeperSettings } from "@/components/admin/AdskeeperSettings";
import { SettingsProfile } from "@/components/admin/SettingsProfile";
import { SettingsAiModel } from "@/components/admin/SettingsAiModel";
import { SettingsBreakingBanner, SettingsAdSlots } from "@/components/admin/SettingsSiteExtras";
import { getActiveProvider, getProviderStatuses } from "@/lib/newsSearch/settings";
import { getAdskeeperStatus } from "@/lib/adskeeper/settings";
import { getSessionUser } from "@/lib/auth";
import { getDefaultAiModel } from "@/lib/aiSettings";
import { getBreaking } from "@/lib/breaking";
import { adsenseEnabled } from "@/lib/adsense";

// Live, env/DB-dependent; never statically cache.
export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const [statuses, activeProvider, user, defaultModel, adskeeperStatus, breaking, adsOn] =
    await Promise.all([
      getProviderStatuses(),
      getActiveProvider(),
      getSessionUser(),
      getDefaultAiModel(),
      getAdskeeperStatus(),
      getBreaking(),
      adsenseEnabled(),
    ]);

  const email = user?.email ?? "";
  const initials = email.replace(/@.*/, "").slice(0, 2).toUpperCase() || "AD";

  return (
    <div>
      <div className="adm-page-h">
        <h1>Settings</h1>
        <p>Your profile, the AI Assistant default, and the news-search & AdsKeeper API keys.</p>
      </div>
      <ToastProvider>
        <div className="adm-settings-stack">
          <SettingsProfile avatarUrl={user?.avatarUrl ?? null} initials={initials} />
          <SettingsBreakingBanner initial={breaking} />
          <SettingsAdSlots initialEnabled={adsOn} />
          <SettingsAiModel defaultModel={defaultModel} />
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
          <AdskeeperSettings status={adskeeperStatus} />
        </div>
      </ToastProvider>
    </div>
  );
}
