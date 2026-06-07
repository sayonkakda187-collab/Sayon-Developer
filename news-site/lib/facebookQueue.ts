import "server-only";
import { prisma } from "@/lib/db";

/**
 * Queue pending `ScheduledPost` rows to fire on the next Vercel Cron run
 * (`scheduledFor = now`), one per page, with an optional shared caption — the
 * same table the cron runner + post history already use.
 *
 * Used by a live share job's "finish on the server" handoff: the explicit
 * button and the automatic `sendBeacon` when the admin closes the tab mid-share.
 * Returns how many rows were created; silently skips ids with no matching page
 * or a missing article.
 *
 * ⚠️ Double-post safety lives at the CALL SITES: only pages the live job has NOT
 * started are ever passed here, so each page is posted by exactly one path
 * (either the live loop or the cron — never both).
 */
export async function queuePendingShares(
  articleId: string,
  caption: string | null,
  pageDbIds: string[],
): Promise<number> {
  const ids = [...new Set((pageDbIds ?? []).filter((x): x is string => typeof x === "string" && !!x))];
  if (!articleId || ids.length === 0) return 0;

  const [article, pages] = await Promise.all([
    prisma.article.findUnique({ where: { id: articleId }, select: { id: true } }),
    prisma.facebookPage.findMany({ where: { id: { in: ids } }, select: { id: true } }),
  ]);
  if (!article || pages.length === 0) return 0;

  const cap = caption?.trim() ? caption.trim() : null;
  const when = new Date(); // due now → picked up on the next cron run
  await prisma.scheduledPost.createMany({
    data: pages.map((p) => ({
      articleId: article.id,
      facebookPageId: p.id,
      scheduledFor: when,
      caption: cap,
      status: "pending",
    })),
  });
  return pages.length;
}
