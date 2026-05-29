import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  approveComment,
  unapproveComment,
  deleteComment,
} from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatDate } from "@/lib/site";

export default async function AdminCommentsPage() {
  const comments = await prisma.comment.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    include: { article: { select: { title: true, slug: true } } },
  });
  const pendingCount = comments.filter((c) => !c.approved).length;

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold">Comments</h1>
        <span className="text-sm text-gray-500">{pendingCount} pending</span>
      </div>

      {comments.length === 0 ? (
        <p className="mt-8 text-gray-600">No comments yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-lg border border-gray-200 bg-white p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{c.authorName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      c.approved
                        ? "bg-green-100 text-green-800"
                        : "bg-yellow-100 text-yellow-800"
                    }`}
                  >
                    {c.approved ? "approved" : "pending"}
                  </span>
                </div>
                <time className="text-xs text-gray-400">
                  {formatDate(c.createdAt)}
                </time>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-gray-700">
                {c.content}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span className="text-gray-400">
                  on{" "}
                  <Link
                    href={`/news/${c.article.slug}`}
                    target="_blank"
                    className="text-gray-600 hover:underline"
                  >
                    {c.article.title}
                  </Link>
                </span>
                <div className="ml-auto flex items-center gap-4">
                  {c.approved ? (
                    <form action={unapproveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="font-medium text-gray-600 hover:text-gray-900">
                        Unapprove
                      </button>
                    </form>
                  ) : (
                    <form action={approveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="font-medium text-green-700 hover:underline">
                        Approve
                      </button>
                    </form>
                  )}
                  <DeleteButton
                    action={deleteComment}
                    id={c.id}
                    confirmText="Delete this comment?"
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
