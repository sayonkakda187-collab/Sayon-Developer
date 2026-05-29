import Link from "next/link";
import { prisma } from "@/lib/db";
import { deleteArticle } from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatDate, formatNumber } from "@/lib/site";

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold">Articles</h1>
        <Link
          href="/admin/articles/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          + New article
        </Link>
      </div>

      {articles.length === 0 ? (
        <p className="mt-8 text-gray-600">
          No articles yet.{" "}
          <Link href="/admin/articles/new" className="text-red-700 underline">
            Create the first one
          </Link>
          .
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articles.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium">{a.title}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.status === "published"
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {a.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {a.category?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                    {formatNumber(a.views)}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
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
                          className="text-sm text-gray-500 hover:text-gray-900"
                        >
                          View
                        </Link>
                      )}
                      <Link
                        href={`/admin/articles/${a.id}/edit`}
                        className="text-sm font-medium text-gray-700 hover:text-gray-900"
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
