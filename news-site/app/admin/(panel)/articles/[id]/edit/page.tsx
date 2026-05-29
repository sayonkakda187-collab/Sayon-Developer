import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { saveArticle } from "@/app/admin/actions";
import { ArticleForm } from "@/components/admin/ArticleForm";

export default async function EditArticlePage({
  params,
}: {
  params: { id: string };
}) {
  const [article, categories, tags] = await Promise.all([
    prisma.article.findUnique({
      where: { id: params.id },
      include: { tags: { select: { id: true } } },
    }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!article) notFound();

  return (
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
        categoryId: article.categoryId,
        status: article.status,
        tagIds: article.tags.map((t) => t.id),
      }}
    />
  );
}
