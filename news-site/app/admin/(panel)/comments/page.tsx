import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  approveComment,
  unapproveComment,
  deleteComment,
} from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { StatusPill } from "@/components/admin/StatusPill";
import { formatDate } from "@/lib/site";

export default async function AdminCommentsPage() {
  const comments = await prisma.comment.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    include: { article: { select: { title: true, slug: true } } },
  });
  const pendingCount = comments.filter((c) => !c.approved).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comments</h1>
        <p className="mt-1 text-sm text-fg-muted">{pendingCount} pending review</p>
      </div>

      {comments.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-sm">
          <p className="text-fg-muted">No comments yet.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-xl border border-border bg-surface p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-fg">{c.authorName}</span>
                  <StatusPill status={c.approved ? "approved" : "pending"} />
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
                      <button className="font-medium text-green-700 transition-colors hover:text-green-800">
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
