import "server-only";

import { prisma } from "@/lib/db";
import { articleUrl } from "@/lib/facebookPublish";
import { siteConfig } from "@/lib/site";

// Opt-in "auto-share on publish": when an article is newly published AND this is
// enabled, stagger one ScheduledPost row per selected page (page i at now + i·delay)
// and let the existing /api/cron/facebook-post runner post them. DEFAULT OFF.
// Settings live in the AppSetting key-value store (server-side only).

const KEYS = {
  enabled: "fb_autoshare_enabled",
  delay: "fb_autoshare_delay_min",
  pages: "fb_autoshare_page_ids", // JSON array of FacebookPage.id; absent/"all" = all
  caption: "fb_autoshare_caption", // optional template
} as const;

export const DEFAULT_DELAY_MIN = 5;
export const DEFAULT_CAPTION_TEMPLATE = "{title}\n\n{hook}\n\nRead more on {site}:\n{link}";

export type AutoShareSettings = {
  enabled: boolean;
  delayMinutes: number;
  pageIds: string[] | null; // null = all connected pages
  captionTemplate: string; // never empty (falls back to default)
};

export async function getAutoShareSettings(): Promise<AutoShareSettings> {
  const rows = await prisma.appSetting.findMany({
    where: { key: { in: [KEYS.enabled, KEYS.delay, KEYS.pages, KEYS.caption] } },
  });
  const v = new Map(rows.map((r) => [r.key, r.value]));

  const delay = parseInt(v.get(KEYS.delay) ?? "", 10);
  let pageIds: string[] | null = null;
  const rawPages = v.get(KEYS.pages);
  if (rawPages && rawPages !== "all") {
    try {
      const parsed = JSON.parse(rawPages);
      if (Array.isArray(parsed)) pageIds = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      pageIds = null;
    }
  }
  const caption = (v.get(KEYS.caption) ?? "").trim();

  return {
    enabled: v.get(KEYS.enabled) === "1",
    delayMinutes: Number.isFinite(delay) && delay >= 0 ? Math.min(720, delay) : DEFAULT_DELAY_MIN,
    pageIds: pageIds && pageIds.length ? pageIds : null,
    captionTemplate: caption || DEFAULT_CAPTION_TEMPLATE,
  };
}

export async function saveAutoShareSettings(input: {
  enabled?: boolean;
  delayMinutes?: number;
  pageIds?: string[] | null;
  captionTemplate?: string | null;
}): Promise<void> {
  const ops: Promise<unknown>[] = [];
  const set = (key: string, value: string) =>
    prisma.appSetting.upsert({
      where: { key },
      update: { value, encrypted: false },
      create: { key, value, encrypted: false },
    });

  if (input.enabled !== undefined) ops.push(set(KEYS.enabled, input.enabled ? "1" : "0"));
  if (input.delayMinutes !== undefined) {
    const d = Math.max(0, Math.min(720, Math.round(input.delayMinutes)));
    ops.push(set(KEYS.delay, String(d)));
  }
  if (input.pageIds !== undefined) {
    ops.push(set(KEYS.pages, input.pageIds && input.pageIds.length ? JSON.stringify(input.pageIds) : "all"));
  }
  if (input.captionTemplate !== undefined) {
    ops.push(set(KEYS.caption, (input.captionTemplate ?? "").trim()));
  }
  await Promise.all(ops);
}

/** Render the caption template for an article (tokens: {title} {hook}/{excerpt}
 *  {link} {site}). */
export function renderCaption(template: string, article: { title: string; excerpt: string; slug: string }): string {
  const tpl = template.trim() || DEFAULT_CAPTION_TEMPLATE;
  return tpl
    .replace(/\{title\}/g, article.title)
    .replace(/\{hook\}/g, article.excerpt)
    .replace(/\{excerpt\}/g, article.excerpt)
    .replace(/\{link\}/g, articleUrl(article.slug))
    .replace(/\{site\}/g, siteConfig.name)
    .trim();
}

/**
 * Enqueue staggered ScheduledPost rows for a newly-published article when
 * auto-share is ON. Idempotent: no-ops if the article was already auto-shared
 * (`autoSharedAt` set) or isn't published. Returns how many pages were enqueued.
 * Never throws — auto-share must never break the publish action.
 */
export async function autoShareOnPublish(articleId: string): Promise<{ enqueued: number }> {
  try {
    const settings = await getAutoShareSettings();
    if (!settings.enabled) return { enqueued: 0 };

    const article = await prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, title: true, slug: true, excerpt: true, status: true, autoSharedAt: true },
    });
    if (!article || article.status !== "published" || article.autoSharedAt) return { enqueued: 0 };

    const pages = settings.pageIds
      ? await prisma.facebookPage.findMany({ where: { id: { in: settings.pageIds } } })
      : await prisma.facebookPage.findMany();
    if (pages.length === 0) return { enqueued: 0 };

    const ordered = [...pages].sort((a, b) => a.pageName.localeCompare(b.pageName));
    const caption = renderCaption(settings.captionTemplate, article);
    const now = Date.now();
    const stepMs = Math.max(0, settings.delayMinutes) * 60_000;

    await prisma.$transaction([
      prisma.scheduledPost.createMany({
        data: ordered.map((p, i) => ({
          articleId: article.id,
          facebookPageId: p.id,
          scheduledFor: new Date(now + i * stepMs),
          caption,
          status: "pending",
        })),
      }),
      prisma.article.update({ where: { id: article.id }, data: { autoSharedAt: new Date() } }),
    ]);

    return { enqueued: ordered.length };
  } catch {
    // Never let auto-share break publishing.
    return { enqueued: 0 };
  }
}
