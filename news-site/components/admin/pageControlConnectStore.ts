"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny shared signal so the "Connect Page" button — now in the admin HEADER on the
 * Page Control list route (see AdminShell) — can open the connect modal that lives in
 * `PageControlList` (deep in another route segment). Each click bumps a counter;
 * `PageControlList` watches it and opens its existing modal on change. A counter (not a
 * boolean) so repeated clicks always re-trigger, and there's no flag to reset.
 */

let token = 0;
const listeners = new Set<() => void>();

export function requestPageControlConnect(): void {
  token++;
  for (const l of listeners) l();
}

function getSnapshot(): number {
  return token;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** A counter that increments on every "Connect Page" header click. SSR snapshot = 0. */
export function usePageControlConnectSignal(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
