import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteArticle } from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatDate, formatNumber } from "@/lib/site";

function StatusBadge({ status }: { status: string }) {
  return status === "published" ? (
    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-500/15 dark:text-green-300">
      published
    </span>
  ) : (
    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium text-fg-muted">
      draft
    </span>
  );
}

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          Articles
        </h1>
        <Link
          href="/admin/articles/new"
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-fg transition hover:opacity-90"
        >
          + New article
        </Link>
      </div>

      {articles.length === 0 ? (
        <p className="mt-8 text-fg-muted">
          No articles yet.{" "}
          <Link href="/admin/articles/new" className="text-accent-link underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-fg-faint">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {articles.map((a) => (
                <tr key={a.id} className="transition-colors hover:bg-surface-2">
                  <td className="px-4 py-3 font-medium text-fg">{a.title}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {a.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-fg-muted">
                    {formatNumber(a.views)}
                  </td>
                  <td className="px-4 py-3 text-fg-faint">
                    {a.publishedAt
                      ? formatDate(a.publishedAt)
                      : formatDate(a.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-4">
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
      )}
    </div>
  );
}
