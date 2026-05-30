"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Newspaper,
  Tags,
  MessageSquare,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
} from "lucide-react";
import { logout } from "@/app/admin/actions";

const NAV = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Articles", href: "/admin/articles", icon: Newspaper },
  { name: "Categories & Tags", href: "/admin/categories", icon: Tags },
  { name: "Comments", href: "/admin/comments", icon: MessageSquare },
];

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close the mobile drawer on navigation.
  useEffect(() => setOpen(false), [pathname]);

  // ⌘K / Ctrl+K focuses the search field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials =
    userEmail.replace(/@.*/, "").slice(0, 2).toUpperCase() || "AD";
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const sidebar = (
    <div className="flex h-full flex-col text-gray-300" style={{ backgroundColor: "#111317" }}>
      <div className="flex h-16 items-center gap-2.5 px-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
          DL
        </span>
        <span className="text-[15px] font-semibold text-white">
          Daily Ledger
        </span>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map(({ name, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/10 text-white"
                  : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-green-400"
                />
              )}
              <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
              {name}
            </Link>
          );
        })}
      </nav>
      <div className="space-y-1 border-t border-white/10 px-3 py-4">
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ExternalLink className="h-[18px] w-[18px]" />
          View site
        </Link>
        <form action={logout}>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 transition-colors hover:bg-white/5 hover:text-white">
            <LogOut className="h-[18px] w-[18px]" />
            Log out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="admin-shell flex min-h-screen bg-bg text-fg">
      {/* Sidebar (desktop) */}
      <aside
        className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block"
        style={{ backgroundColor: "#111317" }}
      >
        {sidebar}
      </aside>

      {/* Sidebar (mobile drawer) */}
      {open && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="absolute inset-y-0 left-0 w-64"
            style={{ backgroundColor: "#111317" }}
          >
            {sidebar}
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="absolute right-3 top-4 text-gray-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur sm:px-6">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="-ml-1 rounded-md p-2 text-fg-muted hover:bg-surface-2 lg:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>

          <form action="/search" role="search" className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-faint" />
            <input
              ref={searchRef}
              name="q"
              type="search"
              placeholder="Search articles…"
              aria-label="Search articles"
              className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-14 text-sm text-fg outline-none transition-colors placeholder:text-fg-faint focus:border-accent"
            />
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-fg-faint sm:block">
              ⌘K
            </kbd>
          </form>

          <div className="ml-auto flex items-center gap-1.5">
            <Link
              href="/admin/comments"
              aria-label="Comments"
              className="rounded-full p-2 text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
            >
              <Bell className="h-5 w-5" />
            </Link>
            <span
              title={userEmail}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-700"
            >
              {initials}
            </span>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
