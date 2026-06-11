import { Link } from "next-view-transitions";
import { getMostRead } from "@/lib/queries";

/**
 * "Most Read" homepage widget — top 5 articles by views over the last 7 days,
 * ranked 1–5 with category + title. Server-rendered; the query is cached ~15 min
 * and falls back to the newest articles so it's never empty.
 */
export async function MostRead() {
  const items = await getMostRead(5);
  if (items.length === 0) return null;

  return (
    <section className="border-y border-border py-9" aria-label="Most read">
      <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Most Read</h2>
      <ol className="mt-6 grid grid-cols-1 gap-x-7 gap-y-5 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((a, i) => (
          <li key={a.id}>
            <Link href={`/news/${a.slug}`} className="group flex gap-3">
              <span aria-hidden className="font-display text-3xl font-bold leading-none text-accent/60">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-col">
                {a.category && (
                  <span className="text-[11px] font-bold uppercase tracking-wider text-accent-link">{a.category}</span>
                )}
                <span className="mt-0.5 text-pretty text-sm font-semibold leading-snug text-fg transition-colors group-hover:text-accent-link">
                  {a.title}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
