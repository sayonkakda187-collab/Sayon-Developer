"use client";

import { useEffect, useState } from "react";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";
import { SearchForm } from "./SearchForm";

type NavItem = { name: string; href: string };

export function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on navigation so the panel never lingers over the new page.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          {open ? (
            <>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Always rendered so it can animate open AND closed (GPU-friendly
          transform/opacity); pointer-events off while hidden. */}
      <div
        className={`absolute inset-x-0 top-full z-30 origin-top border-b border-border bg-bg px-4 py-4 shadow-lg transition duration-200 ease-out motion-reduce:transition-none ${
          open
            ? "pointer-events-auto translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0"
        }`}
        aria-hidden={!open}
      >
        <SearchForm className="mb-4" />
        <nav className="flex flex-col gap-1">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              tabIndex={open ? 0 : -1}
              className="rounded-lg px-3 py-2.5 text-base font-medium text-fg transition-colors hover:bg-surface-2"
            >
              {item.name}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
