"use client";

import { useState } from "react";
import Link from "next/link";
import { SearchForm } from "./SearchForm";

type NavItem = { name: string; href: string };

export function MobileMenu({ items }: { items: NavItem[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
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

      {open && (
        <div className="absolute inset-x-0 z-20 border-b border-gray-200 bg-white px-4 py-4 shadow-sm">
          <SearchForm className="mb-4" />
          <nav className="flex flex-col gap-1">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2 text-base font-medium text-gray-800 hover:bg-gray-100"
              >
                {item.name}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
