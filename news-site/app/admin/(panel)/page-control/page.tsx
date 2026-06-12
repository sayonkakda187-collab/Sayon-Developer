import { prisma } from "@/lib/db";
import { PageControlList } from "@/components/admin/PageControlList";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

// Live Page/token state; never statically cache.
export const dynamic = "force-dynamic";

export default async function PageControlPage() {
  // Count posted shares per Page in SQL (groupBy), so this stays O(pages) as post
  // history grows — same approach as the Facebook tab.
  const [pages, counts] = await Promise.all([
    prisma.facebookPage.findMany({ orderBy: [{ categoryGroup: "asc" }, { pageName: "asc" }] }),
    prisma.scheduledPost.groupBy({ by: ["facebookPageId"], where: { status: "posted" }, _count: { _all: true } }),
  ]);

  const postedByPage = new Map<string, number>();
  for (const c of counts) postedByPage.set(c.facebookPageId, c._count._all);

  const rows: InsightsPageRow[] = pages.map((p) => ({
    id: p.id,
    pageId: p.pageId,
    pageName: p.pageName,
    categoryGroup: p.categoryGroup,
    status: p.status,
    avatarUrl: p.avatarUrl,
    postedCount: postedByPage.get(p.id) ?? 0,
    lastSharedAt: null,
  }));

  return (
    <div>
      <div className="adm-page-h">
        <h1>Page Control</h1>
        <p>A per-Page dashboard — pick a Page to see its Summary, real published Content, and Analytics.</p>
      </div>
      <PageControlList pages={rows} />
    </div>
  );
}
