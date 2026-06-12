import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { publishArticleToPage } from "@/lib/facebookPublish";
import { getFbShareSettings } from "@/lib/facebookShareSettings";
import { isShareMode } from "@/lib/facebookShareTemplates";

// Always run dynamically on the server (never statically cached): this route
// mutates the DB and calls the Graph API.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Cap how many due posts we drain per invocation so a backlog can't blow past
// the function timeout (Graph calls are sequential). The next cron tick handles
// the remainder. Tune if you schedule large bursts.
const MAX_PER_RUN = 25;

/**
 * Authorize the caller. Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`
 * when CRON_SECRET is configured; we also accept it via an `x-cron-secret`
 * header for manual testing. If CRON_SECRET is unset in production we refuse
 * (fail closed) so the endpoint can't be triggered by outsiders.
 */
function authorize(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    // No secret configured: allow only outside production (local testing).
    return process.env.NODE_ENV !== "production";
  }
  const auth = req.headers.get("authorization");
  const headerSecret = req.headers.get("x-cron-secret");
  return auth === `Bearer ${secret}` || headerSecret === secret;
}

async function runDuePosts() {
  const now = new Date();
  // Templates for photo-mode shares (the per-row mode is stored on each post).
  const shareSettings = await getFbShareSettings();

  // Find due, still-pending posts.
  const due = await prisma.scheduledPost.findMany({
    where: { status: "pending", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: MAX_PER_RUN,
    select: { id: true },
  });

  const processed: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const { id } of due) {
    // Atomically CLAIM this row (pending → posting). If another concurrent run
    // already claimed it, updateMany affects 0 rows and we skip — this is what
    // makes the runner idempotent and prevents double-posting.
    const claim = await prisma.scheduledPost.updateMany({
      where: { id, status: "pending" },
      data: { status: "posting" },
    });
    if (claim.count === 0) continue;

    const post = await prisma.scheduledPost.findUnique({
      where: { id },
      include: {
        article: { select: { id: true, title: true, slug: true, excerpt: true, coverImage: true, coverCredit: true, coverImageSource: true } },
        facebookPage: true,
      },
    });

    // Article or page deleted after scheduling → mark failed, don't crash.
    if (!post || !post.article || !post.facebookPage) {
      await prisma.scheduledPost
        .update({
          where: { id },
          data: { status: "failed", error: "Article or page no longer exists." },
        })
        .catch(() => {});
      processed.push({ id, ok: false, error: "Article or page no longer exists." });
      continue;
    }

    try {
      const shareConfig = {
        mode: isShareMode(post.mode) ? post.mode : "link",
        caption: post.caption ?? undefined,
        captionTemplate: shareSettings.captionTemplate,
        commentTemplate: shareSettings.commentTemplate,
      };
      const result = await publishArticleToPage(post.article, post.facebookPage, shareConfig);
      await prisma.scheduledPost.update({
        where: { id },
        data: result.ok
          ? {
              status: "posted",
              postedAt: new Date(),
              graphPostId: result.graphPostId ?? null,
              error: null,
              mode: result.mode ?? null,
              commentId: result.commentId ?? null,
              commentError: result.commentError ?? null,
            }
          : { status: "failed", error: result.error ?? "Unknown error." },
      });
      processed.push({ id, ok: result.ok, error: result.ok ? undefined : result.error });
    } catch (e) {
      // Last-resort guard: never let one bad post abort the whole run.
      const message = e instanceof Error ? e.message : "Unexpected error.";
      await prisma.scheduledPost
        .update({ where: { id }, data: { status: "failed", error: message } })
        .catch(() => {});
      processed.push({ id, ok: false, error: message });
    }
  }

  return {
    ranAt: now.toISOString(),
    due: due.length,
    processed: processed.length,
    succeeded: processed.filter((p) => p.ok).length,
    failed: processed.filter((p) => !p.ok).length,
  };
}

export async function GET(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDuePosts();
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Cron run failed." },
      { status: 500 },
    );
  }
}

// Allow POST too (some schedulers prefer it); same auth + behavior.
export const POST = GET;
