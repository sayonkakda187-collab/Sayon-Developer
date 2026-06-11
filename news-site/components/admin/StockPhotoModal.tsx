"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, SparklesIcon, ImageIcon, ExternalLinkIcon } from "@/components/admin/icons";

// A finalized featured image handed back to the editor (already resolved per the
// source's terms: Unsplash download triggered / Pixabay re-hosted server-side).
export type StockPick = {
  url: string;
  credit: string;
  creditUrl: string;
  source: string;
};

type Hit = {
  id: string;
  source: string;
  sourceLabel: string;
  thumb: string;
  full: string;
  width: number;
  height: number;
  alt: string;
  author: string;
  authorUrl: string;
  pageUrl: string;
  license?: string;
  downloadLocation?: string;
};

type Phase = "idle" | "loading" | "ready" | "error";

/**
 * Unified free-image browser for the cover area — Pexels, Unsplash, Pixabay, and
 * Wikimedia Commons in one grid. Search by keyword or "Suggest from title"; pick
 * one and it's set as the featured image (the server triggers Unsplash's download
 * endpoint / re-hosts Pixabay per their terms). Keys stay server-side; Wikimedia
 * works with no key, so the picker is always useful.
 */
export function StockPhotoModal({
  initialTitle,
  initialExcerpt,
  onPick,
  onClose,
}: {
  initialTitle: string;
  initialExcerpt: string;
  onPick: (pick: StockPick) => void;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [picking, setPicking] = useState<string | null>(null);
  const reqId = useRef(0);

  const fetchResults = useCallback(
    async (q: string, params?: { suggest?: boolean }) => {
      const id = ++reqId.current;
      const usp = new URLSearchParams();
      if (params?.suggest) {
        usp.set("suggest", "1");
        usp.set("title", initialTitle);
        usp.set("excerpt", initialExcerpt);
      } else {
        usp.set("query", q);
      }
      try {
        const res = await fetch(`/api/admin/image-search?${usp.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (id !== reqId.current) return; // superseded
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Couldn’t search images.");
          setPhase("error");
          return;
        }
        setQuery(data.query ?? q);
        setInput((cur) => (params?.suggest ? (data.query ?? cur) : cur));
        setHits(data.hits ?? []);
        setPhase("ready");
      } catch {
        if (id === reqId.current) {
          setError("Couldn’t reach the image service. Please try again.");
          setPhase("error");
        }
      }
    },
    [initialTitle, initialExcerpt],
  );

  // Close on Escape; lock background scroll.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = input.trim();
    if (q.length < 2) return;
    setHits([]);
    setPhase("loading");
    setError("");
    fetchResults(q);
  }

  function suggest() {
    setHits([]);
    setPhase("loading");
    setError("");
    fetchResults("", { suggest: true });
  }

  // Finalize a pick: the server resolves it per the source's terms, then we hand
  // the stored cover back to the editor.
  async function pick(hit: Hit) {
    if (picking) return;
    setPicking(hit.id);
    setError("");
    try {
      const res = await fetch("/api/admin/image-search", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hit }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok || !data.cover) {
        setError(data.error ?? "Couldn’t set that image. Please try another.");
        setPicking(null);
        return;
      }
      onPick(data.cover as StockPick);
    } catch {
      setError("Couldn’t set that image. Please try again.");
      setPicking(null);
    }
  }

  const canSuggest = initialTitle.trim().length >= 3;

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-stock-modal" role="dialog" aria-modal="true" aria-label="Search free photos">
        <div className="adm-modal-head">
          <div className="adm-stock-title">
            <span className="adm-stock-spark" aria-hidden><ImageIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>Free photos</h2>
              <p className="adm-stock-sub">License-clean images from Pexels · Unsplash · Pixabay · Wikimedia Commons.</p>
            </div>
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="adm-stock-controls">
          <form className="adm-stock-search" role="search" onSubmit={runSearch}>
            <SearchIcon className="adm-stock-search-ic h-4 w-4" />
            <input
              className="adm-input"
              type="search"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search free photos…"
              aria-label="Search free photos"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
            />
          </form>
          <button
            type="button"
            className="adm-btn-ghost adm-stock-suggest"
            onClick={suggest}
            disabled={!canSuggest}
            title={canSuggest ? "Suggest photos from the article title" : "Add a title first"}
          >
            <SparklesIcon className="h-4 w-4" />
            Suggest from title
          </button>
        </div>

        <div className="adm-modal-body adm-stock-body">
          {phase === "idle" && (
            <p className="adm-stock-hint">
              Search for a topic, or use <strong>Suggest from title</strong> to find images that match your article.
            </p>
          )}
          {phase === "loading" && (
            <div className="adm-stock-grid" aria-hidden>
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="sk adm-stock-cell" />
              ))}
            </div>
          )}
          {phase === "error" && (
            <div className="adm-stock-hint">
              <p>{error}</p>
              <button type="button" className="adm-btn-ghost" style={{ marginTop: 12 }} onClick={() => runSearch()}>Try again</button>
            </div>
          )}
          {phase === "ready" && hits.length === 0 && (
            <p className="adm-stock-hint">No photos found for “{query}”. Try different keywords.</p>
          )}
          {phase === "ready" && hits.length > 0 && (
            <>
              {error && <p className="adm-cover-err" style={{ marginBottom: 10 }}>{error}</p>}
              <div className="adm-stock-grid">
                {hits.map((h) => (
                  <figure key={h.id} className="adm-stock-cell">
                    <button
                      type="button"
                      className="adm-stock-pick"
                      disabled={Boolean(picking)}
                      onClick={() => pick(h)}
                      title={h.alt || `Photo by ${h.author} · ${h.sourceLabel}`}
                      aria-label={`Use photo by ${h.author} from ${h.sourceLabel}`}
                    >
                      {/* Remote thumbnails from many hosts → plain <img> avoids next/image config. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                      <span className="adm-stock-src">{h.sourceLabel}</span>
                      <span className="adm-stock-pickhint">
                        {picking === h.id ? "Setting…" : "Use this photo"}
                      </span>
                    </button>
                    <figcaption className="adm-stock-credit">
                      <a href={h.pageUrl} target="_blank" rel="noopener noreferrer">
                        {h.author}
                        <ExternalLinkIcon className="h-[11px] w-[11px]" />
                      </a>
                    </figcaption>
                  </figure>
                ))}
              </div>
              <div className="adm-stock-more">
                <p className="adm-stock-credit-note">Images from Pexels, Unsplash, Pixabay &amp; Wikimedia Commons.</p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
