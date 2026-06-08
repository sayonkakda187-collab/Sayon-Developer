"use client";

import { useEffect, useState } from "react";
import { Link } from "next-view-transitions";

type TickerItem = { title: string; href: string };

/** Trending strip: accent "TRENDING" tab, an infinite marquee of headlines
 *  (pauses on hover), and a right-aligned live clock. */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (items.length === 0) return null;
  // Duplicate the row so the -50% marquee loop is seamless.
  const row = items.concat(items);
  return (
    <div className="tl-ticker">
      <span className="tl-ticker-tag">Trending</span>
      <div className="tl-ticker-vp">
        <div className="tl-ticker-track">
          {row.map((t, i) => (
            <Link key={i} href={t.href} className="tl-ticker-item">
              <span className="tl-ticker-bull" aria-hidden />
              {t.title}
            </Link>
          ))}
        </div>
      </div>
      <LiveClock />
    </div>
  );
}

function LiveClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const fmt = () =>
      new Date().toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="tl-ticker-clock" suppressHydrationWarning>
      <span className="tl-live-dot" aria-hidden />
      <span className="tl-live-word">Live</span>
      <span className="tl-live-time">{time || "—:—:—"}</span>
    </span>
  );
}
