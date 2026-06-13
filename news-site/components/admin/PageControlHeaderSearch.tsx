"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { SearchIcon } from "./icons";
import { setPageControlSearch } from "./pageControlSearchStore";

/**
 * Header search shown in the admin top bar / app bar ONLY on the Page Control list
 * route (AdminShell swaps it in for the global "Search articles…" `GlobalSearch`
 * there). It mirrors `GlobalSearch`'s markup/classes so it looks identical and never
 * overflows on mobile, but instead of an article dropdown it just (debounced) feeds
 * the shared Page Control search store the monitored-pages list reads. Resets the
 * store on unmount, so navigating away restores a clean filter (and the normal
 * article header search returns).
 */
export function PageControlHeaderSearch({
  inputRef,
  showKbd = false,
}: {
  inputRef?: RefObject<HTMLInputElement>;
  showKbd?: boolean;
}) {
  const [q, setQ] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the (debounced, case-insensitive handled by the list) query to the store.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setPageControlSearch(q), 150);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  // Leaving Page Control (this unmounts) → clear the shared filter.
  useEffect(() => {
    return () => setPageControlSearch("");
  }, []);

  return (
    <div className="adm-gsearch">
      <div className="adm-search" role="search">
        <SearchIcon className="h-[17px] w-[17px]" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          placeholder="Search Pages…"
          aria-label="Search monitored Pages"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
        />
        {showKbd && <span className="adm-kbd">⌘F</span>}
      </div>
    </div>
  );
}
