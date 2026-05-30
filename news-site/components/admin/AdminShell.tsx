"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/admin/actions";
import {
  BookIcon,
  BellIcon,
  SearchIcon,
  HamburgerIcon,
  DashboardIcon,
  ArticlesIcon,
  CategoriesIcon,
  CommentsIcon,
  ExternalLinkIcon,
  LogOutIcon,
} from "./icons";

const NAV = [
  { tab: "dashboard", label: "Dashboard", drawerLabel: "Dashboard", href: "/admin", Icon: DashboardIcon },
  { tab: "articles", label: "Articles", drawerLabel: "Articles", href: "/admin/articles", Icon: ArticlesIcon },
  { tab: "categories", label: "Categories", drawerLabel: "Categories & Tags", href: "/admin/categories", Icon: CategoriesIcon },
  { tab: "comments", label: "Comments", drawerLabel: "Comments", href: "/admin/comments", Icon: CommentsIcon },
] as const;

export function AdminShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState(false);
  const scrollRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Nav mode is a flag (?nav=drawer); default = bottom tab bar. Read on the
  // client to keep SSR markup stable (no hydration mismatch).
  useEffect(() => {
    setDrawerMode(new URLSearchParams(window.location.search).get("nav") === "drawer");
  }, [pathname]);

  // Close the drawer + reset scroll to the top whenever the screen changes.
  useEffect(() => {
    setOpen(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  // ⌘F / Ctrl+F focuses the search field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const initials = userEmail.replace(/@.*/, "").slice(0, 2).toUpperCase() || "AD";
  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <div className="admin-shell adm-stage" style={{ flex: 1 }}>
      <div className="adm-canvas">
        {/* Header — light frosted glass */}
        <header className="adm-appbar">
          <div className="adm-appbar-row">
            {drawerMode && (
              <button
                type="button"
                className="adm-iconbtn"
                aria-label="Open menu"
                onClick={() => setOpen(true)}
              >
                <HamburgerIcon className="h-5 w-5" />
              </button>
            )}
            <Link href="/admin" className="adm-brand">
              <span className="adm-mark">
                <BookIcon className="h-[18px] w-[18px]" />
              </span>
              <span>
                <span className="adm-wordmark adm-serif">The Daily Ledger</span>
                <span className="adm-eyebrow" style={{ display: "block" }}>
                  Publisher dashboard
                </span>
              </span>
            </Link>
            <Link href="/admin/comments" className="adm-iconbtn" aria-label="Notifications">
              <BellIcon className="h-[19px] w-[19px]" />
              <span className="adm-dot" />
            </Link>
            <button
              type="button"
              className="adm-avatar"
              aria-label="Account menu"
              title={userEmail}
              onClick={() => setOpen(true)}
            >
              {initials}
            </button>
          </div>

          <form action="/search" role="search" className="adm-search">
            <SearchIcon className="h-4 w-4" />
            <input
              ref={searchRef}
              name="q"
              type="search"
              placeholder="Search articles…"
              aria-label="Search articles"
            />
            <span className="adm-kbd">⌘F</span>
          </form>
        </header>

        {/* Scroll content (the active screen) */}
        <main className="adm-scroll" ref={scrollRef}>
          <div key={pathname} className="adm-screen">
            {children}
          </div>
        </main>

        {/* Bottom tab bar (default) */}
        {!drawerMode && (
          <nav className="adm-tabbar" aria-label="Primary">
            {NAV.map(({ tab, label, href, Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={tab}
                  href={href}
                  data-tab={tab}
                  className={`adm-tab ${active ? "on" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  {label}
                </Link>
              );
            })}
          </nav>
        )}

        {/* Slide-out drawer — account actions + the ?nav=drawer variant */}
        <div
          className={`adm-drawer-back ${open ? "open" : ""}`}
          onClick={() => setOpen(false)}
          aria-hidden
        />
        <aside className={`adm-drawer ${open ? "open" : ""}`} aria-hidden={!open}>
          <div className="adm-dhead">
            <span className="adm-mark">
              <BookIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="adm-dname adm-serif">The Daily Ledger</span>
          </div>
          <div className="adm-dnav">
            {NAV.map(({ tab, drawerLabel, href, Icon }) => {
              const active = isActive(href);
              return (
                <Link
                  key={tab}
                  href={href}
                  data-tab={tab}
                  className={`adm-dlink ${active ? "on" : ""}`}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon />
                  {drawerLabel}
                </Link>
              );
            })}
          </div>
          <div className="adm-dfoot">
            <Link href="/" target="_blank" className="adm-dlink">
              <ExternalLinkIcon />
              View site
            </Link>
            <form action={logout}>
              <button type="submit" className="adm-dlink">
                <LogOutIcon />
                Log out
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
