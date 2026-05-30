"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/site";
import { DeleteButton } from "@/components/admin/DeleteButton";
import { PencilIcon, EyeIcon } from "@/components/admin/icons";

type Item = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  category: { name: string } | null;
  publishedAt: string | null;
  createdAt: string;
};

const STATUS_FILTERS = ["All", "Published", "Drafts"] as const;

/** Article list with horizontal filter chips (status + category). Pure
 *  client-side filtering over the rows passed from the server. */
export function ArticlesList({
  items,
  categories,
  deleteAction,
}: {
  items: Item[];
  categories: string[];
  deleteAction: (formData: FormData) => void | Promise<void>;
}) {
  const [filter, setFilter] = useState<string>("All");
  const chips = [...STATUS_FILTERS, ...categories];

  const shown = useMemo(() => {
    if (filter === "All") return items;
    if (filter === "Published") return items.filter((a) => a.status === "published");
    if (filter === "Drafts") return items.filter((a) => a.status === "draft");
    return items.filter((a) => a.category?.name === filter);
  }, [items, filter]);

  return (
    <>
      <div className="adm-filterbar">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            className={`adm-fchip ${filter === c ? "on" : ""}`}
            onClick={() => setFilter(c)}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="adm-card adm-card-pad">
        {shown.length === 0 ? (
          <p className="adm-card-sub" style={{ padding: "8px 0" }}>
            No articles in “{filter}”.
          </p>
        ) : (
          shown.map((a) => {
            const published = a.status === "published";
            return (
              <div key={a.id} className="adm-arow">
                <span className="adm-ini">{a.title.slice(0, 1).toUpperCase()}</span>
                <div className="adm-abody">
                  <Link href={`/admin/articles/${a.id}/edit`} className="adm-ati" style={{ display: "block" }}>
                    {a.title}
                  </Link>
                  <div className="adm-amr">
                    <span className={`adm-pill ${published ? "" : "amber"}`}>
                      {published ? "Published" : "Draft"}
                    </span>
                    {a.category && (
                      <>
                        <span className="adm-dotsep" />
                        <span className="adm-amt">{a.category.name}</span>
                      </>
                    )}
                    <span className="adm-dotsep" />
                    <span className="adm-amt">{formatNumber(a.views)} views</span>
                    <span className="adm-dotsep" />
                    <span className="adm-amt">{formatDate(a.publishedAt ?? a.createdAt)}</span>
                  </div>
                </div>
                <div className="adm-rowact">
                  <Link href={`/admin/articles/${a.id}/edit`} aria-label={`Edit ${a.title}`}>
                    <PencilIcon className="h-[18px] w-[18px]" />
                  </Link>
                  {published && (
                    <Link href={`/news/${a.slug}`} target="_blank" aria-label={`View ${a.title}`}>
                      <EyeIcon className="h-[18px] w-[18px]" />
                    </Link>
                  )}
                  <DeleteButton
                    action={deleteAction}
                    id={a.id}
                    label={<TrashGlyph />}
                    className="adm-del"
                    confirmText={`Delete “${a.title}”? This cannot be undone.`}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function TrashGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}
