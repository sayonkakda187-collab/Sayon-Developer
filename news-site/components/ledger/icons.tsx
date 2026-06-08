/** The nudging arrow used by "Read full story →" / "Read story →" links. */
export function ArrowRight({ small = false }: { small?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 12"
      width={small ? 22 : 26}
      height={small ? 11 : 13}
      fill="none"
      stroke="currentColor"
      strokeWidth={small ? 1.6 : 1.5}
      aria-hidden
    >
      <path d="M0 6h22M17 1l5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
