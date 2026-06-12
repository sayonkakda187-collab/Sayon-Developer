import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { publishArticleNow } from "@/app/admin/facebook-actions";
import { generateKeyPoints, isAiConfigured } from "@/lib/aiAssist";
import { getDefaultAiModel } from "@/lib/aiSettings";
import { addAction } from "@/lib/agent/store";

// Single chokepoint for taking an article live + its publish-time side effects
// (Key Points if empty, Facebook auto-share to the stored pages). Reused by the
// scheduler cron, the agent, the editor, and the scheduled-queue actions so
// behavior is identical everywhere and the share fires at PUBLISH time, not
// approval time.

export function parsePageIds(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const a = JSON.parse(json);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// Auto-share only fires for real in production (preview/dev share the prod DB, so
// a preview publish must never post). FACEBOOK_AUTOSHARE_ENABLED forces it on.
function autoShareAllowed(): boolean {
  return process.env.VERCEL_ENV === "production" || process.env.FACEBOOK_AUTOSHARE_ENABLED === "true";
}

/** Generate Key Points (if empty) + fire the Facebook auto-share. Best-effort —
 *  a failure never blocks/un-publishes; returns how many pages were shared to. */
export async function runPublishSideEffects(opts: {
  id: string;
  title: string;
  content: string;
  hasKeyPoints: boolean;
  sharePageIds: string[];
}): Promise<{ shared: number }> {
  if (!opts.hasKeyPoints && isAiConfigured()) {
    try {
      const model = await getDefaultAiModel();
      const points = await generateKeyPoints({ title: opts.title, body: opts.content, model });
      if (points.length > 0) {
        await prisma.article.update({ where: { id: opts.id }, data: { keyPoints: points.join("\n") } });
      }
    } catch {
      /* never block publishing on a key-points failure */
    }
  }

  let shared = 0;
  if (opts.sharePageIds.length > 0 && autoShareAllowed()) {
    try {
      const res = await publishArticleNow({ articleId: opts.id, pageDbIds: opts.sharePageIds });
      if (res.ok) shared = res.data.filter((d) => d.ok).length;
    } catch {
      /* a share failure is recorded as a failed ScheduledPost; never blocks publish */
    }
  }
  return { shared };
}

/** Move an article into the "scheduled" state (auto-publishes at `scheduledAt`).
 *  Leaves the stored Facebook share selection (autoSharePageIds) untouched — the
 *  editor sets that explicitly; the agent / queue only change the time here. */
export async function scheduleArticle(id: string, scheduledAt: Date): Promise<void> {
  await prisma.article.update({
    where: { id },
    data: { status: "scheduled", scheduledAt, publishedAt: null },
  });
  revalidatePath("/admin/articles");
  revalidatePath("/admin/scheduled");
}

export type PublishResult = {
  ok: boolean;
  published: boolean;
  alreadyLive?: boolean;
  shared?: number;
  title?: string;
  error?: string;
};

/**
 * Take a draft/scheduled article live NOW + run the publish-time side effects.
 * IDEMPOTENT: an atomic status claim means concurrent cron calls (or a re-run)
 * never double-publish or double-share. Used by the cron, the queue "Publish now",
 * and the agent.
 */
export async function publishScheduledArticleById(id: string, opts?: { logActivity?: boolean }): Promise<PublishResult> {
  const a = await prisma.article.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, content: true, keyPoints: true, status: true, scheduledAt: true, autoSharePageIds: true },
  });
  if (!a) return { ok: false, published: false, error: "Article not found." };
  if (a.status === "published") return { ok: true, published: false, alreadyLive: true, title: a.title };

  const now = new Date();
  // Use the intended scheduled time as publishedAt when it's already past (keeps
  // ordering honest even if the cron runs a few minutes late); else "now".
  const publishAt = a.scheduledAt && a.scheduledAt <= now ? a.scheduledAt : now;

  // Atomic claim — only one runner flips it out of a non-published state.
  const claim = await prisma.article.updateMany({
    where: { id, status: { not: "published" } },
    data: { status: "published", publishedAt: publishAt, scheduledAt: null },
  });
  if (claim.count === 0) return { ok: true, published: false, alreadyLive: true, title: a.title };

  const sharePageIds = parsePageIds(a.autoSharePageIds);
  const { shared } = await runPublishSideEffects({
    id,
    title: a.title,
    content: a.content,
    hasKeyPoints: Boolean(a.keyPoints),
    sharePageIds,
  });
  // Clear the stored share intent so a future re-publish never re-shares.
  await prisma.article.update({ where: { id }, data: { autoSharePageIds: null } }).catch(() => {});

  revalidatePath("/");
  revalidatePath(`/news/${a.slug}`);
  revalidatePath("/admin/articles");
  revalidatePath("/admin/scheduled");

  if (opts?.logActivity) {
    await addAction({
      type: "publish_scheduled",
      status: "done",
      summary: `Scheduled → published: ${a.title}`,
      detail: shared > 0 ? `Auto-shared to ${shared} Facebook page${shared === 1 ? "" : "s"}` : undefined,
      params: { articleId: id },
    }).catch(() => {});
  }

  return { ok: true, published: true, shared, title: a.title };
}

/** Publish every article whose scheduled time has arrived. Idempotent + capped so
 *  one run can't blow the function timeout. Logs each transition to the activity log. */
export async function publishDue(limit = 25): Promise<{ ran: number; published: number; failed: number; titles: string[]; errors: string[] }> {
  const now = new Date();
  const due = await prisma.article.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const titles: string[] = [];
  const errors: string[] = [];
  let published = 0;
  for (const { id } of due) {
    try {
      const r = await publishScheduledArticleById(id, { logActivity: true });
      if (r.published) {
        published++;
        if (r.title) titles.push(r.title);
      }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "Publish failed.");
    }
  }
  return { ran: due.length, published, failed: errors.length, titles, errors };
}
