import { prisma } from "@/lib/db";
import { ToastProvider } from "@/components/admin/Toast";
import { FacebookShareFlow } from "@/components/admin/FacebookShareFlow";
import { FacebookStats } from "@/components/admin/FacebookStats";
import { FacebookTopActions } from "@/components/admin/FacebookTopActions";
import {
  FacebookPagesManager,
  type FacebookPageView,
} from "@/components/admin/FacebookPagesManager";
import {
  FacebookScheduledPosts,
  type ScheduledPostView,
} from "@/components/admin/FacebookScheduledPosts";
import { getFacebookConnectStatus } from "@/lib/facebookSettings";

// Tokens + Graph state are dynamic; never statically cache this screen.
export const dynamic = "force-dynamic";

export default async function AdminFacebookPage() {
  // Count posted/pending per page in SQL (groupBy) rather than loading every
  // ScheduledPost row into memory just to count it — keeps this O(pages), not
  // O(all posts ever), as post history grows.
  const [pages, counts, scheduled, connect] = await Promise.all([
    prisma.facebookPage.findMany({
      orderBy: [{ categoryGroup: "asc" }, { pageName: "asc" }],
    }),
    prisma.scheduledPost.groupBy({
      by: ["facebookPageId", "status"],
      where: { status: { in: ["posted", "pending"] } },
      _count: { _all: true },
    }),
    prisma.scheduledPost.findMany({
      orderBy: { scheduledFor: "desc" },
      take: 100,
      include: {
        article: { select: { title: true } },
        facebookPage: { select: { pageName: true } },
      },
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

  const scheduledView: ScheduledPostView[] = scheduled.map((s) => ({
    id: s.id,
    articleTitle: s.article.title,
    pageName: s.facebookPage.pageName,
    scheduledFor: s.scheduledFor.toISOString(),
    status: s.status,
    caption: s.caption,
    graphPostId: s.graphPostId,
    error: s.error,
    postedAt: s.postedAt ? s.postedAt.toISOString() : null,
  }));

  return (
    <ToastProvider>
      <FacebookTopActions userTokenSaved={Boolean(connect?.userTokenSaved)} />
      <FacebookStats pages={view} />
      <FacebookShareFlow pages={view} />
      <FacebookScheduledPosts posts={scheduledView} />
      <FacebookPagesManager pages={view} connect={connect} />
    </ToastProvider>
  );
}
