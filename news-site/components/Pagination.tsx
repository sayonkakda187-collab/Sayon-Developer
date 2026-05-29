import Link from "next/link";

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

  return (
    <nav
      className="mt-12 flex items-center justify-between border-t border-gray-200 pt-6"
      aria-label="Pagination"
    >
      {page > 1 ? (
        <Link
          href={href(page - 1)}
          className="text-sm font-medium text-gray-700 hover:text-red-700"
        >
          ← Newer
        </Link>
      ) : (
        <span className="text-sm text-gray-300">← Newer</span>
      )}

      <span className="text-sm text-gray-500">
        Page {page} of {pageCount}
      </span>

      {page < pageCount ? (
        <Link
          href={href(page + 1)}
          className="text-sm font-medium text-gray-700 hover:text-red-700"
        >
          Older →
        </Link>
      ) : (
        <span className="text-sm text-gray-300">Older →</span>
      )}
    </nav>
  );
}
