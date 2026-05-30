"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { name: string; href: string };

// Horizontal nav with a CBS-style red active-link indicator.
export function MainNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="hidden items-center gap-5 md:flex lg:gap-6">
      {items.map((item) => {
        const active =
          item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative py-1 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
              active ? "text-fg" : "text-fg-muted hover:text-fg"
            }`}
          >
            {item.name}
            <span
              aria-hidden
              className={`absolute inset-x-0 -bottom-0.5 h-0.5 rounded-full bg-accent transition-opacity ${
                active ? "opacity-100" : "opacity-0"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
