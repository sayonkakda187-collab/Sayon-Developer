"use client";

import { useEffect, useId, useRef, useState } from "react";
import { SearchIcon, PlusIcon, CloseIcon } from "./icons";
import { ManagerAvatar } from "./ManagerAvatar";
import { setPageControlManagerFilter, usePageControlManagerFilter } from "./pageControlManagerFilterStore";
import { requestPageControlConnect } from "./pageControlConnectStore";

type MgrOpt = { id: string; name: string; photo: string | null; pageCount: number };

/** Wrap the matched substring of `name` in <mark> (case-insensitive). */
function highlight(name: string, q: string): React.ReactNode {
  if (!q) return name;
  const idx = name.toLowerCase().indexOf(q);
  if (idx < 0) return name;
  return (
    <>
      {name.slice(0, idx)}
      <mark className="adm-pc-mgr-mark">{name.slice(idx, idx + q.length)}</mark>
      {name.slice(idx + q.length)}
    </>
  );
}

/**
 * Page-Control-only header controls (right of "Search Pages", before the toggle/bell/
 * profile): a "Search by manager" AUTOCOMPLETE + the "Connect Page" button.
 *
 * The autocomplete opens on focus listing ALL managers (avatar + name + page count),
 * narrows by substring as you type (matched part highlighted), and is keyboard-driven
 * (↑/↓ move, Enter select, Esc close; click-outside closes). Selecting a manager sets
 * the SHARED `pageControlManagerFilterStore` — which BOTH the page list and the network
 * dashboard read — and shows the choice as a removable chip; clearing returns to All
 * Managers. Manager data is fetched once from `/api/admin/page-control/managers` (local
 * DB, no Graph). Connect Page bumps `pageControlConnectStore` (the list opens its modal).
 */
export function PageControlHeaderControls() {
  const selected = usePageControlManagerFilter();
  const [managers, setManagers] = useState<MgrOpt[] | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLLIElement>(null);
  const listId = useId();

  // Lazy-load managers (local DB, no Graph) the first time the box opens.
  async function ensureManagers() {
    if (managers) return;
    try {
      const res = await fetch("/api/admin/page-control/managers", { cache: "no-store" });
      const j = await res.json();
      setManagers(j.ok ? (j.managers as MgrOpt[]) : []);
    } catch {
      setManagers([]);
    }
  }

  const q = query.trim().toLowerCase();
  const suggestions = (managers ?? []).filter((m) => !q || m.name.toLowerCase().includes(q));

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset highlight when the suggestion set changes; keep the active option in view.
  useEffect(() => setHi(0), [q, open]);
  useEffect(() => {
    if (open) activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [hi, open]);

  function openDropdown() {
    void ensureManagers();
    setOpen(true);
  }

  function pick(m: MgrOpt) {
    setPageControlManagerFilter({ id: m.id, name: m.name, photo: m.photo });
    setOpen(false);
    setQuery("");
  }

  function clearSelection() {
    setPageControlManagerFilter(null);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openDropdown();
      setHi((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      if (open && suggestions[hi]) {
        e.preventDefault();
        pick(suggestions[hi]);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="adm-pc-headctl">
      <div className="adm-search adm-pc-headsearch" role="search" ref={rootRef}>
        {selected ? (
          <span className="adm-pc-mgrsel">
            <ManagerAvatar name={selected.name} photo={selected.photo} size={22} />
            <span className="adm-pc-mgrsel-name">{selected.name}</span>
            <button type="button" className="adm-pc-mgrsel-x" aria-label={`Clear manager filter (${selected.name})`} onClick={clearSelection}>
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <>
            <SearchIcon className="h-[17px] w-[17px]" />
            <input
              ref={inputRef}
              type="text"
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              value={query}
              placeholder="Search by manager…"
              aria-label="Search Pages by manager"
              autoComplete="off"
              onFocus={openDropdown}
              onClick={openDropdown}
              onChange={(e) => {
                setQuery(e.target.value);
                if (!open) openDropdown();
              }}
              onKeyDown={onKeyDown}
            />
          </>
        )}

        {open && !selected && (
          <ul className="adm-pc-mgr-dd" id={listId} role="listbox" aria-label="Managers">
            {managers === null ? (
              <li className="adm-pc-mgr-dd-msg">Loading…</li>
            ) : suggestions.length === 0 ? (
              <li className="adm-pc-mgr-dd-msg">No managers found.</li>
            ) : (
              suggestions.map((m, i) => (
                <li
                  key={m.id}
                  ref={i === hi ? activeRef : null}
                  role="option"
                  aria-selected={i === hi}
                  className={`adm-pc-mgr-opt ${i === hi ? "on" : ""}`}
                  onMouseEnter={() => setHi(i)}
                  onMouseDown={(e) => {
                    e.preventDefault(); // keep focus so the pick registers before blur
                    pick(m);
                  }}
                >
                  <ManagerAvatar name={m.name} photo={m.photo} size={26} />
                  <span className="adm-pc-mgr-opt-name">{highlight(m.name, q)}</span>
                  <span className="adm-pc-mgr-opt-count">{m.pageCount} {m.pageCount === 1 ? "page" : "pages"}</span>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
      <button type="button" className="adm-btn-primary adm-pc-headconnect" onClick={() => requestPageControlConnect()}>
        <PlusIcon className="h-4 w-4" /> Connect Page
      </button>
    </div>
  );
}
