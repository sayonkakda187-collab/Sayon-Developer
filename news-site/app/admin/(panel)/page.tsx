import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/site";

export default async function DashboardPage() {
  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    viewsAgg,
    totalComments,
    pendingComments,
    categoryCount,
    subscriberCount,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({ where: { status: "draft" } }),
    prisma.article.aggregate({ _sum: { views: true } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { approved: false } }),
    prisma.category.count(),
    prisma.newsletter.count(),
  ]);

  const totalViews = viewsAgg._sum.views ?? 0;

  const stats = [
    { label: "Articles", value: totalArticles, hint: `${publishedArticles} published · ${draftArticles} draft` },
    { label: "Total views", value: totalViews },
    { label: "Comments", value: totalComments, hint: `${pendingComments} pending` },
    { label: "Categories", value: categoryCount },
    { label: "Subscribers", value: subscriberCount },
  ];

  return (
    <div>
      <h1 className="font-serif text-2xl font-bold">Dashboard</h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-gray-200 bg-white p-4"
          >
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {s.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {formatNumber(s.value)}
            </dd>
            {s.hint && <p className="mt-1 text-xs text-gray-400">{s.hint}</p>}
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/admin/articles/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          + New article
        </Link>
        <Link
          href="/admin/articles"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Manage articles
        </Link>
        <Link
          href="/admin/categories"
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Categories &amp; tags
        </Link>
      </div>
    </div>
  );
}
