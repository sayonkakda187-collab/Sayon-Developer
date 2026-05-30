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

/** Fire-and-forget view increment; never blocks rendering on failure. */
export async function incrementViews(id: string) {
  try {
    await prisma.article.update({
      where: { id },
      data: { views: { increment: 1 } },
    });
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
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
