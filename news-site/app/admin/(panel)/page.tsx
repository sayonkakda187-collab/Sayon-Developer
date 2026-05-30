import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/site";
import { getDashboardData, clampRangeDays } from "@/lib/queries";
import { StatGauge } from "@/components/admin/StatGauge";
import { ArticleRow, categoryColor } from "@/components/admin/ArticleRow";
import { DashboardControls } from "@/components/admin/DashboardControls";

// Fraction (0..1) for a gauge arc — small and large counts both read well.
function frac(value: number, ref: number) {
  if (value <= 0) return 0.04;
  return Math.max(0.08, Math.min(0.96, value / ref));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { days?: string };
}) {
  const days = clampRangeDays(searchParams.days ?? 30);
  const d = await getDashboardData(days);

  // View metrics use the publish-date window; inventory counts are all-time.
  const topByViews = [...d.windowArticles].sort((a, b) => b.views - a.views).slice(0, 6);
  const recent = [...d.windowArticles]
    .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
    .slice(0, 6);
  const maxViews = Math.max(1, ...topByViews.map((a) => a.views));

  const catTotal = d.cats.reduce((s, c) => s + c._count.articles, 0);
  const uncategorized = Math.max(0, d.totalArticles - catTotal);
  const donutSegments = [
    ...d.cats.map((c, i) => ({ label: c.name, value: c._count.articles, color: categoryColor(c.name, i) })),
    ...(uncategorized > 0 ? [{ label: "Uncategorized", value: uncategorized, color: "#94a3b8" }] : []),
  ].filter((s) => s.value > 0);
  const maxCat = Math.max(1, ...d.cats.map((c) => c._count.articles));

  const gauges = [
    { value: d.totalArticles, label: "Total Articles", sub: `${d.publishedArticles} published · ${d.draftArticles} draft`, frac: frac(d.totalArticles, 10), c1: "#34d27b", c2: "#16a34a", gradId: "g-articles" },
    { value: d.windowViews, label: "Total Views", sub: days === 30 ? "across all articles" : `last ${days} day${days === 1 ? "" : "s"}`, frac: frac(d.windowViews, 8000), c1: "#fbbf24", c2: "#f59e0b", gradId: "g-views" },
    { value: d.totalComments, label: "Total Comments", sub: `${d.pendingComments} pending review`, frac: frac(d.totalComments, 20), c1: "#fb7185", c2: "#ef4444", gradId: "g-comments" },
    { value: d.subscriberCount, label: "Subscribers", sub: "newsletter signups", frac: frac(d.subscriberCount, 50), c1: "#a78bfa", c2: "#7c3aed", gradId: "g-subs" },
  ];

  // Donut geometry (rotated stack of stroked circles).
  const C = 2 * Math.PI * 56;
  const donutTotal = donutSegments.reduce((s, x) => s + x.value, 0) || 1;
  let donutAcc = 0;

  const noWindowArticles = topByViews.length === 0;

  return (
    <div>
      {/* Page head — Welcome + controls (Refresh, date-range, New Article) */}
      <div className="adm-pagehead adm-rise">
        <div className="adm-welcome">
          <h1 className="adm-serif">Welcome back 👋</h1>
          <p>Here&apos;s the latest overview of The Daily Ledger.</p>
        </div>
        <DashboardControls days={days} />
      </div>

      {/* Stat gauges (2-up mobile / 4-up desktop) */}
      <div className="adm-stats adm-rise" style={{ animationDelay: "0.06s" }}>
        {gauges.map((g) => (
          <StatGauge key={g.label} {...g} />
        ))}
      </div>

      {/* Row 1 — Article views + Top categories */}
      <div className="adm-grid-2 adm-rise" style={{ animationDelay: "0.12s" }}>
        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">Article views</div>
          <div className="adm-card-sub">Top published articles by total views</div>
          {noWindowArticles ? (
            <p className="adm-card-sub" style={{ marginTop: 16 }}>
              No articles published in this range.
            </p>
          ) : (
            <>
              {/* Desktop: vertical bars */}
              <div className="adm-vbars adm-only-desktop">
                {topByViews.map((a) => {
                  const color = categoryColor(a.category?.name);
                  return (
                    <div key={a.id} className="adm-bcol" title={`${a.title} — ${formatNumber(a.views)} views`}>
                      <div className="adm-bval">{formatNumber(a.views)}</div>
                      <div
                        className="adm-bbar"
                        style={{
                          height: `${Math.max(4, Math.round((a.views / maxViews) * 160))}px`,
                          background: `linear-gradient(180deg, ${color}, rgba(0,0,0,.04)), ${color}`,
                        }}
                      />
                      <div className="adm-bname">{a.title.split(" ").slice(0, 2).join(" ")}</div>
                    </div>
                  );
                })}
              </div>
              {/* Mobile: horizontal bars */}
              <div className="adm-bars adm-only-mobile">
                {topByViews.map((a) => (
                  <div key={a.id} className="adm-bar-row">
                    <span className="adm-bl">{a.title.split(" ").slice(0, 2).join(" ")}</span>
                    <div className="adm-bar-track">
                      <div
                        className="adm-bar-fill"
                        style={{ width: `${Math.round((a.views / maxViews) * 100)}%`, background: categoryColor(a.category?.name) }}
                      />
                    </div>
                    <span className="adm-bv">{formatNumber(a.views)}</span>
                  </div>
                ))}
              </div>
              <div className="adm-legend-mini adm-mini-legend">
                <span><i style={{ background: "#16a34a" }} />Business</span>
                <span><i style={{ background: "#f59e0b" }} />Technology</span>
                <span><i style={{ background: "#a855f7" }} />World</span>
              </div>
            </>
          )}
        </div>

        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">Top categories</div>
          <div className="adm-card-sub adm-only-desktop">Published articles per category</div>
          {d.cats.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 12 }}>No categories yet.</p>
          ) : (
            <div className="adm-catbars">
              {d.cats.map((c, i) => (
                <div key={c.id} className="adm-catbar">
                  <div className="adm-crow">
                    {c.name} <span>{c._count.articles}</span>
                  </div>
                  <div className="adm-ctrack">
                    <div
                      className="adm-cfill"
                      style={{ width: `${Math.round((c._count.articles / maxCat) * 100)}%`, background: categoryColor(c.name, i) }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 2 — Recent articles + Content by category donut */}
      <div className="adm-grid-2 adm-rise" style={{ animationDelay: "0.18s" }}>
        <div className="adm-card adm-card-pad">
          <div className="adm-list-head">
            <div className="adm-card-title">Recent articles</div>
            <Link href="/admin/articles" className="adm-link">View all</Link>
          </div>
          {recent.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 12 }}>No articles published in this range.</p>
          ) : (
            <>
              {/* Desktop: table */}
              <table className="adm-table adm-only-desktop">
                <thead>
                  <tr><th>Title</th><th>Status</th><th>Category</th><th>Views</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/articles/${a.id}/edit`} className="adm-tt">
                          <span className="adm-ini">{a.title.slice(0, 1).toUpperCase()}</span>
                          <span className="adm-ttl">{a.title}</span>
                        </Link>
                      </td>
                      <td><span className="adm-pill">Published</span></td>
                      <td className="adm-cat-cell">{a.category?.name ?? "—"}</td>
                      <td className="adm-num-td">{formatNumber(a.views)}</td>
                      <td className="adm-num-td">{formatDate(a.publishedAt ?? undefined)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Mobile: rows */}
              <div className="adm-only-mobile" style={{ marginTop: 6 }}>
                {recent.map((a) => (
                  <ArticleRow
                    key={a.id}
                    a={{ id: a.id, title: a.title, slug: a.slug, status: a.status, views: a.views, category: a.category, publishedAt: a.publishedAt, createdAt: a.createdAt }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">Content by category</div>
          <div className="adm-card-sub">Distribution of all published articles</div>
          {donutSegments.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 14 }}>No articles yet.</p>
          ) : (
            <div className="adm-donut-wrap">
              <div className="adm-donut">
                <svg width="176" height="176" viewBox="0 0 148 148" preserveAspectRatio="xMidYMid meet">
                  <g transform="rotate(-90 74 74)">
                    {donutSegments.map((s) => {
                      const seg = (s.value / donutTotal) * C;
                      const circle = (
                        <circle
                          key={s.label}
                          cx="74" cy="74" r="56" fill="none"
                          stroke={s.color} strokeWidth="20"
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
                  <b>{formatNumber(d.totalArticles)}</b>
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
      </div>
    </div>
  );
}
