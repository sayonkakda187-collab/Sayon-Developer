"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SearchIcon, CloseIcon, SparklesIcon, ImageIcon, ExternalLinkIcon } from "@/components/admin/icons";

// A chosen free stock photo, handed back to the editor (which opens it in the
// existing cropper and stores the photographer credit on save).
export type StockPick = {
  url: string;
  credit: string;
  creditUrl: string;
};

type Photo = {
  id: number;
  thumb: string;
  full: string;
  alt: string;
  photographer: string;
  photographerUrl: string;
  avgColor: string;
};

type Phase = "idle" | "loading" | "ready" | "error" | "setup";

/**
 * Free stock-photo browser (Pexels) for the cover-image area. Search by keyword
 * or "Suggest from title"; pick a photo → it's handed to the cropper (the editor
 * uploads the cropped result to Blob, so nothing is hotlinked). Key stays
 * server-side; an unset key shows a tidy "set up photos" state.
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
  const [page, setPage] = useState(1);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  const fetchPage = useCallback(
    async (q: string, p: number, params?: { suggest?: boolean }) => {
      const id = ++reqId.current;
      const usp = new URLSearchParams();
      if (params?.suggest) {
        usp.set("suggest", "1");
        usp.set("title", initialTitle);
        usp.set("excerpt", initialExcerpt);
      } else {
        usp.set("query", q);
      }
      usp.set("page", String(p));
      try {
        const res = await fetch(`/api/admin/stock-photos?${usp.toString()}`);
        const data = await res.json().catch(() => ({}));
        if (id !== reqId.current) return; // a newer request superseded this one
        if (res.status === 503 && data.configured === false) {
          setPhase("setup");
          return;
        }
        if (!res.ok || !data.ok) {
          setError(data.error ?? "Couldn’t search photos.");
          setPhase("error");
          return;
        }
        setQuery(data.query ?? q);
        setInput((cur) => (params?.suggest ? (data.query ?? cur) : cur));
        setPage(data.page ?? p);
        setHasMore(Boolean(data.hasMore));
        setPhotos((prev) => (p > 1 ? [...prev, ...(data.photos ?? [])] : data.photos ?? []));
        setPhase("ready");
      } catch {
        if (id === reqId.current) {
          setError("Couldn’t reach the photo service. Please try again.");
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
    setPhotos([]);
    setPhase("loading");
    setError("");
    fetchPage(q, 1);
  }

  function suggest() {
    setPhotos([]);
    setPhase("loading");
    setError("");
    fetchPage("", 1, { suggest: true });
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchPage(query, page + 1);
    setLoadingMore(false);
  }

  const canSuggest = initialTitle.trim().length >= 3;

  return (
    <div className="adm-modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-modal adm-stock-modal" role="dialog" aria-modal="true" aria-label="Search free photos">
        <div className="adm-modal-head">
          <div className="adm-stock-title">
            <span className="adm-stock-spark" aria-hidden><ImageIcon className="h-[18px] w-[18px]" /></span>
            <div>
              <h2 className="adm-serif" style={{ margin: 0 }}>Free stock photos</h2>
              <p className="adm-stock-sub">License-cleared images from Pexels · pick one to crop &amp; set as the cover.</p>
            </div>
          </div>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={onClose}>
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {phase === "setup" ? (
          <div className="adm-modal-body">
            <div className="adm-stock-setup">
              <div className="adm-ill" style={{ margin: "0 auto 14px" }}><ImageIcon className="h-[30px] w-[30px]" /></div>
              <h3 className="adm-serif">Set up free photos</h3>
              <p>
                Free stock-photo search uses the Pexels API. Create a free key at{" "}
                <a className="adm-link" href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer">pexels.com/api</a>,
                then set <code className="adm-fb-code">PEXELS_API_KEY</code> in your environment
                (Vercel → Settings → Environment Variables, Production &amp; Preview) and redeploy.
                Manual upload still works without it.
              </p>
              <button type="button" className="adm-btn-ghost" style={{ marginTop: 14 }} onClick={onClose}>Close</button>
            </div>
          </div>
        ) : (
          <>
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
              {phase === "ready" && photos.length === 0 && (
                <p className="adm-stock-hint">No photos found for “{query}”. Try different keywords.</p>
              )}
              {phase === "ready" && photos.length > 0 && (
                <>
                  <div className="adm-stock-grid">
                    {photos.map((p) => (
                      <figure key={p.id} className="adm-stock-cell">
                        <button
                          type="button"
                          className="adm-stock-pick"
                          style={{ backgroundColor: p.avgColor }}
                          onClick={() => onPick({ url: p.full, credit: p.photographer, creditUrl: p.photographerUrl })}
                          title={p.alt || `Photo by ${p.photographer}`}
                          aria-label={`Use photo by ${p.photographer}`}
                        >
                          {/* Remote thumbnails from many hosts → plain <img> avoids next/image config. */}
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
                          <span className="adm-stock-pickhint">Use this photo</span>
                        </button>
                        <figcaption className="adm-stock-credit">
                          <a href={p.photographerUrl} target="_blank" rel="noopener noreferrer">
                            {p.photographer}
                            <ExternalLinkIcon className="h-[11px] w-[11px]" />
                          </a>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="adm-stock-more">
                    {hasMore ? (
                      <button type="button" className="adm-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                        {loadingMore && <span className="adm-spinner" aria-hidden />}
                        {loadingMore ? "Loading…" : "Load more"}
                      </button>
                    ) : (
                      <p className="adm-stock-credit-note">Photos provided by Pexels.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
