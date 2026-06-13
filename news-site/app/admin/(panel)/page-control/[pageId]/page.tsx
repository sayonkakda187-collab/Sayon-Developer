import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageControlDashboard } from "@/components/admin/PageControlDashboard";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

// Live Page/token + insights state; never statically cache.
export const dynamic = "force-dynamic";

/** Followers from the ~12h Page-overview cache (instant, no Graph call). Refreshed
 *  whenever the Insights/Analytics flow runs; null until then. */
function cachedFollowers(data: string | undefined): number | null {
  if (!data) return null;
  try {
    const o = JSON.parse(data) as { followers?: unknown };
    return typeof o.followers === "number" ? o.followers : null;
  } catch {
    return null;
  }
}

export default async function PageControlDetailPage({ params }: { params: { pageId: string } }) {
  const [page, postedCount] = await Promise.all([
    prisma.facebookPage.findUnique({
      where: { id: params.pageId },
      include: { insightCache: true },
    }),
    prisma.scheduledPost.count({ where: { facebookPageId: params.pageId, status: "posted" } }),
  ]);
  if (!page) notFound();

  const row: InsightsPageRow = {
    id: page.id,
    pageId: page.pageId,
    pageName: page.pageName,
    categoryGroup: page.categoryGroup,
    status: page.status,
    avatarUrl: page.avatarUrl,
    postedCount,
    lastSharedAt: null,
  };

  return <PageControlDashboard page={row} followers={cachedFollowers(page.insightCache?.data)} />;
}
