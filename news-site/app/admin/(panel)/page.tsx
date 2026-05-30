import Link from "next/link";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/site";
import { StatGauge } from "@/components/admin/StatGauge";
import { ArticleRow, categoryColor } from "@/components/admin/ArticleRow";
import { CalendarIcon, PlusIcon } from "@/components/admin/icons";

// Fraction (0..1) for a gauge arc — log-ish so small and large counts both read
// well. Views uses a larger reference so a busy publication still leaves headroom.
function frac(value: number, ref: number) {
  if (value <= 0) return 0.04;
  return Math.max(0.08, Math.min(0.96, value / ref));
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
      take: 3,
      include: { category: true },
    }),
    prisma.article.findMany({
      where: { status: "published" },
      orderBy: { views: "desc" },
      take: 6,
      select: { id: true, title: true, views: true, category: { select: { name: true } } },
    }),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    }),
  ]);

  const totalViews = viewsAgg._sum.views ?? 0;
  const maxViews = Math.max(1, ...topByViews.map((a) => a.views));
  const catTotal = cats.reduce((s, c) => s + c._count.articles, 0);
  const uncategorized = Math.max(0, totalArticles - catTotal);

  const donutSegments = [
    ...cats.map((c, i) => ({
      label: c.name,
      value: c._count.articles,
      color: categoryColor(c.name, i),
    })),
    ...(uncategorized > 0
      ? [{ label: "Uncategorized", value: uncategorized, color: "#94a3b8" }]
      : []),
  ].filter((s) => s.value > 0);

  const gauges = [
    { value: totalArticles, label: "Total Articles", sub: `${publishedArticles} published · ${draftArticles} draft`, frac: frac(totalArticles, 10), c1: "#34d27b", c2: "#16a34a", gradId: "g-articles" },
    { value: totalViews, label: "Total Views", sub: "across all articles", frac: frac(totalViews, 8000), c1: "#fbbf24", c2: "#f59e0b", gradId: "g-views" },
    { value: totalComments, label: "Total Comments", sub: `${pendingComments} pending review`, frac: frac(totalComments, 20), c1: "#fb7185", c2: "#ef4444", gradId: "g-comments" },
    { value: subscriberCount, label: "Subscribers", sub: "newsletter signups", frac: frac(subscriberCount, 50), c1: "#a78bfa", c2: "#7c3aed", gradId: "g-subs" },
  ];

  // The donut renders as a rotated stack of stroked circles (matches the spec).
  const C = 2 * Math.PI * 56; // circumference at r=56
  const donutTotal = donutSegments.reduce((s, x) => s + x.value, 0) || 1;
  let donutAcc = 0;

  return (
    <div>
      <div className="adm-welcome adm-rise">
        <h1 className="adm-serif">Welcome back 👋</h1>
        <p>Here&apos;s the latest overview of The Daily Ledger.</p>
      </div>

      <div className="adm-toprow adm-rise" style={{ animationDelay: "0.07s" }}>
        <span className="adm-chip">
          <CalendarIcon className="h-3.5 w-3.5" />
          Last 30 days
        </span>
        <Link href="/admin/articles/new" className="adm-btn-primary">
          <PlusIcon className="h-[15px] w-[15px]" />
          New Article
        </Link>
      </div>

      {/* Stat gauges */}
      <div className="adm-stats adm-rise" style={{ animationDelay: "0.14s" }}>
        {gauges.map((g) => (
          <StatGauge key={g.label} {...g} />
        ))}
      </div>

      {/* Article views */}
      <div className="adm-card adm-card-pad adm-section adm-rise" style={{ animationDelay: "0.21s" }}>
        <div className="adm-card-title">Article views</div>
        <div className="adm-card-sub">Top published articles by total views</div>
        {topByViews.length === 0 ? (
          <p className="adm-card-sub" style={{ marginTop: 14 }}>No published articles yet.</p>
        ) : (
          <>
            <div className="adm-bars">
              {topByViews.map((a) => (
                <div key={a.id} className="adm-bar-row">
                  <span className="adm-bl">{a.title.split(" ").slice(0, 2).join(" ")}</span>
                  <div className="adm-bar-track">
                    <div
                      className="adm-bar-fill"
                      style={{
                        width: `${Math.round((a.views / maxViews) * 100)}%`,
                        background: categoryColor(a.category?.name),
                      }}
                    />
                  </div>
                  <span className="adm-bv">{formatNumber(a.views)}</span>
                </div>
              ))}
            </div>
            <div className="adm-legend-mini">
              <span><i style={{ background: "#16a34a" }} />Business</span>
              <span><i style={{ background: "#f59e0b" }} />Technology</span>
              <span><i style={{ background: "#a855f7" }} />World</span>
            </div>
          </>
        )}
      </div>

      {/* Top categories */}
      <div className="adm-card adm-card-pad adm-section adm-rise" style={{ animationDelay: "0.28s" }}>
        <div className="adm-card-title">Top categories</div>
        {cats.length === 0 ? (
          <p className="adm-card-sub" style={{ marginTop: 12 }}>No categories yet.</p>
        ) : (
          <div className="adm-catbars">
            {cats.map((c, i) => {
              const max = Math.max(1, ...cats.map((x) => x._count.articles));
              return (
                <div key={c.id}>
                  <div className="adm-crow">
                    {c.name} <span>{c._count.articles}</span>
                  </div>
                  <div className="adm-ctrack">
                    <div
                      className="adm-cfill"
                      style={{
                        width: `${Math.round((c._count.articles / max) * 100)}%`,
                        background: categoryColor(c.name, i),
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Content by category (donut) */}
      <div className="adm-card adm-card-pad adm-section adm-rise" style={{ animationDelay: "0.35s" }}>
        <div className="adm-card-title">Content by category</div>
        <div className="adm-card-sub">Distribution of all published articles</div>
        {donutSegments.length === 0 ? (
          <p className="adm-card-sub" style={{ marginTop: 14 }}>No articles yet.</p>
        ) : (
          <div className="adm-donut-wrap">
            <div className="adm-donut">
              <svg width="148" height="148" viewBox="0 0 148 148">
                <g transform="rotate(-90 74 74)">
                  {donutSegments.map((s) => {
                    const seg = (s.value / donutTotal) * C;
                    const circle = (
                      <circle
                        key={s.label}
                        cx="74"
                        cy="74"
                        r="56"
                        fill="none"
                        stroke={s.color}
                        strokeWidth="20"
                        strokeDasharray={`${seg.toFixed(2)} ${(C - seg).toFixed(2)}`}
                        strokeDashoffset={-donutAcc}
                      />
                    );
                    donutAcc += seg;
                    return circle;
                  })}
                </g>
              </svg>
              <div className="adm-center">
                <b>{formatNumber(totalArticles)}</b>
                <s>articles</s>
              </div>
            </div>
            <div className="adm-legend">
              {donutSegments.map((s) => (
                <div key={s.label} className="adm-lrow">
                  <span className="adm-sw" style={{ background: s.color }} />
                  {s.label}
                  <span className="adm-lv">{s.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent articles */}
      <div className="adm-card adm-card-pad adm-rise" style={{ animationDelay: "0.42s" }}>
        <div className="adm-list-head">
          <div className="adm-card-title">Recent articles</div>
          <Link href="/admin/articles" className="adm-link">View all</Link>
        </div>
        <div style={{ marginTop: 6 }}>
          {recent.length === 0 ? (
            <p className="adm-card-sub">No articles yet.</p>
          ) : (
            recent.map((a) => <ArticleRow key={a.id} a={a} />)
          )}
        </div>
      </div>
    </div>
  );
}
