"use client";

import { useEffect, useRef, useState } from "react";
import { SearchIcon, PlusIcon } from "./icons";
import { setPageControlManagerSearch } from "./pageControlManagerSearchStore";
import { requestPageControlConnect } from "./pageControlConnectStore";

/**
 * Page-Control-only header controls, shown in the admin top bar / app bar immediately
 * to the RIGHT of the "Search Pages" search (AdminShell renders this on the Page
 * Control list route only): a "Search by manager…" input (debounced → the shared
 * manager-search store the list reads) + the "Connect Page" button (bumps a shared
 * signal the list watches to open its existing connect modal). Clears the manager
 * filter on unmount, so leaving Page Control restores a clean state.
 */
export function PageControlHeaderControls() {
  const [q, setQ] = useState("");
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the (debounced, case-insensitive in the list) query to the shared store.
  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => setPageControlManagerSearch(q), 150);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  // Leaving Page Control (this unmounts) → clear the shared manager filter.
  useEffect(() => () => setPageControlManagerSearch(""), []);

  return (
    <div className="adm-pc-headctl">
      <div className="adm-search adm-pc-headsearch" role="search">
        <SearchIcon className="h-[17px] w-[17px]" />
        <input
          type="search"
          value={q}
          placeholder="Search by manager…"
          aria-label="Search Pages by manager"
          autoComplete="off"
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <button type="button" className="adm-btn-primary adm-pc-headconnect" onClick={() => requestPageControlConnect()}>
        <PlusIcon className="h-4 w-4" /> Connect Page
      </button>
    </div>
  );
}
