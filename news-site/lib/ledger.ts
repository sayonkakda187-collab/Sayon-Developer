import type { ArticleWithCategory } from "@/lib/queries";
import { timeAgo } from "@/lib/site";

/** The shape the editorial homepage components consume (serializable — safe to
 *  pass to client components, no Date objects). */
export type LedgerStory = {
  cat: string;
  title: string;
  deck: string;
  img: string | null;
  time: string;
  href: string;
};

/** Desk (section) names that have a dedicated color in the design tokens. */
const DESK = new Set(["world", "business", "sports", "technology"]);

/** Map a category name to its desk-color class (sets `--tl-cat`); falls back to
 *  "" so the kicker/chip/underline uses the accent. Pure — safe on the client. */
export function deskClass(name?: string | null): string {
  const key = (name ?? "").toLowerCase();
  return DESK.has(key) ? `tl-cat-${key}` : "";
}

/** Project a published article into the editorial card/story shape (server-side;
 *  resolves the relative timestamp here so client components stay serializable). */
export function toLedgerStory(a: ArticleWithCategory): LedgerStory {
  return {
    cat: a.category?.name ?? "News",
    title: a.title,
    deck: a.excerpt ?? "",
    img: a.coverImage ?? null,
    time: timeAgo(a.publishedAt),
    href: `/news/${a.slug}`,
  };
}
