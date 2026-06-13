import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/admin/Toast";
import { PageControlList, type MonitoredRow } from "@/components/admin/PageControlList";
import { getPageControlConnectStatus } from "@/lib/pageControlSettings";

// Live monitored-page/token state; never statically cache.
export const dynamic = "force-dynamic";

export default async function PageControlPage() {
  const [pages, connect] = await Promise.all([
    prisma.monitoredPage.findMany({ orderBy: { pageName: "asc" } }),
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
  }));

  return (
    <div>
      <div className="adm-page-h">
        <h1>Page Control</h1>
        <p>An independent, watch-only dashboard. Connect Pages here (separate from the Facebook posting tab) to track each one’s Summary, Content, and Analytics.</p>
      </div>
      <ToastProvider>
        <PageControlList pages={rows} appConfigured={connect.appConfigured} />
      </ToastProvider>
    </div>
  );
}
