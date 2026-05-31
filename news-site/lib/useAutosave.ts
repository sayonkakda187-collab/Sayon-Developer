"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveState = "idle" | "saving" | "saved";

export type DraftSnapshot = {
  title: string;
  excerpt: string;
  content: string;
  coverImage: string;
  categoryId: string;
  savedAt: number;
};

const PREFIX = "dl:draft:";
const DEBOUNCE_MS = 800;

function keyFor(id: string) {
  return `${PREFIX}${id}`;
}

/** Read a persisted local draft (if any) for an editor id ("new" or article id). */
export function readLocalDraft(id: string): DraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    if (typeof parsed?.savedAt !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearLocalDraft(id: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(keyFor(id));
  } catch {
    /* ignore quota/availability errors */
  }
}

/**
 * Debounced autosave of an editor snapshot to localStorage, with:
 * - a "saving" → "saved" status for the indicator,
 * - dirty tracking (compared to the initial server values),
 * - a beforeunload warning while there are unsaved local changes.
 *
 * Local-only by design: instant, crash-safe, no DB writes while typing. The
 * snapshot is cleared by the caller once the article is actually saved.
 */
export function useAutosave(id: string, snapshot: DraftSnapshot, initialKey: string) {
  const [state, setState] = useState<AutosaveState>("idle");
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRun = useRef(true);

  const serialized = JSON.stringify({
    title: snapshot.title,
    excerpt: snapshot.excerpt,
    content: snapshot.content,
    coverImage: snapshot.coverImage,
    categoryId: snapshot.categoryId,
  });

  useEffect(() => {
    // Skip the very first effect run (initial mount values aren't "edits").
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    const isDirty = serialized !== initialKey;
    setDirty(isDirty);
    if (!isDirty) {
      setState("idle");
      return;
    }

    setState("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      try {
        const at = Date.now();
        window.localStorage.setItem(
          keyFor(id),
          JSON.stringify({ ...snapshot, savedAt: at }),
        );
        setLastSavedAt(at);
        setState("saved");
      } catch {
        setState("idle");
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [serialized, id, initialKey, snapshot]);

  // Warn before leaving with unsaved local changes.
  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const clear = useCallback(() => {
    clearLocalDraft(id);
    setDirty(false);
    setState("idle");
  }, [id]);

  return { state, dirty, lastSavedAt, clear };
}
