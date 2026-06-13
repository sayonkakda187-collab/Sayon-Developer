"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny shared store for the Page Control page-search query. The admin HEADER search
 * (swapped to "Search Pages…" on the Page Control list route — see AdminShell) lives
 * at the top of the tree, while `PageControlList` lives deep in a different route
 * segment; this module-singleton lets the header drive the list's filter without
 * threading a context through the whole shell. Scoped to Page Control only — every
 * other admin page keeps the normal global article search untouched.
 */

let query = "";
const listeners = new Set<() => void>();

export function setPageControlSearch(q: string): void {
  if (q === query) return;
  query = q;
  for (const l of listeners) l();
}

function getSnapshot(): string {
  return query;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Current Page Control search query (re-renders on change). SSR snapshot = "". */
export function usePageControlSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
