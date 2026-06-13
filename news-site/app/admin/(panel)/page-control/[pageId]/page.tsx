import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { PageControlDashboard } from "@/components/admin/PageControlDashboard";
import type { InsightsPageRow } from "@/components/admin/FacebookPageInsights";

// Live monitored-page/token + insights state; never statically cache.
export const dynamic = "force-dynamic";

export default async function PageControlDetailPage({ params }: { params: { pageId: string } }) {
  const page = await prisma.monitoredPage.findUnique({ where: { id: params.pageId } });
  if (!page) notFound();

  const row: InsightsPageRow = {
    id: page.id,
    pageId: page.pageId,
    pageName: page.pageName,
    categoryGroup: "Monitored",
    status: page.status,
    avatarUrl: page.avatarUrl,
    postedCount: 0,
    lastSharedAt: null,
  };

  return <PageControlDashboard page={row} followers={page.followers} />;
}
