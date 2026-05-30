import Link from "next/link";
import { FileText, Eye, MessageSquare, Mail, Plus, Calendar } from "lucide-react";
import { prisma } from "@/lib/db";
import { formatNumber, formatDate } from "@/lib/site";
import { StatusPill } from "@/components/admin/StatusPill";

const DONUT_COLORS = ["#22c55e", "#a855f7", "#f59e0b", "#3b82f6", "#ef4444", "#14b8a6"];

function Donut({
  segments,
  centerValue,
}: {
  segments: { label: string; value: number; color: string }[];
  centerValue: number;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  let acc = 0;
  return (
    <div className="relative h-40 w-40 shrink-0">
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" strokeWidth="4" />
        {segments.map((s, i) => {
          const pct = (s.value / total) * 100;
          const circle = (
            <circle
              key={i}
              cx="18"
              cy="18"
              r="15.915"
              fill="none"
              stroke={s.color}
              strokeWidth="4"
              pathLength={100}
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={-acc}
            />
          );
          acc += pct;
          return circle;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold tabular-nums">{formatNumber(centerValue)}</span>
        <span className="text-[11px] text-fg-faint">articles</span>
      </div>
    </div>
  );
}

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
      take: 7,
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
  const catTotal = cats.reduce((s, c) => s + c._count.articles, 0);
  const uncategorized = Math.max(0, totalArticles - catTotal);
  const donutSegments = [
    ...cats.map((c, i) => ({
      label: c.name,
      value: c._count.articles,
      color: DONUT_COLORS[i % DONUT_COLORS.length],
    })),
    ...(uncategorized > 0
      ? [{ label: "Uncategorized", value: uncategorized, color: "#9ca3af" }]
      : []),
  ].filter((s) => s.value > 0);

  const stats = [
    { label: "Total Articles", value: totalArticles, sub: `${publishedArticles} published · ${draftArticles} draft`, icon: FileText },
    { label: "Total Views", value: totalViews, sub: "across all articles", icon: Eye },
    { label: "Total Comments", value: totalComments, sub: `${pendingComments} pending review`, icon: MessageSquare },
    { label: "Subscribers", value: subscriberCount, sub: "newsletter signups", icon: Mail },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Welcome back 👋</h1>
          <p className="mt-1 text-sm text-fg-muted">
            Here&apos;s the latest overview of The Daily Ledger.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-fg-muted">
            <Calendar className="h-4 w-4" />
            Last 30 days
          </span>
          <Link
            href="/admin/articles/new"
            className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition"
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
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500">
                <Icon className="h-5 w-5" />
              </span>
              <span className="text-sm font-medium text-fg-muted">{label}</span>
            </div>
            <div className="mt-4 text-3xl font-bold tabular-nums">
              {formatNumber(value)}
            </div>
            <div className="mt-1 text-xs text-fg-faint">{sub}</div>
          </div>
        ))}
      </div>

      {/* Article views chart + Top categories */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm lg:col-span-2">
          <h2 className="font-semibold">Article views</h2>
          <p className="text-xs text-fg-faint">Top published articles by total views</p>
          {topByViews.length === 0 ? (
            <p className="mt-8 text-sm text-fg-faint">No published articles yet.</p>
          ) : (
            <div className="mt-6 flex h-44 items-end gap-2 sm:gap-3">
              {topByViews.map((a, i) => {
                const h = Math.max(8, Math.round((a.views / maxViews) * 100));
                const top = i === 0;
                return (
                  <div
                    key={a.id}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-2"
                    title={`${a.title} — ${formatNumber(a.views)} views`}
                  >
                    <span className="text-[10px] font-semibold tabular-nums text-fg-faint">
                      {formatNumber(a.views)}
                    </span>
                    <div
                      className="w-full rounded-md"
                      style={{ height: `${h}%`, backgroundColor: top ? "#16a34a" : "#e5e7eb" }}
                    />
                    <span className="w-full truncate text-center text-[10px] text-fg-faint">
                      {a.title.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Top categories</h2>
          <div className="mt-4 space-y-4">
            {cats.length === 0 && (
              <p className="text-sm text-fg-faint">No categories yet.</p>
            )}
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

      {/* Recent articles + content donut */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="font-semibold">Recent articles</h2>
            <Link
              href="/admin/articles"
              className="text-sm font-medium text-fg-muted transition-colors hover:text-fg"
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recent.map((a) => (
                  <tr key={a.id} className="transition-colors hover:bg-surface-2">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold uppercase text-gray-500">
                          {a.title.slice(0, 1)}
                        </span>
                        <Link
                          href={`/admin/articles/${a.id}/edit`}
                          className="line-clamp-1 font-medium text-fg hover:underline"
                        >
                          {a.title}
                        </Link>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <h2 className="font-semibold">Content by category</h2>
          {donutSegments.length === 0 ? (
            <p className="mt-6 text-sm text-fg-faint">No articles yet.</p>
          ) : (
            <div className="mt-4 flex flex-col items-center gap-5">
              <Donut segments={donutSegments} centerValue={totalArticles} />
              <ul className="w-full space-y-2">
                {donutSegments.map((s) => (
                  <li key={s.label} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.label}
                    </span>
                    <span className="font-medium tabular-nums">{s.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
