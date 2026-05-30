import Link from "next/link";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { deleteArticle } from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { StatusPill } from "@/components/admin/StatusPill";
import { formatDate, formatNumber } from "@/lib/site";

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Articles</h1>
          <p className="mt-1 text-sm text-fg-muted">{articles.length} total</p>
        </div>
        <Link
          href="/admin/articles/new"
          className="btn-primary inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition"
        >
          <Plus className="h-4 w-4" />
          New Article
        </Link>
      </div>

      {articles.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-fg-muted">
            No articles yet.{" "}
            <Link href="/admin/articles/new" className="text-fg underline">
              Create the first one
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          {/* Mobile: tap-friendly cards */}
          <ul className="space-y-3 sm:hidden">
            {articles.map((a) => (
              <li
                key={a.id}
                className="rounded-xl border border-border bg-surface p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/admin/articles/${a.id}/edit`}
                    className="font-semibold text-fg"
                  >
                    {a.title}
                  </Link>
                  <StatusPill status={a.status} />
                </div>
                <p className="mt-1.5 text-xs text-fg-faint">
                  {a.category?.name ?? "Uncategorized"} · {formatNumber(a.views)}{" "}
                  views ·{" "}
                  {a.publishedAt
                    ? formatDate(a.publishedAt)
                    : formatDate(a.createdAt)}
                </p>
                <div className="mt-3 flex items-center gap-2">
                  <Link
                    href={`/admin/articles/${a.id}/edit`}
                    className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-fg"
                  >
                    Edit
                  </Link>
                  {a.status === "published" && (
                    <Link
                      href={`/news/${a.slug}`}
                      target="_blank"
                      className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-border text-sm font-medium text-fg"
                    >
                      View
                    </Link>
                  )}
                  <DeleteButton
                    action={deleteArticle}
                    id={a.id}
                    className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-border px-4 text-sm font-medium text-red-600"
                  />
                </div>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border border-border bg-surface shadow-sm sm:block">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-fg-faint">
                  <tr>
                    <th className="px-5 py-3 font-medium">Title</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">Category</th>
                    <th className="px-5 py-3 text-right font-medium">Views</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {articles.map((a) => (
                    <tr key={a.id} className="transition-colors hover:bg-surface-2">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-xs font-bold uppercase text-gray-500">
                            {a.title.slice(0, 1)}
                          </span>
                          <span className="line-clamp-1 font-medium text-fg">
                            {a.title}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        <StatusPill status={a.status} />
                      </td>
                      <td className="px-5 py-3 text-fg-muted">
                        {a.category?.name ?? "—"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-fg-muted">
                        {formatNumber(a.views)}
                      </td>
                      <td className="px-5 py-3 text-fg-faint">
                        {a.publishedAt
                          ? formatDate(a.publishedAt)
                          : formatDate(a.createdAt)}
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex items-center justify-end gap-3">
                          {a.status === "published" && (
                            <Link
                              href={`/news/${a.slug}`}
                              target="_blank"
                              className="text-fg-faint transition-colors hover:text-fg"
                            >
                              View
                            </Link>
                          )}
                          <Link
                            href={`/admin/articles/${a.id}/edit`}
                            className="font-medium text-fg-muted transition-colors hover:text-fg"
                          >
                            Edit
                          </Link>
                          <DeleteButton action={deleteArticle} id={a.id} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
