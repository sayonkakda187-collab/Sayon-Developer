import Link from "next/link";
import { prisma } from "@/lib/db";
import {
  approveComment,
  unapproveComment,
  deleteComment,
} from "@/app/admin/actions";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { formatDate } from "@/lib/site";
import { CommentsIcon, CheckIcon } from "@/components/admin/icons";

export default async function AdminCommentsPage() {
  const comments = await prisma.comment.findMany({
    orderBy: [{ approved: "asc" }, { createdAt: "desc" }],
    include: { article: { select: { title: true, slug: true } } },
  });
  const pendingCount = comments.filter((c) => !c.approved).length;

  return (
    <div>
      <div className="adm-page-h">
        <h1>Comments</h1>
        <p>
          {comments.length === 0
            ? "Moderate reader discussion"
            : `${pendingCount} pending review`}
        </p>
      </div>

      {comments.length === 0 ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill">
              <CommentsIcon className="h-[38px] w-[38px]" />
            </div>
            <h2 className="adm-serif">No comments yet</h2>
            <p>When readers comment on your articles, they&apos;ll appear here for review.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {comments.map((c) => (
            <div key={c.id} className="adm-card adm-card-pad">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ fontWeight: 700, color: "var(--adm-ink)" }}>{c.authorName}</span>
                  <span className={`adm-pill ${c.approved ? "" : "amber"}`}>
                    {c.approved ? "Approved" : "Pending"}
                  </span>
                </div>
                <time className="adm-amt" style={{ flex: "none" }}>{formatDate(c.createdAt)}</time>
              </div>

              <p style={{ marginTop: 8, fontSize: 13.5, color: "var(--adm-ink)", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {c.content}
              </p>

              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 11, flexWrap: "wrap" }}>
                <span className="adm-amt">
                  on{" "}
                  <Link href={`/news/${c.article.slug}`} target="_blank" style={{ color: "var(--adm-muted)", textDecoration: "underline" }}>
                    {c.article.title}
                  </Link>
                </span>
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                  {c.approved ? (
                    <form action={unapproveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="adm-btn-ghost">Unapprove</button>
                    </form>
                  ) : (
                    <form action={approveComment}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="adm-btn-ghost" style={{ color: "#15803d" }}>
                        <CheckIcon className="h-4 w-4" />
                        Approve
                      </button>
                    </form>
                  )}
                  <DeleteButton
                    action={deleteComment}
                    id={c.id}
                    label="Delete"
                    className="adm-btn-ghost"
                    confirmText="Delete this comment?"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
