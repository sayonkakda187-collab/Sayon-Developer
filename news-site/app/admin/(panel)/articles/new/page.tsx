import { prisma } from "@/lib/db";
import { saveArticle } from "@/app/admin/actions";
import { ArticleForm } from "@/components/admin/ArticleForm";

export default async function NewArticlePage() {
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  return <ArticleForm action={saveArticle} categories={categories} tags={tags} />;
}
