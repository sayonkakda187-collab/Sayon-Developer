import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { saveArticle } from "@/app/admin/actions";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { ToastProvider } from "@/components/admin/Toast";
import { ArticleFacebookPanel } from "@/components/admin/ArticleFacebookPanel";
import { isRunnerConfigured } from "@/lib/fbRunner";
import { buildMessage } from "@/lib/facebookPublish";

// Browser-runner actions (discover Pages, post each Page) drive a real browser on
// the runner and can take 20–40s each — give server actions on this route room to
// finish instead of the 10s default (60s is the Vercel Hobby ceiling).
export const maxDuration = 60;

export default async function EditArticlePage({
  params,
}: {
  params: { id: string };
}) {
  const [article, categories, tags, pages, history, sessions] = await Promise.all([
    prisma.article.findUnique({
      where: { id: params.id },
      include: { tags: { select: { id: true } } },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
    prisma.facebookPage.findMany({
      orderBy: [{ categoryGroup: "asc" }, { pageName: "asc" }],
      select: { id: true, pageName: true, categoryGroup: true, status: true },
    }),
    prisma.scheduledPost.findMany({
      where: { articleId: params.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { facebookPage: { select: { pageName: true } } },
    }),
    // Saved browser sessions to offer when posting via the runner (metadata only).
    prisma.facebookSession.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, label: true, accountName: true, status: true },
    }),
  ]);

  if (!article) notFound();

  // Auto-share fires only in production (preview/dev share the prod DB, so a
  // preview publish must never post). FACEBOOK_AUTOSHARE_ENABLED forces it on for
  // a deliberate test. This just drives the UI note; saveArticle re-checks server-side.
  const autoShareActive =
    process.env.VERCEL_ENV === "production" || process.env.FACEBOOK_AUTOSHARE_ENABLED === "true";

  return (
    <ToastProvider>
      <ArticleForm
        action={saveArticle}
        categories={categories}
        tags={tags}
        fbPages={pages}
        autoShareActive={autoShareActive}
        article={{
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          keyPoints: article.keyPoints,
          coverImage: article.coverImage,
          coverCredit: article.coverCredit,
          coverCreditUrl: article.coverCreditUrl,
          coverImageSource: article.coverImageSource,
          scheduledAt: article.scheduledAt ? article.scheduledAt.toISOString() : null,
          categoryId: article.categoryId,
          status: article.status,
          tagIds: article.tags.map((t) => t.id),
        }}
      />

      <div style={{ marginTop: 24 }}>
        <ArticleFacebookPanel
          articleId={article.id}
          articleStatus={article.status}
          defaultCaption={buildMessage({ title: article.title, excerpt: article.excerpt })}
          pages={pages}
          runnerConfigured={isRunnerConfigured()}
          runnerSessions={sessions}
          history={history.map((h) => ({
            id: h.id,
            pageName: h.facebookPage?.pageName ?? "(deleted page)",
            status: h.status,
            scheduledFor: h.scheduledFor.toISOString(),
            postedAt: h.postedAt ? h.postedAt.toISOString() : null,
            error: h.error,
            graphPostId: h.graphPostId,
          }))}
        />
      </div>
    </ToastProvider>
  );
}
