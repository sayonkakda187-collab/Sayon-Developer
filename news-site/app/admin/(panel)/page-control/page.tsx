import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/admin/Toast";
import { type MonitoredRow } from "@/components/admin/PageControlList";
import { PageControlTabs } from "@/components/admin/PageControlTabs";
import type { Manager } from "@/components/admin/ManagerAvatar";
import { getPageControlConnectStatus } from "@/lib/pageControlSettings";

// Live monitored-page/token state; never statically cache.
export const dynamic = "force-dynamic";

export default async function PageControlPage() {
  const [pages, managerRecords, connect] = await Promise.all([
    prisma.monitoredPage.findMany({ orderBy: { pageName: "asc" } }),
    prisma.pageManager.findMany({ orderBy: { name: "asc" } }),
    getPageControlConnectStatus(),
  ]);

  const rows: MonitoredRow[] = pages.map((p) => ({
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    categoryGroup: "Monitored",
    status: p.status,
    avatarUrl: p.avatarUrl,
    postedCount: 0,
    lastSharedAt: null,
    followers: p.followers,
    managerId: p.managerId,
  }));

  const managers: Manager[] = managerRecords.map((m) => ({ id: m.id, name: m.name, photo: m.photo }));

  return (
    <div>
      <div className="adm-page-h">
        <h1>Page Control</h1>
        <p>An independent, watch-only dashboard. Connect Pages here (separate from the Facebook posting tab) to track each one’s Summary, Content, and Analytics.</p>
      </div>
      <ToastProvider>
        <PageControlTabs pages={rows} appConfigured={connect.appConfigured} managers={managers} />
      </ToastProvider>
    </div>
  );
}
