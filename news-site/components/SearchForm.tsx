// Plain GET form — submitting navigates to /search?q=…, no client JS required.
export function SearchForm({
  defaultValue = "",
  className = "",
  autoFocus = false,
}: {
  defaultValue?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  return (
    <form action="/search" role="search" className={className}>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        placeholder="Search articles…"
        aria-label="Search articles"
        className="w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900"
      />
    </form>
  );
}
