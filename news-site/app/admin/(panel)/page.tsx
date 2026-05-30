import { getDashboardData } from "@/lib/queries";
import { DashboardCharts } from "@/components/admin/DashboardCharts";

// Server wrapper: fetch the all-time baseline once, then hand it to the client
// dashboard, which scales the view metrics by the date range for an instant,
// continuous slider feel.
export default async function DashboardPage() {
  const d = await getDashboardData();

  return (
    <DashboardCharts
      totalArticles={d.totalArticles}
      publishedArticles={d.publishedArticles}
      draftArticles={d.draftArticles}
      totalComments={d.totalComments}
      pendingComments={d.pendingComments}
      subscriberCount={d.subscriberCount}
      totalViews={d.totalViews}
      cats={d.cats.map((c) => ({ id: c.id, name: c.name, count: c._count.articles }))}
      articles={d.publishedList.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        views: a.views,
        category: a.category ? { name: a.category.name } : null,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
