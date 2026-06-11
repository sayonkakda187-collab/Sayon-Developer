"use client";

import { useEffect, useState } from "react";

// Slim, site-wide breaking-news alert bar shown above the header when the admin
// turns it on. Polls /api/breaking (~60s, CDN-cached) so toggles appear within a
// minute WITHOUT uncaching pages. Dismissible for the session (keyed to the
// banner content, so a NEW banner re-appears). role="alert" + high-contrast red.

type Data = { enabled: boolean; text?: string; link?: string | null };

const DISMISS_KEY = "dl:breaking-dismissed";

export function BreakingBanner() {
  const [data, setData] = useState<Data | null>(null);
  const [dismissedSig, setDismissedSig] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissedSig(sessionStorage.getItem(DISMISS_KEY));
    } catch {
      /* sessionStorage may be unavailable */
    }

    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/breaking", { cache: "no-store" });
        if (!res.ok) return;
        const d = (await res.json()) as Data;
        if (alive) setData(d);
      } catch {
        /* offline / transient — keep showing whatever we had */
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!data?.enabled || !data.text) return null;

  const sig = `${data.text}|${data.link ?? ""}`;
  if (dismissedSig === sig) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, sig);
    } catch {
      /* ignore */
    }
    setDismissedSig(sig);
  };

  const external = typeof data.link === "string" && /^https?:\/\//i.test(data.link);

  return (
    <div className="dl-breaking" role="alert">
      <div className="dl-breaking-inner">
        <span className="dl-breaking-tag" aria-hidden>
          Breaking
        </span>
        {data.link ? (
          <a
            className="dl-breaking-text"
            href={data.link}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          >
            {data.text}
          </a>
        ) : (
          <span className="dl-breaking-text">{data.text}</span>
        )}
      </div>
      <button type="button" className="dl-breaking-x" onClick={dismiss} aria-label="Dismiss breaking news">
        <span aria-hidden>×</span>
      </button>
    </div>
  );
}
