// Shared status pill for admin tables/lists (light theme).
export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    published: "bg-green-100 text-green-700",
    approved: "bg-green-100 text-green-700",
    pending: "bg-amber-100 text-amber-700",
    draft: "bg-gray-100 text-gray-600",
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
