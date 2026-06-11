"use client";

import { useEffect, useState } from "react";
import { Link } from "next-view-transitions";
import { usePathname } from "next/navigation";

export type MastheadNavItem = { name: string; href: string; deskCls: string };

/** Sticky broadsheet masthead: utility bar (collapses on scroll), nameplate row
 *  with the animated gradient wordmark + Subscribe/Search, and the section nav
 *  (desk-colored underlines). Shrinks past ~24px of scroll. Theme toggle flips
 *  the `.dark` class (ink ⇄ paper) and persists the choice. */
export function Masthead({ today, nav }: { today: string; nav: MastheadNavItem[] }) {
  const [scrolled, setScrolled] = useState(false);
  const [dark, setDark] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function toggleTheme() {
    const isDark = document.documentElement.classList.toggle("dark");
    try {
      localStorage.setItem("theme", isDark ? "dark" : "light");
    } catch {
      /* ignore storage failures (private mode) */
    }
    setDark(isDark);
  }

  return (
    <header className={`tl-masthead ${scrolled ? "is-scrolled" : ""}`}>
      <div className="tl-mh-util">
        <div className="tl-mh-util-inner">
          <div className="tl-mh-util-l">
            <svg className="tl-mh-wx" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" strokeLinecap="round" />
            </svg>
            <span>New York 72°</span>
            <span className="tl-sep">·</span>
            <span>London 58°</span>
          </div>
          <div className="tl-mh-util-c">All the day&apos;s intelligence, considered.</div>
          <div className="tl-mh-util-r">
            <Link href="/">Today&apos;s Paper</Link>
            <span className="tl-sep">·</span>
            <a href="#ledger-brief">Newsletters</a>
            <span className="tl-sep">·</span>
            <Link href="/admin">Sign In</Link>
            <button
              className="tl-mh-theme"
              onClick={toggleTheme}
              type="button"
              aria-label="Toggle dark mode"
              title="Toggle dark / light"
            >
              {dark ? (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  <circle cx="12" cy="12" r="4.4" />
                  <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.1 5.1l1.6 1.6M17.3 17.3l1.6 1.6M18.9 5.1l-1.6 1.6M6.7 17.3l-1.6 1.6" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
                  <path d="M20 14.5A8 8 0 0 1 9.5 4a6.6 6.6 0 1 0 10.5 10.5Z" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="tl-masthead-rail">
        <div className="tl-mh-left">
          <span className="tl-mh-edition">Vol. CXLVII · No. 312</span>
          <span className="tl-mh-date">{today}</span>
          <span className="tl-mh-place">New York · London · Worldwide</span>
        </div>
        <Link className="tl-wordmark" href="/" aria-label="The Daily Ledger">
          <span className="tl-wm-the">The</span>
          <span className="tl-wm-line">
            <span className="tl-wm-orn tl-left" aria-hidden>❧</span>
            <span className="tl-wm-main">Daily&nbsp;Ledger</span>
            <span className="tl-wm-orn tl-right" aria-hidden>❧</span>
          </span>
          <span className="tl-wm-sub">VOL. I · EST. 2026 · WORLD NEWS</span>
        </Link>
        <div className="tl-mh-right">
          <a className="tl-mh-sub" href="#ledger-brief">Subscribe</a>
          <Link className="tl-mh-search" href="/search" aria-label="Search">
            <svg viewBox="0 0 20 20" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
              <circle cx="9" cy="9" r="6" />
              <path d="m17 17-3.2-3.2" strokeLinecap="round" />
            </svg>
          </Link>
        </div>
      </div>

      <nav className="tl-mh-nav" aria-label="Primary">
        {nav.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`tl-nav-link ${n.deskCls} ${active ? "tl-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              {n.name}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
