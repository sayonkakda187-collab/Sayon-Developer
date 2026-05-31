import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticlesList } from "@/components/admin/ArticlesList";
import { ToastProvider } from "@/components/admin/Toast";
import { PlusIcon } from "@/components/admin/icons";

export const dynamic = "force-dynamic";

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams?: { q?: string; published?: string };
}) {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  // After publishing, saveArticle redirects here with ?published={id} so the
  // Share panel auto-opens. Only honor it for a genuinely published article.
  const publishedParam = (searchParams?.published ?? "").trim();
  const initialPublishedId =
    publishedParam && articles.some((a) => a.id === publishedParam && a.status === "published")
      ? publishedParam
      : undefined;

  const publishedCount = articles.filter((a) => a.status === "published").length;
  const categories = Array.from(
    new Set(articles.map((a) => a.category?.name).filter((n): n is string => !!n)),
  ).sort();

  const initialQuery = (searchParams?.q ?? "").trim();

  // Serialize Dates → strings for the client list component.
  const items = articles.map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    status: a.status,
    views: a.views,
    category: a.category ? { name: a.category.name } : null,
    publishedAt: a.publishedAt ? a.publishedAt.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
  }));

  return (
    <div>
      <div
        className="adm-page-h"
        style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}
      >
        <div>
          <h1>Articles</h1>
          <p>
            {articles.length} article{articles.length === 1 ? "" : "s"} · {publishedCount} published
          </p>
        </div>
        <Link
          href="/admin/articles/new"
          className="adm-btn-primary"
          style={{ flex: "none", padding: "9px 14px" }}
        >
          <PlusIcon className="h-[15px] w-[15px]" />
          New
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="adm-card adm-card-pad" style={{ textAlign: "center", padding: 30 }}>
          <p className="adm-card-sub">
            No articles yet.{" "}
            <Link href="/admin/articles/new" className="adm-link" style={{ display: "inline" }}>
              Create the first one
            </Link>
            .
          </p>
        </div>
      ) : (
        <ToastProvider>
          <ArticlesList
            items={items}
            categories={categories}
            initialQuery={initialQuery}
            initialPublishedId={initialPublishedId}
          />
        </ToastProvider>
      )}
    </div>
  );
}
