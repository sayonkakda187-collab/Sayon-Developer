"use client";

import { useState } from "react";

// Lightweight share row — plain share-intent links (no third-party scripts, so it
// never hurts page speed / ad performance) + a Copy-link button. Simple monochrome
// glyphs that follow the theme tokens; each control has an accessible label.
function Glyph({ name }: { name: string }) {
  const common = { width: 17, height: 17, viewBox: "0 0 24 24", "aria-hidden": true as const };
  switch (name) {
    case "facebook":
      return (
        <svg {...common} fill="currentColor">
          <path d="M13 21v-7h2.4l.4-3H13V9.1c0-.9.3-1.4 1.5-1.4H16V5.1C15.6 5 14.7 5 13.7 5 11.5 5 10 6.3 10 8.8V11H7.6v3H10v7h3z" />
        </svg>
      );
    case "x":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
          <path d="M5 5l14 14M19 5L5 19" />
        </svg>
      );
    case "whatsapp":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3a8.5 8.5 0 0 0-7.3 12.8L3.5 21l5.4-1.2A8.5 8.5 0 1 0 12 3z" />
          <path d="M9 9c0 3 3 6 6 6 .8 0 1.3-.6 1.3-1.2 0-.3-1.6-1.2-2-1.2-.5 0-.7.7-1 .7-.6 0-2.3-1.7-2.3-2.3 0-.3.7-.5.7-1 0-.4-.9-2-1.2-2C9.6 7.7 9 8.2 9 9z" />
        </svg>
      );
    case "telegram":
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 4 3 11l5 2 2 6 3-4 5 4 3-15z" />
          <path d="M8 13l9-6-6 8" />
        </svg>
      );
    default: // copy / link
      return (
        <svg {...common} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1" />
          <path d="M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1" />
        </svg>
      );
  }
}

export function ShareButtons({
  url,
  title,
  className,
}: {
  url: string;
  title: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const links = [
    { id: "facebook", label: "Share on Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { id: "x", label: "Share on X", href: `https://twitter.com/intent/tweet?text=${t}&url=${u}` },
    { id: "whatsapp", label: "Share on WhatsApp", href: `https://wa.me/?text=${t}%20${u}` },
    { id: "telegram", label: "Share on Telegram", href: `https://t.me/share/url?url=${u}&text=${t}` },
  ];

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  const btn =
    "inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-fg-muted transition-colors hover:border-accent hover:bg-surface-2 hover:text-accent-link";

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ""}`}>
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-fg-faint">Share</span>
      {links.map((l) => (
        <a key={l.id} href={l.href} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label} className={btn}>
          <Glyph name={l.id} />
        </a>
      ))}
      <button type="button" onClick={copyLink} aria-label="Copy link" title="Copy link" className={btn}>
        <Glyph name="copy" />
      </button>
      <span
        aria-live="polite"
        className={`text-xs font-medium text-accent-link transition-opacity duration-200 ${copied ? "opacity-100" : "opacity-0"}`}
      >
        Copied!
      </span>
    </div>
  );
}
