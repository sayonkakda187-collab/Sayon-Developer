// Line icons (Lucide/Feather style, ~1.9px stroke) used across the admin
// dashboard. Inlined so the exact stroke/weight matches the design handoff.
type P = { className?: string };
const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.9,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const BookIcon = (p: P) => (
  <svg {...base} strokeWidth={2.2} className={p.className} aria-hidden>
    <path d="M4 19.5V6a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v13.5" />
    <path d="M17 7h2a2 2 0 0 1 2 2v9a1.5 1.5 0 0 1-3 0V7" />
    <path d="M7 8h7M7 12h7M7 16h4" />
  </svg>
);
export const BellIcon = (p: P) => (
  <svg {...base} strokeWidth={1.8} className={p.className} aria-hidden>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
export const SearchIcon = (p: P) => (
  <svg {...base} strokeWidth={2} className={p.className} aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3-3" />
  </svg>
);
export const CalendarIcon = (p: P) => (
  <svg {...base} strokeWidth={2} className={p.className} aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);
export const PlusIcon = (p: P) => (
  <svg {...base} strokeWidth={2.4} className={p.className} aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const HamburgerIcon = (p: P) => (
  <svg {...base} strokeWidth={2} className={p.className} aria-hidden>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
);
export const CloseIcon = (p: P) => (
  <svg {...base} strokeWidth={2} className={p.className} aria-hidden>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
export const DashboardIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);
export const ArticlesIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </svg>
);
export const CategoriesIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M20.6 13.4 11 3.8a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8Z" />
    <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
  </svg>
);
export const CommentsIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
  </svg>
);
export const ExternalLinkIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
    <path d="M10 17 15 12 10 7M15 12H3" />
  </svg>
);
export const LogOutIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </svg>
);
export const PencilIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
export const TrashIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);
export const EyeIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);
export const CheckIcon = (p: P) => (
  <svg {...base} strokeWidth={2.2} className={p.className} aria-hidden>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
export const RefreshIcon = (p: P) => (
  <svg {...base} strokeWidth={2} className={p.className} aria-hidden>
    <path d="M21 12a9 9 0 1 1-2.64-6.36" />
    <path d="M21 3v6h-6" />
  </svg>
);
export const ChevronDownIcon = (p: P) => (
  <svg {...base} strokeWidth={2.4} className={p.className} aria-hidden>
    <path d="m6 9 6 6 6-6" />
  </svg>
);
export const MessageIcon = (p: P) => (
  <svg {...base} strokeWidth={1.8} className={p.className} aria-hidden>
    <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.8L3 21l1.9-5.2A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z" />
  </svg>
);
export const FacebookIcon = (p: P) => (
  <svg {...base} className={p.className} aria-hidden>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
);

// Category tile icons (filled-on-color tiles on the Categories screen).
export const CategoryGlyph = ({ name, className }: { name: string; className?: string }) => {
  const n = name.toLowerCase();
  if (n.includes("business"))
    return (
      <svg {...base} className={className} aria-hidden>
        <path d="M3 21h18M5 21V7l7-4 7 4v14M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01" />
      </svg>
    );
  if (n.includes("tech"))
    return (
      <svg {...base} className={className} aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <path d="M8 21h8M12 17v4" />
      </svg>
    );
  if (n.includes("world"))
    return (
      <svg {...base} className={className} aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3a15 15 0 0 1 0 18 15 15 0 0 1 0-18Z" />
      </svg>
    );
  // generic tag
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M20.6 13.4 11 3.8a2 2 0 0 0-1.4-.6H4a1 1 0 0 0-1 1v5.6a2 2 0 0 0 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8Z" />
      <circle cx="7.5" cy="7.5" r="1.2" fill="currentColor" />
    </svg>
  );
};
