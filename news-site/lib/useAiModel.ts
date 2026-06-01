"use client";

import { useEffect, useState } from "react";
import { AI_MODEL_STORAGE_KEY, DEFAULT_MODEL_ID, isValidModel } from "@/lib/aiModels";

// Remembers the admin's chosen AI model across sessions (localStorage). SSR-safe:
// starts at the default, then hydrates the stored choice on mount.
export function useAiModel(): [string, (id: string) => void] {
  const [model, setModel] = useState<string>(DEFAULT_MODEL_ID);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (isValidModel(saved)) setModel(saved);
    } catch {
      /* localStorage may be unavailable */
    }
  }, []);

  function choose(id: string) {
    setModel(id);
    try {
      localStorage.setItem(AI_MODEL_STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }

  return [model, choose];
}
