import { Link } from "next-view-transitions";

export function Pagination({
  basePath,
  page,
  pageCount,
}: {
  basePath: string;
  page: number;
  pageCount: number;
}) {
  if (pageCount <= 1) return null;

  const href = (p: number) => (p <= 1 ? basePath : `${basePath}?page=${p}`);
  const linkClass =
    "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-fg transition-colors hover:border-accent hover:text-accent-link";
  const disabledClass =
    "inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-medium text-fg-faint opacity-50";

  return (
    <nav
      className="mt-14 flex items-center justify-between border-t border-border pt-6"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link href={href(page - 1)} className={linkClass}>
          ← Newer
        </Link>
      ) : (
        <span className={disabledClass}>← Newer</span>
      )}

      <span className="text-sm text-fg-faint">
        Page {page} of {pageCount}
      </span>

      {page < pageCount ? (
        <Link href={href(page + 1)} className={linkClass}>
          Older →
        </Link>
      ) : (
        <span className={disabledClass}>Older →</span>
      )}
    </nav>
  );
}
