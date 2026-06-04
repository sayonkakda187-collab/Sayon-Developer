import { getDashboardData } from "@/lib/queries";
import { DashboardCharts } from "@/components/admin/DashboardCharts";

export const dynamic = "force-dynamic";

// Server wrapper: fetch the all-time baseline + real 30-day views series once,
// then hand it to the client dashboard.
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
      viewsSeries={d.viewsSeries}
      recentComments={d.recentComments.map((c) => ({
        id: c.id,
        authorName: c.authorName,
        approved: c.approved,
        createdAt: c.createdAt.toISOString(),
        articleTitle: c.article?.title ?? "(deleted article)",
        articleId: c.article?.id ?? null,
      }))}
      articles={d.publishedList.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        views: a.views,
        coverImage: a.coverImage,
        category: a.category ? { name: a.category.name } : null,
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
      }))}
    />
  );
}
