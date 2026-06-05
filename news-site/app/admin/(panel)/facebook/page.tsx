import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/admin/Toast";
import { FacebookShareFlow } from "@/components/admin/FacebookShareFlow";
import {
  FacebookPagesManager,
  type FacebookPageView,
} from "@/components/admin/FacebookPagesManager";
import { getFacebookConnectStatus } from "@/lib/facebookSettings";

// Tokens + Graph state are dynamic; never statically cache this screen.
export const dynamic = "force-dynamic";

export default async function AdminFacebookPage() {
  // Count posted/pending per page in SQL (groupBy) rather than loading every
  // ScheduledPost row into memory just to count it — keeps this O(pages), not
  // O(all posts ever), as post history grows.
  const [pages, counts, connect] = await Promise.all([
    prisma.facebookPage.findMany({
      orderBy: [{ categoryGroup: "asc" }, { pageName: "asc" }],
    }),
    prisma.scheduledPost.groupBy({
      by: ["facebookPageId", "status"],
      where: { status: { in: ["posted", "pending"] } },
      _count: { _all: true },
    }),
    getFacebookConnectStatus(),
  ]);

  const postedByPage = new Map<string, number>();
  const pendingByPage = new Map<string, number>();
  for (const c of counts) {
    const target = c.status === "posted" ? postedByPage : pendingByPage;
    target.set(c.facebookPageId, c._count._all);
  }

  const view: FacebookPageView[] = pages.map((p) => ({
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    categoryGroup: p.categoryGroup,
    status: p.status,
    lastSyncedAt: p.lastSyncedAt ? p.lastSyncedAt.toISOString() : null,
    postedCount: postedByPage.get(p.id) ?? 0,
    pendingCount: pendingByPage.get(p.id) ?? 0,
  }));

  return (
    <ToastProvider>
      <FacebookShareFlow pages={view} connect={connect} />
      <FacebookPagesManager pages={view} connect={connect} />
    </ToastProvider>
  );
}
