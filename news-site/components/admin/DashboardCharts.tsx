"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/site";
import { StatGauge } from "./StatGauge";
import { ArticleRow, categoryColor } from "./ArticleRow";
import { ArticleThumb } from "./ArticleThumb";
import { DashboardControls } from "./DashboardControls";
import { ViewsChart } from "./ViewsChart";
import { AdskeeperPanel } from "./AdskeeperPanel";
import { timeAgo } from "@/lib/site";
import { PlusIcon, CommentsIcon, PencilIcon } from "./icons";

type Article = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  coverImage: string | null;
  category: { name: string } | null;
  publishedAt: string | null;
  createdAt: string;
};
type Cat = { id: string; name: string; count: number };
type RecentComment = {
  id: string;
  authorName: string;
  approved: boolean;
  createdAt: string;
  articleTitle: string;
  articleId: string | null;
};

export type DashboardProps = {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  totalComments: number;
  pendingComments: number;
  subscriberCount: number;
  totalViews: number;
  cats: Cat[];
  articles: Article[];
  viewsSeries: { date: string; views: number }[];
  recentComments: RecentComment[];
};

function frac(value: number, ref: number) {
  if (value <= 0) return 0.04;
  return Math.max(0.08, Math.min(0.96, value / ref));
}

/**
 * Client dashboard: holds the date-range (1–30 days) and scales the view
 * metrics proportionally (views × days/30) so dragging the slider updates
 * Total Views, the Article Views chart, and Recent Articles instantly and
 * continuously — no server round-trip. Inventory counts are not windowed.
 */
export function DashboardCharts(props: DashboardProps) {
  const [days, setDays] = useState(30);
  const factor = days / 30;
  const scale = (v: number) => Math.round(v * factor);

  // Scaled, view-derived data (recomputed each render as `days` changes).
  const scaledArticles = props.articles.map((a) => ({ ...a, sv: scale(a.views) }));
  const topByViews = [...scaledArticles].sort((a, b) => b.sv - a.sv).slice(0, 6);
  const recent = [...scaledArticles]
    .sort((a, b) => (Date.parse(b.publishedAt ?? b.createdAt) || 0) - (Date.parse(a.publishedAt ?? a.createdAt) || 0))
    .slice(0, 6);
  const maxViews = Math.max(1, ...topByViews.map((a) => a.sv));
  const windowViews = scale(props.totalViews);

  const catTotal = props.cats.reduce((s, c) => s + c.count, 0);
  const uncategorized = Math.max(0, props.totalArticles - catTotal);
  const donutSegments = [
    ...props.cats.map((c, i) => ({ label: c.name, value: c.count, color: categoryColor(c.name, i) })),
    ...(uncategorized > 0 ? [{ label: "Uncategorized", value: uncategorized, color: "#94a3b8" }] : []),
  ].filter((s) => s.value > 0);
  const maxCat = Math.max(1, ...props.cats.map((c) => c.count));

  const gauges = [
    { value: props.totalArticles, label: "Total Articles", sub: `${props.publishedArticles} published · ${props.draftArticles} draft`, frac: frac(props.totalArticles, 10), c1: "#34d27b", c2: "#16a34a", gradId: "g-articles" },
    { value: windowViews, label: "Total Views", sub: days === 30 ? "across all articles" : `last ${days} day${days === 1 ? "" : "s"}`, frac: frac(windowViews, 8000), c1: "#fbbf24", c2: "#f59e0b", gradId: "g-views" },
    { value: props.totalComments, label: "Total Comments", sub: `${props.pendingComments} pending review`, frac: frac(props.totalComments, 20), c1: "#fb7185", c2: "#ef4444", gradId: "g-comments" },
    { value: props.subscriberCount, label: "Subscribers", sub: "newsletter signups", frac: frac(props.subscriberCount, 50), c1: "#a78bfa", c2: "#7c3aed", gradId: "g-subs" },
  ];

  const C = 2 * Math.PI * 56;
  const donutTotal = donutSegments.reduce((s, x) => s + x.value, 0) || 1;
  let donutAcc = 0;

  const noWindowArticles = topByViews.every((a) => a.sv === 0);

  return (
    <div>
      <div className="adm-pagehead adm-rise">
        <div className="adm-welcome">
          <h1 className="adm-serif">Welcome back 👋</h1>
          <p>Here&apos;s the latest overview of The Daily Ledger.</p>
        </div>
        <DashboardControls days={days} onChange={setDays} />
      </div>

      {/* Stat gauges — re-key on `days` so Total Views counts to the new value. */}
      <div className="adm-stats adm-rise" style={{ animationDelay: "0.06s" }}>
        {gauges.map((g) => (
          <StatGauge key={g.label} {...g} animKey={g.label === "Total Views" ? days : 0} />
        ))}
      </div>

      {/* Quick actions */}
      <div className="adm-quickactions adm-rise" style={{ animationDelay: "0.09s" }}>
        <Link href="/admin/articles/new" className="adm-qa">
          <span className="adm-qa-ic" style={{ background: "rgba(22,163,74,.12)", color: "#16a34a" }}><PlusIcon className="h-[18px] w-[18px]" /></span>
          <span><b>New article</b><s>Start writing</s></span>
        </Link>
        <Link href="/admin/comments" className="adm-qa">
          <span className="adm-qa-ic" style={{ background: "rgba(37,99,235,.12)", color: "#2563eb" }}><CommentsIcon className="h-[18px] w-[18px]" /></span>
          <span><b>Review comments</b><s>{props.pendingComments} pending</s></span>
        </Link>
        <Link href="/admin/articles" className="adm-qa">
          <span className="adm-qa-ic" style={{ background: "rgba(245,158,11,.14)", color: "#f59e0b" }}><PencilIcon className="h-[18px] w-[18px]" /></span>
          <span><b>Manage articles</b><s>{props.draftArticles} draft{props.draftArticles === 1 ? "" : "s"}</s></span>
        </Link>
      </div>

      {/* Ad earnings (AdsKeeper) — self-fetching; safe no-op until configured */}
      <div style={{ marginBottom: 18 }}>
        <AdskeeperPanel />
      </div>

      {/* Row 1 — Real views-over-time chart + Top articles by views */}
      <div className="adm-grid-2 adm-rise" style={{ animationDelay: "0.12s" }}>
        <ViewsChart series={props.viewsSeries} days={days} />

        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">Top articles by views</div>
          <div className="adm-card-sub">All-time leaders</div>
          {noWindowArticles ? (
            <p className="adm-card-sub" style={{ marginTop: 16 }}>No views yet.</p>
          ) : (
            <div className="adm-bars" style={{ marginTop: 12 }}>
              {topByViews.map((a) => (
                <div key={a.id} className="adm-bar-row">
                  <span className="adm-bl" title={a.title}>{a.title.split(" ").slice(0, 3).join(" ")}</span>
                  <div className="adm-bar-track">
                    <div className="adm-bar-fill adm-bar-fill-live" style={{ width: `${Math.round((a.sv / maxViews) * 100)}%`, background: categoryColor(a.category?.name) }} />
                  </div>
                  <span className="adm-bv">{formatNumber(a.sv)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 1.5 — Recent activity (pending comments) + Top categories */}
      <div className="adm-grid-2 adm-rise" style={{ animationDelay: "0.15s" }}>
        <div className="adm-card adm-card-pad">
          <div className="adm-list-head">
            <div className="adm-card-title">Recent activity</div>
            <Link href="/admin/comments" className="adm-link">Moderate</Link>
          </div>
          {props.recentComments.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 12 }}>No comments yet.</p>
          ) : (
            <div className="adm-activity">
              {props.recentComments.map((c) => (
                <div key={c.id} className="adm-activity-row">
                  <span className={`adm-activity-dot ${c.approved ? "ok" : "pending"}`} aria-hidden />
                  <div className="adm-activity-body">
                    <div className="adm-activity-top">
                      <b>{c.authorName}</b>
                      <span className={`adm-pill ${c.approved ? "" : "amber"}`} style={{ marginLeft: 6 }}>
                        {c.approved ? "approved" : "pending"}
                      </span>
                    </div>
                    <div className="adm-activity-sub">
                      on “{c.articleTitle}” · {timeAgo(c.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="adm-card adm-card-pad">
          <div className="adm-card-title">Top categories</div>
          <div className="adm-card-sub adm-only-desktop">Published articles per category</div>
          {props.cats.length === 0 ? (
            <p className="adm-card-sub" style={{ marginTop: 12 }}>No categories yet.</p>
          ) : (
            <div className="adm-catbars">
              {props.cats.map((c, i) => (
                <div key={c.id} className="adm-catbar">
                  <div className="adm-crow">
                    {c.name} <span>{c.count}</span>
                  </div>
                  <div className="adm-ctrack">
                    <div className="adm-cfill" style={{ width: `${Math.round((c.count / maxCat) * 100)}%`, background: categoryColor(c.name, i) }} />
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
            <p className="adm-card-sub" style={{ marginTop: 12 }}>No articles yet.</p>
          ) : (
            <>
              <table className="adm-table adm-only-desktop">
                <thead>
                  <tr><th>Title</th><th>Status</th><th>Category</th><th>Views</th><th>Date</th></tr>
                </thead>
                <tbody>
                  {recent.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/articles/${a.id}/edit`} className="adm-tt">
                          <ArticleThumb cover={a.coverImage} title={a.title} />
                          <span className="adm-ttl">{a.title}</span>
                        </Link>
                      </td>
                      <td><span className="adm-pill">Published</span></td>
                      <td className="adm-cat-cell">{a.category?.name ?? "—"}</td>
                      <td className="adm-num-td">{formatNumber(a.sv)}</td>
                      <td className="adm-num-td">{formatDate(a.publishedAt ?? a.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="adm-only-mobile" style={{ marginTop: 6 }}>
                {recent.map((a) => (
                  <ArticleRow
                    key={a.id}
                    a={{ id: a.id, title: a.title, slug: a.slug, status: a.status, views: a.sv, coverImage: a.coverImage, category: a.category, publishedAt: a.publishedAt ? new Date(a.publishedAt) : null, createdAt: new Date(a.createdAt) }}
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
                  <b>{formatNumber(props.totalArticles)}</b>
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
