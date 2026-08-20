"use client";

import { useState, type ReactNode } from "react";

/**
 * "Read more" gate for the article body.
 *
 * Shows the opening of the story, then a prominent **Read more** button with an
 * **ad directly beneath it**, and keeps the rest of the article collapsed until
 * the reader taps. Everyone who wants to finish the piece passes the ad, which
 * is the point — but the story is never withheld: one tap reveals it, and there
 * is no wall, no counter and no signup.
 *
 * ⚠️ SEO: the remaining body is ALWAYS rendered into the DOM and only *visually*
 * clamped (max-height + overflow). Conditionally rendering it would strip most
 * of the article out of the served HTML, which is what search engines read — so
 * that would quietly destroy the page's ranking. Do not "optimise" this into a
 * conditional render.
 *
 * The expand is a height/opacity transition and is skipped under
 * `prefers-reduced-motion` (see .rmg-rest in globals.css).
 */
export function ReadMoreGate({
  ad,
  children,
  label = "Read more",
}: {
  /** Ad unit rendered directly BELOW the button (stays put once expanded). */
  ad: ReactNode;
  /** The remainder of the article. Always in the DOM; clamped until expanded. */
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {!open && (
        <div className="rmg-cta">
          {/* Soft fade so the opening reads as "continues below", not "ends here". */}
          <div className="rmg-fade" aria-hidden />
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={false}
            aria-controls="article-rest"
            className="rmg-btn"
          >
            {label}
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      )}

      {/* Ad sits directly under the button — and stays in place after expanding,
          so it reads as a normal in-article unit rather than vanishing. */}
      {ad}

      <div id="article-rest" className={`rmg-rest${open ? " is-open" : ""}`}>
        {children}
      </div>
    </>
  );
}
