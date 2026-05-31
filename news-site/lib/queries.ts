import { cache } from "react";
import type { Article, Category } from "@prisma/client";
import { prisma } from "@/lib/db";

export const ARTICLES_PER_PAGE = 8;

/** Shape returned for list/grid views (article plus its category). */
export type ArticleWithCategory = Article & { category: Category | null };

const published = { status: "published" } as const;

export function getCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

/** Latest published headlines for the top "trending" bar (display only). */
export function getTrending(take = 6) {
  return prisma.article.findMany({
    where: published,
    orderBy: { publishedAt: "desc" },
    select: { title: true, slug: true },
    take,
  });
}

/** Homepage payload: a featured hero, the latest grid, and per-category sections. */
export async function getHomepage() {
  const recent = await prisma.article.findMany({
    where: published,
    orderBy: { publishedAt: "desc" },
    include: { category: true },
    take: 13, // 1 hero + up to 12 in the latest grid
  });
  const [featured, ...latest] = recent;

  const categories = await prisma.category.findMany({
    orderBy: { name: "asc" },
    include: {
      articles: {
        where: published,
        orderBy: { publishedAt: "desc" },
        include: { category: true },
        take: 4,
      },
    },
  });

  return { featured: featured ?? null, latest, categories };
}

/** Cached so the article page and its generateMetadata share one query. */
export const getArticleBySlug = cache((slug: string) =>
  prisma.article.findFirst({
    where: { slug, ...published },
    include: { category: true, tags: true },
  }),
);

export function getRelatedArticles(args: {
  categoryId: string | null;
  excludeId: string;
  take?: number;
}) {
  const { categoryId, excludeId, take = 3 } = args;
  if (!categoryId) return Promise.resolve([] as ArticleWithCategory[]);
  return prisma.article.findMany({
    where: { ...published, categoryId, id: { not: excludeId } },
    orderBy: { publishedAt: "desc" },
    include: { category: true },
    take,
  });
}

/** UTC midnight for a given date — the key for per-day view buckets. */
export function utcDayStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Fire-and-forget view increment; never blocks rendering on failure. Bumps both
 * the all-time `Article.views` counter and the per-day `DailyView` bucket (for
 * the dashboard's views-over-time chart). Privacy-respecting: only a per-day
 * integer count, no visitor data.
 */
export async function incrementViews(id: string) {
  const today = utcDayStart();
  try {
    await Promise.all([
      prisma.article.update({
        where: { id },
        data: { views: { increment: 1 } },
      }),
      prisma.dailyView.upsert({
        where: { articleId_date: { articleId: id, date: today } },
        update: { count: { increment: 1 } },
        create: { articleId: id, date: today, count: 1 },
      }),
    ]);
  } catch {
    // Swallow: a failed counter shouldn't break the page.
  }
}

export const getCategoryBySlug = cache((slug: string) =>
  prisma.category.findUnique({ where: { slug } }),
);

export async function getCategoryArticles(categoryId: string, page: number) {
  const skip = (page - 1) * ARTICLES_PER_PAGE;
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { ...published, categoryId },
      orderBy: { publishedAt: "desc" },
      include: { category: true },
      skip,
      take: ARTICLES_PER_PAGE,
    }),
    prisma.article.count({ where: { ...published, categoryId } }),
  ]);
  return {
    articles,
    total,
    pageCount: Math.max(1, Math.ceil(total / ARTICLES_PER_PAGE)),
  };
}

/** Server-side search over title, excerpt, and content (case-insensitive on SQLite). */
export async function searchArticles(query: string) {
  const q = query.trim();
  if (!q) return [] as ArticleWithCategory[];
  return prisma.article.findMany({
    where: {
      ...published,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { excerpt: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { publishedAt: "desc" },
    include: { category: true },
    take: 50,
  });
}

/** Approved comments for an article, newest first. */
export function getApprovedComments(articleId: string) {
  return prisma.comment.findMany({
    where: { articleId, approved: true },
    orderBy: { createdAt: "desc" },
  });
}

/* ── Admin dashboard analytics ─────────────────────────────────────────────
 * Fetched once on the server (all-time baseline). The dashboard's date-range
 * filter (1–30 days) then scales the view metrics on the CLIENT for an instant,
 * continuous feel as the slider moves — Total Views, the Article Views chart,
 * and Recent Articles scale proportionally to the window; inventory counts
 * (articles, categories, comments, subscribers) are not windowed.
 */
export function clampRangeDays(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return 30;
  return Math.min(30, Math.max(1, n));
}

/**
 * Daily view totals for the last `days` days (UTC), returned as a dense series
 * (zero-filled for days with no views) so the dashboard chart has one point per
 * day. Aggregates the per-article DailyView buckets by day.
 */
export async function getViewsSeries(days = 30): Promise<{ date: string; views: number }[]> {
  const span = Math.min(90, Math.max(1, Math.round(days)));
  const start = utcDayStart();
  start.setUTCDate(start.getUTCDate() - (span - 1));

  const rows = await prisma.dailyView.findMany({
    where: { date: { gte: start } },
    select: { date: true, count: true },
  });

  // Sum per UTC day into a map keyed by yyyy-mm-dd.
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + r.count);
  }

  // Dense, chronological series (oldest → newest), zero-filled.
  const series: { date: string; views: number }[] = [];
  for (let i = 0; i < span; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, views: byDay.get(key) ?? 0 });
  }
  return series;
}

export async function getDashboardData() {
  const [
    totalArticles,
    publishedArticles,
    draftArticles,
    totalComments,
    pendingComments,
    subscriberCount,
    cats,
    viewsAgg,
    publishedList,
    recentComments,
    viewsSeries,
  ] = await Promise.all([
    prisma.article.count(),
    prisma.article.count({ where: published }),
    prisma.article.count({ where: { status: "draft" } }),
    prisma.comment.count(),
    prisma.comment.count({ where: { approved: false } }),
    prisma.newsletter.count(),
    prisma.category.findMany({
      orderBy: { name: "asc" },
      include: { _count: { select: { articles: true } } },
    }),
    prisma.article.aggregate({ _sum: { views: true }, where: published }),
    prisma.article.findMany({
      where: published,
      orderBy: { publishedAt: "desc" },
      include: { category: { select: { name: true } } },
    }),
    prisma.comment.findMany({
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { article: { select: { id: true, title: true, slug: true } } },
    }),
    getViewsSeries(30),
  ]);

  return {
    totalArticles,
    publishedArticles,
    draftArticles,
    totalComments,
    pendingComments,
    subscriberCount,
    cats,
    totalViews: viewsAgg._sum.views ?? 0,
    publishedList, // all published (the client scales views by the window)
    recentComments,
    viewsSeries,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
