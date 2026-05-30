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
        <h1 className="font-display text-2xl font-bold tracking-tight text-fg">
          Comments
        </h1>
        <span className="text-sm text-fg-faint">{pendingCount} pending</span>
      </div>

      {comments.length === 0 ? (
        <p className="mt-8 text-fg-muted">No comments yet.</p>
      ) : (
        <ul className="mt-6 space-y-4">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border border-border bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{c.authorName}</span>
                  {c.approved ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-500/15 dark:text-green-300">
                      approved
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                      pending
                    </span>
                  )}
                </div>
                <time className="text-xs text-fg-faint">
                  {formatDate(c.createdAt)}
                </time>
              </div>

              <p className="mt-2 whitespace-pre-wrap text-sm text-fg-muted">
                {c.content}
              </p>

              <div className="mt-3 flex flex-wrap items-center gap-4 text-sm">
                <span className="text-fg-faint">
                  on{" "}
                  <Link
                    href={`/news/${c.article.slug}`}
                    target="_blank"
                    className="text-fg-muted hover:underline"
                  >
                    {c.article.title}
                  </Link>
                </span>
                <div className="ml-auto flex items-center gap-4">
                  {c.approved ? (
                    <form action={unapproveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="font-medium text-fg-muted transition-colors hover:text-fg">
                        Unapprove
                      </button>
                    </form>
                  ) : (
                    <form action={approveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button className="font-medium text-green-600 transition-colors hover:text-green-700 dark:text-green-400 dark:hover:text-green-300">
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
