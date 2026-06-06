"use server";

import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getCountryStats, type CountryStat } from "@/lib/queries";

// Admin-only: visitor-country stats for the Audience dashboard. Returns mapped
// counts only (no IP/PII is ever stored or returned).
export async function getAudienceStats(input: {
  articleId?: string;
  days?: number;
}): Promise<{ stats: CountryStat[]; total: number }> {
  await requireAdmin();
  const days = input.days && input.days > 0 ? Math.min(3650, Math.round(input.days)) : 0;
  const articleId = input.articleId?.trim() || undefined;
  return getCountryStats({ articleId, days });
}

// "Live readers" = reads in the last 5 minutes (a standard real-time proxy).
const LIVE_WINDOW_MS = 5 * 60 * 1000;

export type LiveReader = { id: string; title: string; slug: string; countryCode: string; secondsAgo: number };
export type LiveData = {
  active: number; // reads in the live window
  countries: { countryCode: string; count: number }[];
  topArticles: { title: string; slug: string; count: number }[];
  feed: LiveReader[];
};

// Admin-only real-time snapshot for the Audience "Live readers" panel. Counts +
// a short feed of recent reads (country + article), no IP/PII. Degrades to an
// empty snapshot if the live table isn't there yet (pre-migration).
export async function getLiveReaders(): Promise<LiveData> {
  await requireAdmin();
  const now = Date.now();
  const since = new Date(now - LIVE_WINDOW_MS);
  try {
    const [active, rows] = await Promise.all([
      prisma.recentView.count({ where: { createdAt: { gte: since } } }),
      prisma.recentView.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        take: 150,
        select: { id: true, countryCode: true, createdAt: true, article: { select: { title: true, slug: true } } },
      }),
    ]);

    const byCountry = new Map<string, number>();
    const byArticle = new Map<string, { title: string; slug: string; count: number }>();
    for (const r of rows) {
      byCountry.set(r.countryCode, (byCountry.get(r.countryCode) ?? 0) + 1);
      const a = byArticle.get(r.article.slug) ?? { title: r.article.title, slug: r.article.slug, count: 0 };
      a.count++;
      byArticle.set(r.article.slug, a);
    }

    return {
      active,
      countries: [...byCountry.entries()]
        .map(([countryCode, count]) => ({ countryCode, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8),
      topArticles: [...byArticle.values()].sort((a, b) => b.count - a.count).slice(0, 6),
      feed: rows.slice(0, 14).map((r) => ({
        id: r.id,
        title: r.article.title,
        slug: r.article.slug,
        countryCode: r.countryCode,
        secondsAgo: Math.max(0, Math.round((now - r.createdAt.getTime()) / 1000)),
      })),
    };
  } catch {
    return { active: 0, countries: [], topArticles: [], feed: [] };
  }
}
