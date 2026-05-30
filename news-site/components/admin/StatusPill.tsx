// Shared status pill for admin tables/lists.
export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    approved:
      "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300",
    pending:
      "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    draft: "bg-gray-100 text-gray-600 dark:bg-white/10 dark:text-gray-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
        styles[status] ?? styles.draft
      }`}
    >
      {status}
    </span>
  );
}
