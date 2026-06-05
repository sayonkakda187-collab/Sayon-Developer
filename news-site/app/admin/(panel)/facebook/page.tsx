import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/admin/Toast";
import { FacebookShareFlow } from "@/components/admin/FacebookShareFlow";
import {
  FacebookPagesManager,
  type FacebookPageView,
} from "@/components/admin/FacebookPagesManager";
import {
  FacebookSessionsManager,
  type FacebookSessionView,
} from "@/components/admin/FacebookSessionsManager";
import { isRunnerConfigured } from "@/lib/fbRunner";
import { getFacebookConnectStatus } from "@/lib/facebookSettings";

// Tokens + Graph state are dynamic; never statically cache this screen.
export const dynamic = "force-dynamic";

export default async function AdminFacebookPage() {
  // Count posted/pending per page in SQL (groupBy) rather than loading every
  // ScheduledPost row into memory just to count it — keeps this O(pages), not
  // O(all posts ever), as post history grows.
  const [pages, counts, sessions, connect] = await Promise.all([
    prisma.facebookPage.findMany({
      orderBy: [{ categoryGroup: "asc" }, { pageName: "asc" }],
    }),
    prisma.scheduledPost.groupBy({
      by: ["facebookPageId", "status"],
      where: { status: { in: ["posted", "pending"] } },
      _count: { _all: true },
    }),
    prisma.facebookSession.findMany({ orderBy: { createdAt: "desc" } }),
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

  // Never expose the encrypted session blob to the client — only safe metadata.
  const sessionView: FacebookSessionView[] = sessions.map((s) => ({
    id: s.id,
    label: s.label,
    accountName: s.accountName,
    status: s.status,
    lastUsedAt: s.lastUsedAt ? s.lastUsedAt.toISOString() : null,
    lastValidatedAt: s.lastValidatedAt ? s.lastValidatedAt.toISOString() : null,
    createdAt: s.createdAt.toISOString(),
  }));

  return (
    <ToastProvider>
      <FacebookShareFlow pages={view} connect={connect} />
      <FacebookPagesManager pages={view} connect={connect} />
      <FacebookSessionsManager sessions={sessionView} runnerConfigured={isRunnerConfigured()} />
    </ToastProvider>
  );
}
