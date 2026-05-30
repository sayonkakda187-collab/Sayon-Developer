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
    <form action="/search" role="search" className={`relative ${className}`}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        // eslint-disable-next-line jsx-a11y/no-autofocus
        autoFocus={autoFocus}
        placeholder="Search articles…"
        aria-label="Search articles"
        className="w-full rounded-full border border-border bg-surface py-2 pl-9 pr-4 text-sm text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
      />
    </form>
  );
}
