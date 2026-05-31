"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; kind: ToastKind; message: string };

type ToastApi = {
  toast: (message: string, kind?: ToastKind) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Access the toast API from any client component under <ToastProvider>. */
export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within <ToastProvider>.");
  return ctx;
}

/**
 * Minimal, dependency-free toast system: a fixed stack in the corner, auto-
 * dismiss after a few seconds, accessible (role="status", aria-live). Styling
 * uses the admin design tokens so it matches light + dark.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(1);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = idRef.current++;
      setToasts((t) => [...t, { id, kind, message }]);
      // Errors linger a touch longer so they can be read.
      setTimeout(() => remove(id), kind === "error" ? 6000 : 4000);
    },
    [remove],
  );

  const api: ToastApi = {
    toast,
    success: (m) => toast(m, "success"),
    error: (m) => toast(m, "error"),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="adm-toasts" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`adm-toast ${t.kind}`}
            role="status"
            aria-live="polite"
            onClick={() => remove(t.id)}
          >
            <span className="adm-toast-dot" aria-hidden />
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
