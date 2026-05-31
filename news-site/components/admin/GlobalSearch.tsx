"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon } from "./icons";

type Hit = {
  id: string;
  title: string;
  status: string;
  category: { name: string } | null;
  snippet: string;
};

/**
 * Global admin article search — lives in the top bar / app bar, so it's reachable
 * from any admin screen. Debounced live results in a dropdown; Enter/click opens
 * the editor, "View all" deep-links to the Articles list with the query applied.
 * Backed by /api/admin/articles/search (full multi-field, relevance-ranked).
 */
export function GlobalSearch({
  inputRef,
  showKbd = false,
  placeholder = "Search articles…",
  onNavigate,
}: {
  inputRef?: RefObject<HTMLInputElement>;
  showKbd?: boolean;
  placeholder?: string;
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqId = useRef(0);

  // Debounced fetch on query change.
  useEffect(() => {
    const term = q.trim();
    if (debounce.current) clearTimeout(debounce.current);
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(async () => {
      const id = ++reqId.current;
      try {
        const res = await fetch(`/api/admin/articles/search?q=${encodeURIComponent(term)}&limit=8`);
        const data = await res.json();
        if (id === reqId.current) {
          setHits(Array.isArray(data.results) ? data.results : []);
          setActive(-1);
        }
      } catch {
        if (id === reqId.current) setHits([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 220);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [q]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  function go(id: string) {
    setOpen(false);
    setQ("");
    setHits([]);
    onNavigate?.();
    router.push(`/admin/articles/${id}/edit`);
  }

  function viewAll() {
    const term = q.trim();
    setOpen(false);
    onNavigate?.();
    router.push(term ? `/admin/articles?q=${encodeURIComponent(term)}` : "/admin/articles");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      (e.target as HTMLInputElement).blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(hits.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && hits[active]) go(hits[active].id);
      else if (q.trim().length >= 2) viewAll();
    }
  }

  const showPanel = open && q.trim().length >= 2;

  return (
    <div className="adm-gsearch" ref={wrapRef}>
      <div className="adm-search" role="search">
        <SearchIcon className="h-[17px] w-[17px]" />
        <input
          ref={inputRef}
          type="search"
          value={q}
          placeholder={placeholder}
          aria-label="Search all articles"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls="adm-gsearch-list"
          aria-autocomplete="list"
          autoComplete="off"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {showKbd && <span className="adm-kbd">⌘F</span>}
      </div>

      {showPanel && (
        <div id="adm-gsearch-list" className="adm-gsearch-pop" role="listbox" aria-label="Search results">
          {loading && hits.length === 0 ? (
            <div className="adm-gsearch-state">Searching…</div>
          ) : hits.length === 0 ? (
            <div className="adm-gsearch-state">No articles match “{q.trim()}”.</div>
          ) : (
            <>
              {hits.map((h, i) => (
                <button
                  key={h.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={`adm-gsearch-item ${i === active ? "active" : ""}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(h.id)}
                >
                  <div className="adm-gsearch-item-top">
                    <span className="adm-gsearch-item-title">{h.title}</span>
                    <span className={`adm-pill ${h.status === "published" ? "" : "amber"}`}>{h.status}</span>
                  </div>
                  {h.snippet && <span className="adm-gsearch-item-snip">{renderSnippet(h.snippet)}</span>}
                </button>
              ))}
              <button type="button" className="adm-gsearch-all" onClick={viewAll}>
                View all results for “{q.trim()}”
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Render a snippet where matches are wrapped in « » as <mark>.
function renderSnippet(snippet: string) {
  const parts = snippet.split(/«([^»]*)»/g);
  return parts.map((p, i) => (i % 2 === 1 ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>));
}
