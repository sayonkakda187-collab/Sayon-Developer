import { cache } from "react";
import { unstable_cache } from "next/cache";
import type { Article, Category } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalizeDevice } from "@/lib/devices";

export const ARTICLES_PER_PAGE = 8;

/** Shape returned for list/grid views (article plus its category). */
export type ArticleWithCategory = Article & { category: Category | null };

/** Minimal, SERIALIZABLE card shape (publishedAt as ISO string) — safe to pass to
 *  client components like the category "Load more" feed. */
export type CardArticle = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  coverImage: string | null;
  category: { name: string; slug: string } | null;
  publishedAt: Date | string | null;
};

/** Project an article into the serializable card shape. */
export function toCardArticle(a: ArticleWithCategory): CardArticle {
  return {
    id: a.id,
    slug: a.slug,
    title: a.title,
    excerpt: a.excerpt,
    coverImage: a.coverImage,
    category: a.category ? { name: a.category.name, slug: a.category.slug } : null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
  };
}

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

  // A larger pool powering the trending-style card grid + in-place category tab
  // filtering on the homepage. Excludes the hero (shown separately above).
  const feed = await prisma.article.findMany({
    where: { ...published, ...(featured ? { id: { not: featured.id } } : {}) },
    orderBy: { publishedAt: "desc" },
    include: { category: true },
    take: 48,
  });

  // Categories that actually have published articles, for the tab row. Cheap
  // count so empty categories don't show an empty tab.
  const withCounts = await prisma.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { articles: { where: published } } },
    },
  });
  const tabCategories = withCounts
    .filter((c) => c._count.articles > 0)
    .map((c) => ({ id: c.id, name: c.name, slug: c.slug }));

  return { featured: featured ?? null, latest, categories, feed, tabCategories };
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

/** "Read next": same-category articles first (newest first), then backfilled with
 *  the newest from any category so it always returns a full set even when the
 *  category is sparse. Excludes the current article. */
export async function getReadNext(args: {
  categoryId: string | null;
  excludeId: string;
  take?: number;
}): Promise<ArticleWithCategory[]> {
  const { categoryId, excludeId, take = 3 } = args;
  const sameCat = categoryId
    ? await prisma.article.findMany({
        where: { ...published, categoryId, id: { not: excludeId } },
        orderBy: { publishedAt: "desc" },
        include: { category: true },
        take,
      })
    : [];
  if (sameCat.length >= take) return sameCat;
  const have = [excludeId, ...sameCat.map((a) => a.id)];
  const fill = await prisma.article.findMany({
    where: { ...published, id: { notIn: have } },
    orderBy: { publishedAt: "desc" },
    include: { category: true },
    take: take - sameCat.length,
  });
  return [...sameCat, ...fill];
}

export type MostReadItem = { id: string; title: string; slug: string; category: string | null };

/** Top `take` articles by views over the last 7 days (rank order). Falls back to
 *  the newest articles so the section is never empty on a fresh site. Cached
 *  ~15 minutes (the DailyView counters update continuously). */
export const getMostRead = unstable_cache(
  async (take = 5): Promise<MostReadItem[]> => {
    const since = utcDayStart(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)); // last 7 days incl. today
    const grouped = await prisma.dailyView.groupBy({
      by: ["articleId"],
      where: { date: { gte: since } },
      _sum: { count: true },
      orderBy: { _sum: { count: "desc" } },
      take: take * 2,
    });
    const ids = grouped.map((g) => g.articleId);
    const ranked = ids.length
      ? await prisma.article.findMany({
          where: { id: { in: ids }, status: "published" },
          select: { id: true, title: true, slug: true, category: { select: { name: true } } },
        })
      : [];
    const order = new Map(ids.map((id, i) => [id, i]));
    ranked.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    let result: MostReadItem[] = ranked
      .slice(0, take)
      .map((a) => ({ id: a.id, title: a.title, slug: a.slug, category: a.category?.name ?? null }));

    if (result.length < take) {
      const have = new Set(result.map((r) => r.id));
      const fill = await prisma.article.findMany({
        where: { status: "published", id: { notIn: [...have] } },
        orderBy: { publishedAt: "desc" },
        take: take - result.length,
        select: { id: true, title: true, slug: true, category: { select: { name: true } } },
      });
      result = [
        ...result,
        ...fill.map((a) => ({ id: a.id, title: a.title, slug: a.slug, category: a.category?.name ?? null })),
      ];
    }
    return result;
  },
  ["most-read-7d"],
  { revalidate: 900 },
);

/** UTC midnight for a given date — the key for per-day view buckets. */
export function utcDayStart(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Normalize a raw country header to an uppercase ISO alpha-2, or "ZZ" (unknown). */
function normalizeCountry(raw?: string | null): string {
  const c = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(c) ? c : "ZZ";
}

/**
 * Fire-and-forget view increment; never blocks rendering on failure. Bumps the
 * all-time `Article.views` counter, the per-day `DailyView` bucket (views-over-
 * time chart), the per-country `ArticleCountryView` bucket (Audience map) and the
 * per-device `ArticleDeviceView` bucket (Audience device breakdown). Privacy-
 * respecting: only per-day integer counts, no IP/UA/visitor PII — the country
 * comes from the free Vercel `x-vercel-ip-country` header ("ZZ" = unknown) and the
 * device is a coarse class (mobile/desktop/tablet) derived from the User-Agent and
 * immediately discarded (only the bucket is stored).
 */
export async function incrementViews(
  id: string,
  countryCode?: string | null,
  device?: string | null,
) {
  const today = utcDayStart();
  const code = normalizeCountry(countryCode);
  const dev = normalizeDevice(device);
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
      prisma.articleCountryView.upsert({
        where: { articleId_countryCode_date: { articleId: id, countryCode: code, date: today } },
        update: { count: { increment: 1 } },
        create: { articleId: id, countryCode: code, date: today, count: 1 },
      }),
      prisma.articleDeviceView.upsert({
        where: { articleId_device_date: { articleId: id, device: dev, date: today } },
        update: { count: { increment: 1 } },
        create: { articleId: id, device: dev, date: today, count: 1 },
      }),
      // Real-time read log for the Audience "Live readers" panel.
      prisma.recentView.create({ data: { articleId: id, countryCode: code } }),
    ]);
    // Keep the live log tiny: occasionally drop rows older than the live window.
    if (Math.random() < 0.1) {
      await prisma.recentView.deleteMany({
        where: { createdAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
      });
    }
  } catch {
    // Swallow: a failed counter shouldn't break the page.
  }
}

export type CountryStat = { countryCode: string; count: number };

/**
 * Aggregated visitor-country counts for the Audience analytics. Overall (all
 * articles) or a single article; optional rolling window in days (omit / 0 = all
 * time). Returns counts sorted desc + the total.
 */
export async function getCountryStats(opts?: {
  articleId?: string;
  days?: number;
}): Promise<{ stats: CountryStat[]; total: number }> {
  const where: { articleId?: string; date?: { gte: Date } } = {};
  if (opts?.articleId) where.articleId = opts.articleId;
  if (opts?.days && opts.days > 0) {
    const start = utcDayStart();
    start.setUTCDate(start.getUTCDate() - (Math.min(3650, Math.round(opts.days)) - 1));
    where.date = { gte: start };
  }
  const rows = await prisma.articleCountryView.groupBy({
    by: ["countryCode"],
    where,
    _sum: { count: true },
  });
  const stats = rows
    .map((r) => ({ countryCode: r.countryCode, count: r._sum.count ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = stats.reduce((s, x) => s + x.count, 0);
  return { stats, total };
}

export type DeviceStat = { device: string; count: number };

/**
 * Aggregated device-class counts (mobile/desktop/tablet) for the Audience
 * analytics. Same scoping as getCountryStats: overall (all articles) or a single
 * article, with an optional rolling window in days (omit / 0 = all time). Returns
 * counts sorted desc + the total.
 */
export async function getDeviceStats(opts?: {
  articleId?: string;
  days?: number;
}): Promise<{ stats: DeviceStat[]; total: number }> {
  const where: { articleId?: string; date?: { gte: Date } } = {};
  if (opts?.articleId) where.articleId = opts.articleId;
  if (opts?.days && opts.days > 0) {
    const start = utcDayStart();
    start.setUTCDate(start.getUTCDate() - (Math.min(3650, Math.round(opts.days)) - 1));
    where.date = { gte: start };
  }
  const rows = await prisma.articleDeviceView.groupBy({
    by: ["device"],
    where,
    _sum: { count: true },
  });
  const stats = rows
    .map((r) => ({ device: r.device, count: r._sum.count ?? 0 }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);
  const total = stats.reduce((s, x) => s + x.count, 0);
  return { stats, total };
}

/** Articles that have visitor-country data (for the Audience per-article picker),
 *  most-viewed first. */
export async function getAudienceArticles(): Promise<{ id: string; title: string }[]> {
  const grouped = await prisma.articleCountryView.groupBy({
    by: ["articleId"],
    _sum: { count: true },
  });
  const ids = grouped
    .filter((g) => (g._sum.count ?? 0) > 0)
    .sort((a, b) => (b._sum.count ?? 0) - (a._sum.count ?? 0))
    .map((g) => g.articleId);
  if (ids.length === 0) return [];
  const articles = await prisma.article.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  const byId = new Map(articles.map((a) => [a.id, a.title]));
  return ids.filter((id) => byId.has(id)).map((id) => ({ id, title: byId.get(id)! }));
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

/** A skip/take slice of a category's articles + the total — powers the client
 *  "Load more" button (12 at a time) without changing ARTICLES_PER_PAGE. */
export async function getCategoryArticlesRange(categoryId: string, skip: number, take = 12) {
  const [articles, total] = await Promise.all([
    prisma.article.findMany({
      where: { ...published, categoryId },
      orderBy: { publishedAt: "desc" },
      include: { category: true },
      skip: Math.max(0, skip),
      take,
    }),
    prisma.article.count({ where: { ...published, categoryId } }),
  ]);
  return { articles, total };
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

// ── Admin article search ────────────────────────────────────────────────────
// Multi-field, case-insensitive, substring + word-order-tolerant search across
// title / excerpt / content / category / tags. Backed by pg_trgm GIN indexes
// (see migration 20260531140000_article_search_trgm) so the underlying ILIKE
// scans stay fast as the library grows. Correctness does not depend on the
// index — it only makes it faster.

export type ArticleSearchHit = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  coverImage: string | null;
  category: { name: string } | null;
  tags: string[];
  publishedAt: string | null;
  createdAt: string;
  /** Plain-text snippet around the best match (no markdown), match wrapped in «…». */
  snippet: string;
  /** Where the strongest match landed, for ranking + UI hinting. */
  matchedIn: "title" | "excerpt" | "category" | "tag" | "content";
};

/** Split a raw query into distinct lowercased terms (drops tiny noise tokens). */
function searchTerms(q: string): string[] {
  return Array.from(
    new Set(
      q
        .toLowerCase()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length >= 2),
    ),
  ).slice(0, 8); // cap terms to keep the query bounded
}

/** Strip the common Markdown so snippets read as prose. Mirrors editorUtils. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_~`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Build a ~160-char snippet centered on the first term hit, term wrapped in «». */
function makeSnippet(text: string, terms: string[]): string {
  const clean = plain(text);
  if (!clean) return "";
  const lower = clean.toLowerCase();
  let at = -1;
  let hit = "";
  for (const t of terms) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) {
      at = i;
      hit = t;
    }
  }
  const radius = 80;
  if (at === -1) return clean.slice(0, 160) + (clean.length > 160 ? "…" : "");
  const start = Math.max(0, at - radius);
  const end = Math.min(clean.length, at + hit.length + radius);
  const core = clean.slice(start, end);
  const highlighted = core.replace(
    new RegExp(`(${hit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"),
    "«$1»",
  );
  return (start > 0 ? "…" : "") + highlighted + (end < clean.length ? "…" : "");
}

/**
 * Admin multi-field article search. Returns relevance-ranked hits: title matches
 * rank highest, then excerpt/category/tag, then content-only — recency breaks
 * ties. `limit` caps the returned set (the DB fetch is bounded too). Distinct
 * from the public `searchArticles` (title/excerpt/content over published only).
 */
export async function searchArticlesAdmin(
  rawQuery: string,
  opts?: { limit?: number },
): Promise<ArticleSearchHit[]> {
  const terms = searchTerms(rawQuery);
  if (terms.length === 0) return [];
  const limit = Math.min(100, Math.max(1, opts?.limit ?? 50));

  // AND across terms; each term may match ANY field (word-order tolerant).
  const AND = terms.map((t) => ({
    OR: [
      { title: { contains: t, mode: "insensitive" as const } },
      { excerpt: { contains: t, mode: "insensitive" as const } },
      { content: { contains: t, mode: "insensitive" as const } },
      { category: { name: { contains: t, mode: "insensitive" as const } } },
      { tags: { some: { name: { contains: t, mode: "insensitive" as const } } } },
    ],
  }));

  const rows = await prisma.article.findMany({
    where: { AND },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      content: true,
      status: true,
      views: true,
      coverImage: true,
      publishedAt: true,
      createdAt: true,
      category: { select: { name: true } },
      tags: { select: { name: true } },
    },
    take: limit * 3, // over-fetch a little, then rank + trim in JS
  });

  const scored = rows.map((a) => {
    const title = a.title.toLowerCase();
    const excerpt = a.excerpt.toLowerCase();
    const body = a.content.toLowerCase();
    const catName = a.category?.name.toLowerCase() ?? "";
    const tagNames = a.tags.map((t) => t.name.toLowerCase());

    let score = 0;
    let matchedIn: ArticleSearchHit["matchedIn"] = "content";
    let bestField = 4; // lower = stronger field
    for (const t of terms) {
      if (title.includes(t)) { score += 100; if (bestField > 0) { bestField = 0; matchedIn = "title"; } }
      else if (excerpt.includes(t)) { score += 40; if (bestField > 1) { bestField = 1; matchedIn = "excerpt"; } }
      else if (catName.includes(t)) { score += 30; if (bestField > 2) { bestField = 2; matchedIn = "category"; } }
      else if (tagNames.some((n) => n.includes(t))) { score += 25; if (bestField > 3) { bestField = 3; matchedIn = "tag"; } }
      else if (body.includes(t)) { score += 10; }
    }
    // Whole-phrase title hit gets a strong boost (best possible match).
    if (title.includes(rawQuery.trim().toLowerCase())) score += 60;
    // Title that starts with the query ranks even higher.
    if (title.startsWith(terms[0])) score += 15;

    const snippetSource =
      matchedIn === "title" || matchedIn === "excerpt" ? a.excerpt || a.content : a.content || a.excerpt;

    return {
      hit: {
        id: a.id,
        title: a.title,
        slug: a.slug,
        status: a.status,
        views: a.views,
        coverImage: a.coverImage,
        category: a.category,
        tags: a.tags.map((t) => t.name),
        publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
        createdAt: a.createdAt.toISOString(),
        snippet: makeSnippet(snippetSource, terms),
        matchedIn,
      } satisfies ArticleSearchHit,
      score,
      recency: Date.parse(a.publishedAt?.toISOString() ?? a.createdAt.toISOString()) || 0,
    };
  });

  scored.sort((x, y) => (y.score - x.score) || (y.recency - x.recency));
  return scored.slice(0, limit).map((s) => s.hit);
}
