import Link from "next/link";
import { formatDate, formatNumber } from "@/lib/site";

// Category → accent color (Business green, Technology amber, World purple);
// anything else falls back to a neutral slate. Keeps the dashboard, the bar
// chart, and the Categories screen visually consistent.
const CATEGORY_COLORS = ["#16a34a", "#f59e0b", "#a855f7", "#2563eb", "#ef4444", "#14b8a6"];
export function categoryColor(name: string | null | undefined, fallbackIndex = 0): string {
  const n = (name ?? "").toLowerCase();
  if (n.includes("business")) return "#16a34a";
  if (n.includes("tech")) return "#f59e0b";
  if (n.includes("world")) return "#a855f7";
  if (!name) return "#94a3b8";
  return CATEGORY_COLORS[fallbackIndex % CATEGORY_COLORS.length];
}

type Row = {
  id: string;
  title: string;
  slug: string;
  status: string;
  views: number;
  category: { name: string } | null;
  publishedAt: Date | null;
  createdAt: Date;
};

/** A single article line: initial tile + title + meta row (status · category ·
 *  views · date). Links to the editor; the title initial uses the first letter. */
export function ArticleRow({ a }: { a: Row }) {
  const published = a.status === "published";
  return (
    <Link href={`/admin/articles/${a.id}/edit`} className="adm-arow">
      <span className="adm-ini">{a.title.slice(0, 1).toUpperCase()}</span>
      <span className="adm-abody">
        <span className="adm-ati" style={{ display: "block" }}>
          {a.title}
        </span>
        <span className="adm-amr">
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
        </span>
      </span>
    </Link>
  );
}
