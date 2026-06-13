"use client";

import { useSyncExternalStore } from "react";

/**
 * Shared "selected manager" filter for Page Control — set by the header's manager
 * autocomplete, read by BOTH the monitored-pages list AND the network dashboard so
 * they stay in sync. `null` = All Managers. A module-singleton (like the page-search
 * store) so the header (high in the tree) can drive the list + dashboard (deep in
 * another route segment) without threading context. Scoped to Page Control only.
 */

export type SelectedManager = { id: string; name: string; photo: string | null };

let selected: SelectedManager | null = null;
const listeners = new Set<() => void>();

export function setPageControlManagerFilter(m: SelectedManager | null): void {
  if ((m?.id ?? null) === (selected?.id ?? null)) return;
  selected = m;
  for (const l of listeners) l();
}

function getSnapshot(): SelectedManager | null {
  return selected;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The currently selected manager filter (re-renders on change). SSR snapshot = null. */
export function usePageControlManagerFilter(): SelectedManager | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
