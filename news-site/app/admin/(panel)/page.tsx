import Link from "next/link";
import { FileText, Eye, MessageSquare, Mail, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatNumber, formatDate } from "@/lib/site";
import { StatusPill } from "@/components/admin/StatusPill";

export default async function DashboardPage() {
  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    viewsAgg,
    totalComments,
    pendingComments,
    subscriberCount,
    recent,
    topByViews,
    cats,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: { status: "published" } }),
    prisma.article.count({ where: { status: "draft" } }),
    prisma.article.aggregate({ _sum: { views: true } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { approved: false } }),
    prisma.newsletter.count(),
    prisma.article.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { category: true },
    }),
    prisma.article.findMany({
      where: { status: "published" },
      orderBy: { views: "desc" },
      take: 5,
      select: { id: true, title: true, views: true },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    }),
  ]);

  const totalViews = viewsAgg._sum.views ?? 0;
  const maxViews = Math.max(1, ...topByViews.map((a) => a.views));
  const maxCat = Math.max(1, ...cats.map((c) => c._count.articles));

  const stats = [
    { label: "Total Articles", value: totalArticles, sub: `${publishedArticles} published · ${draftArticles} draft`, icon: FileText },
    { label: "Total Views", value: totalViews, sub: "across all articles", icon: Eye },
    { label: "Total Comments", value: totalComments, sub: `${pendingComments} pending`, icon: MessageSquare },
    { label: "Subscribers", value: subscriberCount, sub: "newsletter signups", icon: Mail },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back 👋</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Here&apos;s what&apos;s happening with The Daily Ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-fg-muted">
            Last 30 days
          </span>
          <Link
            href="/admin/articles/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            New Article
          </Link>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, sub, icon: Icon }) => (
          <div key={label} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-fg-muted">{label}</span>
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <Icon className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold tabular-nums">
              {formatNumber(value)}
            </div>
            <div className="mt-1 text-xs text-fg-faint">{sub}</div>
          </div>
        ))}
      </div>

      {/* Two-column panels */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h2 className="font-semibold">Top articles by views</h2>
          <div className="mt-4 space-y-3.5">
            {topByViews.length === 0 && (
              <p className="text-sm text-fg-faint">No published articles yet.</p>
            )}
            {topByViews.map((a) => (
              <div key={a.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{a.title}</span>
                  <span className="shrink-0 tabular-nums text-fg-faint">
                    {formatNumber(a.views)}
                  </span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((a.views / maxViews) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Top categories</h2>
          <div className="mt-4 space-y-3.5">
            {cats.map((c) => (
              <div key={c.id}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-fg-faint">{c._count.articles}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.round((c._count.articles / maxCat) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent articles */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="font-semibold">Recent articles</h2>
          <Link
            href="/admin/articles"
            className="text-sm font-medium text-accent-link hover:underline"
          >
            View all
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="px-5 py-3 font-medium">Title</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 text-right font-medium">Views</th>
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recent.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent/10 text-xs font-bold uppercase text-accent">
                        {a.title.slice(0, 1)}
                      </span>
                      <span className="line-clamp-1 font-medium text-fg">
                        {a.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <StatusPill status={a.status} />
                  </td>
                  <td className="px-5 py-3 text-fg-muted">
                    {a.category?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-fg-muted">
                    {formatNumber(a.views)}
                  </td>
                  <td className="px-5 py-3 text-fg-faint">
                    {formatDate(a.publishedAt ?? a.createdAt)}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        href={`/admin/articles/${a.id}/edit`}
                        className="font-medium text-accent-link hover:underline"
                      >
                        Edit
                      </Link>
                      {a.status === "published" && (
                        <Link
                          href={`/news/${a.slug}`}
                          target="_blank"
                          className="text-fg-faint transition-colors hover:text-fg"
                        >
                          View
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
