import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { saveArticle } from "@/app/admin/actions";
import { ArticleForm } from "@/components/admin/ArticleForm";
import { ToastProvider } from "@/components/admin/Toast";
import { ArticleFacebookPanel } from "@/components/admin/ArticleFacebookPanel";
import { isRunnerConfigured } from "@/lib/fbRunner";

export default async function EditArticlePage({
  params,
}: {
  params: { id: string };
}) {
  const [article, categories, tags, pages, history] = await Promise.all([
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
  ]);

  if (!article) notFound();

  return (
    <ToastProvider>
      <ArticleForm
        action={saveArticle}
        categories={categories}
        tags={tags}
        article={{
          id: article.id,
          title: article.title,
          excerpt: article.excerpt,
          content: article.content,
          coverImage: article.coverImage,
          coverCredit: article.coverCredit,
          coverCreditUrl: article.coverCreditUrl,
          categoryId: article.categoryId,
          status: article.status,
          tagIds: article.tags.map((t) => t.id),
        }}
      />

      <div style={{ marginTop: 24 }}>
        <ArticleFacebookPanel
          articleId={article.id}
          articleStatus={article.status}
          pages={pages}
          runnerConfigured={isRunnerConfigured()}
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
