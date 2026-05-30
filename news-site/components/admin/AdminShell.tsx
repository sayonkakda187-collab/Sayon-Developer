"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Newspaper,
  Tags,
  MessageSquare,
  MessageCircle,
  ExternalLink,
  LogOut,
  Menu,
  X,
  Search,
  Bell,
} from "lucide-react";
import { logout } from "@/app/admin/actions";

const NAV = [
  { name: "Dashboard", short: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Articles", short: "Articles", href: "/admin/articles", icon: Newspaper },
  { name: "Categories & Tags", short: "Tags", href: "/admin/categories", icon: Tags },
  { name: "Comments", short: "Comments", href: "/admin/comments", icon: MessageSquare },
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

  useEffect(() => setOpen(false), [pathname]);
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

  const nav = (
    <nav className="space-y-1 p-3">
      {NAV.map(({ name, href, icon: Icon }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? "surface-dark"
                : "text-fg-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon
              className={`h-[18px] w-[18px] ${active ? "text-green-400" : ""}`}
              strokeWidth={2}
            />
            {name}
          </Link>
        );
      })}
    </nav>
  );

  const bottom = (
    <div className="space-y-1 border-t border-border p-3">
      <Link
        href="/"
        target="_blank"
        className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        <ExternalLink className="h-[18px] w-[18px]" />
        View site
      </Link>
      <form action={logout}>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <LogOut className="h-[18px] w-[18px]" />
          Log out
        </button>
      </form>
    </div>
  );

  return (
    <div className="admin-shell flex min-h-screen flex-col bg-bg text-fg">
      {/* Dark top bar */}
      <header className="surface-dark sticky top-0 z-40 flex h-16 items-center gap-3 px-4 sm:px-6">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="rounded-md p-2 text-gray-300 hover:bg-white/10 lg:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/admin" className="shrink-0 text-lg font-bold tracking-tight">
          The Daily Ledger
        </Link>

        <form
          action="/search"
          role="search"
          className="relative mx-auto hidden w-full max-w-md sm:block"
        >
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            name="q"
            type="search"
            placeholder="Search articles…"
            aria-label="Search articles"
            className="w-full rounded-full bg-white/10 py-2 pl-10 pr-16 text-sm text-white outline-none transition placeholder:text-gray-400 focus:bg-white/20"
          />
          <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-medium text-gray-300">
            ⌘F
          </kbd>
        </form>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/admin/comments"
            aria-label="Comments"
            className="relative rounded-full bg-white/10 p-2 text-gray-200 transition hover:bg-white/20"
          >
            <Bell className="h-[18px] w-[18px]" />
            <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-green-400" />
          </Link>
          <span className="hidden rounded-full bg-white/10 p-2 text-gray-200 sm:inline-flex">
            <MessageCircle className="h-[18px] w-[18px]" />
          </span>
          <span
            title={userEmail}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-xs font-bold text-white"
          >
            {initials}
          </span>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Light sidebar (desktop) */}
        <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-60 shrink-0 flex-col justify-between border-r border-border bg-surface lg:flex">
          {nav}
          {bottom}
        </aside>

        {/* Sidebar (mobile drawer) */}
        {open && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div className="absolute inset-y-0 left-0 flex w-64 flex-col justify-between bg-surface">
              <div>
                <div className="flex h-16 items-center justify-between px-4">
                  <span className="text-lg font-bold">Menu</span>
                  <button
                    onClick={() => setOpen(false)}
                    aria-label="Close menu"
                    className="rounded-md p-2 text-fg-muted hover:bg-surface-2"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                {nav}
              </div>
              {bottom}
            </div>
          </div>
        )}

        <main className="min-w-0 flex-1 px-4 pb-24 pt-6 sm:px-6 lg:px-8 lg:pb-8">
          {children}
        </main>
      </div>

      {/* Bottom tab bar (mobile, thumb-reachable) */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-border bg-surface lg:hidden">
        {NAV.map(({ short, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                active ? "text-fg" : "text-fg-faint"
              }`}
            >
              <Icon
                className={`h-5 w-5 ${active ? "text-green-600" : ""}`}
                strokeWidth={2}
              />
              {short}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
