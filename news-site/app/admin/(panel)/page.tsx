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

  const primaryBtn =
    "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90";
  const secondaryBtn =
    "rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface-2";

  return (
    <div>
      <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
        Dashboard
      </h1>

      <dl className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-surface p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-fg-faint">
              {s.label}
            </dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums text-fg">
              {formatNumber(s.value)}
            </dd>
            {s.hint && <p className="mt-1 text-xs text-fg-faint">{s.hint}</p>}
          </div>
        ))}
      </dl>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/admin/articles/new" className={primaryBtn}>
          + New article
        </Link>
        <Link href="/admin/articles" className={secondaryBtn}>
          Manage articles
        </Link>
        <Link href="/admin/comments" className={secondaryBtn}>
          Moderate comments
        </Link>
        <Link href="/admin/categories" className={secondaryBtn}>
          Categories &amp; tags
        </Link>
      </div>
    </div>
  );
}
