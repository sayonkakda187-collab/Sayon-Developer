"use client";

import { useRef, type ReactNode } from "react";
import Link from "next/link";
import { useTransitionRouter } from "next-view-transitions";

const VT_NAME = "shared-article-image";

// Link that morphs the clicked card's cover image into the article's hero image
// via the View Transitions API. Falls back to a normal Next client navigation
// when VT is unsupported, on modified clicks, or when reduced motion is on.
export function MorphLink({
  href,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  const ref = useRef<HTMLAnchorElement>(null);
  const router = useTransitionRouter();

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return; // let the browser open in a new tab, etc.
    }

    const supportsVT =
      typeof document !== "undefined" &&
      typeof (
        document as Document & { startViewTransition?: () => void }
      ).startViewTransition === "function";
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (!supportsVT || reduce) {
      return; // graceful fallback: default <Link> client navigation
    }

    e.preventDefault();

    // Clear the shared name from any previous holder (e.g. an article hero when
    // navigating article → article), then tag this card's cover image so it is
    // the only element with the name during the transition.
    document
      .querySelectorAll<HTMLElement>('[style*="shared-article-image"]')
      .forEach((el) => el.style.removeProperty("view-transition-name"));
    const img = ref.current
      ?.closest("article")
      ?.querySelector<HTMLElement>("img");
    if (img) img.style.viewTransitionName = VT_NAME;

    router.push(href);
  }

  return (
    <Link
      ref={ref}
      href={href}
      onClick={onClick}
      className={className}
      aria-label={ariaLabel}
    >
      {children}
    </Link>
  );
}
