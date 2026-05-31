import { prisma } from "@/lib/db";
import { saveArticle } from "@/app/admin/actions";
import { ArticleForm } from "@/components/admin/ArticleForm";

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: { title?: string; ref?: string };
}) {
  const [categories, tags] = await Promise.all([
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" } }),
  ]);

  // Optional pre-fill when arriving from "Write article about this" on the
  // Trending News page. We seed ONLY a working title and a research note that
  // links back to the source — never the source's article text. The writer
  // produces original content and deletes the note before publishing.
  const prefillTitle = (searchParams.title ?? "").trim().slice(0, 200);
  const sourceUrl = (searchParams.ref ?? "").trim();
  const isHttp = /^https?:\/\//i.test(sourceUrl);

  let initialContent: string | undefined;
  if (prefillTitle || isHttp) {
    const lines = [
      "<!-- ✍️ Write an original article in your own words about this topic.",
      "     Do NOT copy text from the source — summarize the facts and add your own reporting.",
    ];
    if (isHttp) {
      lines.push(`     🔗 Source (for research only — delete before publishing): ${sourceUrl}`);
    }
    lines.push("     Delete this note when you’re done. -->", "", "");
    initialContent = lines.join("\n");
  }

  const initial =
    prefillTitle || initialContent
      ? { title: prefillTitle || undefined, content: initialContent }
      : undefined;

  return (
    <ArticleForm
      action={saveArticle}
      categories={categories}
      tags={tags}
      initial={initial}
    />
  );
}
