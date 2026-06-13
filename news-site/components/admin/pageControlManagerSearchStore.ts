"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny shared store for the Page Control MANAGER-search query — the sibling of
 * `pageControlSearchStore` (page-name search). The admin HEADER renders a "Search by
 * manager…" input ONLY on the Page Control list route (see AdminShell); this
 * module-singleton lets it drive `PageControlList`'s manager filter without threading
 * a context through the shell. Scoped to Page Control only.
 */

let query = "";
const listeners = new Set<() => void>();

export function setPageControlManagerSearch(q: string): void {
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

/** Current Page Control manager-search query (re-renders on change). SSR snapshot = "". */
export function usePageControlManagerSearch(): string {
  return useSyncExternalStore(subscribe, getSnapshot, () => "");
}
