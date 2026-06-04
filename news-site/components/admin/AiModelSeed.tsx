"use client";

import { useEffect } from "react";
import { AI_MODEL_STORAGE_KEY, isValidModel } from "@/lib/aiModels";

// Seeds this browser's AI-model choice from the account default (set in Settings)
// the first time, so AI Assist defaults to the account default on a fresh device.
// If the browser already has a (per-use) choice, it's left untouched — the
// localStorage picker keeps overriding per use. Renders nothing.
export function AiModelSeed({ serverDefault }: { serverDefault: string }) {
  useEffect(() => {
    try {
      const current = localStorage.getItem(AI_MODEL_STORAGE_KEY);
      if (!isValidModel(current) && isValidModel(serverDefault)) {
        localStorage.setItem(AI_MODEL_STORAGE_KEY, serverDefault);
      }
    } catch {
      /* localStorage may be unavailable */
    }
  }, [serverDefault]);
  return null;
}
