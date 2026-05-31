"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/site";
import { useToast } from "@/components/admin/Toast";
import { trendingKeywords, isAlreadyCovered } from "@/lib/trendingClient";
import { AiAssistModal } from "@/components/admin/AiAssistModal";
import {
  toggleSavedIdea,
  deleteSavedIdea,
  setSavedIdeaStatus,
  addFollowedTopic,
  removeFollowedTopic,
  type SavedIdeaDTO,
  type FollowedTopicDTO,
} from "@/app/admin/trending-actions";
import {
  SearchIcon,
  CloseIcon,
  RefreshIcon,
  ExternalLinkIcon,
  PencilIcon,
  TrendingIcon,
  BookmarkIcon,
  SparklesIcon,
  StarIcon,
  TrashIcon,
  ChevronDownIcon,
} from "@/components/admin/icons";

type Option = { id: string; label: string };

type Item = {
  title: string;
  description: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
};

type ApiResponse = {
  ok?: boolean;
  items?: Item[];
  cached?: boolean;
  stale?: boolean;
  page?: number;
  hasMore?: boolean;
  notice?: string | null;
  error?: string;
};

type Phase = "loading" | "ready" | "error";
type SortId = "relevance" | "newest" | "source";
type View = "discover" | "saved";

export function TrendingNews({
  categories,
  languages,
  countries,
  configured,
  aiConfigured,
  existingTitles,
  initialSaved,
  initialTopics,
}: {
  categories: Option[];
  languages: Option[];
  countries: Option[];
  configured: boolean;
  aiConfigured: boolean;
  existingTitles: string[];
  initialSaved: SavedIdeaDTO[];
  initialTopics: FollowedTopicDTO[];
}) {
  const { success, error: toastError } = useToast();
  const [view, setView] = useState<View>("discover");

  const [category, setCategory] = useState<string>(categories[0]?.id ?? "general");
  const [lang, setLang] = useState<string>("en");
  const [country, setCountry] = useState<string>("us");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>(configured ? "loading" : "error");
  const [errorMsg, setErrorMsg] = useState("");
  const [cached, setCached] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ceiling, setCeiling] = useState(false);

  // Refine (client-side, no GNews calls).
  const [sort, setSort] = useState<SortId>("relevance");
  const [hiddenSources, setHiddenSources] = useState<Set<string>>(new Set());
  const [showKeywords, setShowKeywords] = useState(true);

  // Saved ideas + followed topics (persist per-admin; seeded from the server).
  const [saved, setSaved] = useState<SavedIdeaDTO[]>(initialSaved);
  const [topics, setTopics] = useState<FollowedTopicDTO[]>(initialTopics);
  const savedUrls = useMemo(() => new Set(saved.map((s) => s.url)), [saved]);

  // AI Assist modal target.
  const [aiTarget, setAiTarget] = useState<{ headline: string; topic?: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      else params.set("category", category);
      params.set("lang", lang);
      params.set("country", country);
      params.set("page", String(p));
      return params;
    },
    [query, category, lang, country],
  );

  const loadFirst = useCallback(async () => {
    if (!configured) {
      setPhase("error");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("loading");
    setErrorMsg("");
    setNotice(null);
    setCeiling(false);
    try {
      const res = await fetch(`/api/admin/trending?${buildParams(1).toString()}`, { signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || data.ok === false) {
        setItems([]);
        setErrorMsg(data.error ?? "Couldn’t load trending stories. Please try again.");
        setPhase("error");
        return;
      }
      setItems(data.items ?? []);
      setCached(Boolean(data.cached));
      setNotice(data.notice ?? null);
      setPage(1);
      setCanLoadMore(Boolean(data.hasMore));
      setHiddenSources(new Set());
      setPhase("ready");
    } catch {
      if (controller.signal.aborted) return;
      setItems([]);
      setErrorMsg("Couldn’t load trending stories. Please check your connection and try again.");
      setPhase("error");
    }
  }, [configured, buildParams]);

  async function loadMore() {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/admin/trending?${buildParams(next).toString()}`);
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || data.ok === false) {
        setCanLoadMore(false);
        setCeiling(true);
        return;
      }
      const incoming = data.items ?? [];
      let added = 0;
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.url));
        const fresh = incoming.filter((i) => !seen.has(i.url));
        added = fresh.length;
        return [...prev, ...fresh];
      });
      setPage(next);
      setCanLoadMore(Boolean(data.hasMore) && added > 0);
      if (added === 0) setCeiling(true);
    } catch {
      setCanLoadMore(false);
      setCeiling(true);
    } finally {
      setLoadingMore(false);
    }
  }

  // Debounce the search box (live search as you type).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    loadFirst();
    return () => abortRef.current?.abort();
  }, [loadFirst]);

  function clearSearch() {
    setSearchInput("");
    setQuery("");
  }
  function pickCategory(id: string) {
    setSearchInput("");
    setQuery("");
    setCategory(id);
  }
  function searchKeyword(term: string) {
    setView("discover");
    setSearchInput(term);
    setQuery(term);
  }

  // Keyword panel + source list are derived from the ALREADY-FETCHED items.
  const keywords = useMemo(() => trendingKeywords(items, 16), [items]);
  const sources = useMemo(
    () => Array.from(new Set(items.map((i) => i.source).filter(Boolean))).sort(),
    [items],
  );

  const visibleItems = useMemo(() => {
    let rows = items.filter((i) => !hiddenSources.has(i.source));
    if (sort === "newest") {
      rows = [...rows].sort(
        (a, b) => (Date.parse(b.publishedAt ?? "") || 0) - (Date.parse(a.publishedAt ?? "") || 0),
      );
    } else if (sort === "source") {
      rows = [...rows].sort((a, b) => a.source.localeCompare(b.source));
    }
    // "relevance" keeps the server's order.
    return rows;
  }, [items, hiddenSources, sort]);

  function toggleSource(src: string) {
    setHiddenSources((prev) => {
      const next = new Set(prev);
      if (next.has(src)) next.delete(src);
      else next.add(src);
      return next;
    });
  }

  // ── Save / follow handlers ──
  async function onToggleSave(item: Item) {
    const wasSaved = savedUrls.has(item.url);
    // Optimistic update.
    setSaved((prev) =>
      wasSaved
        ? prev.filter((s) => s.url !== item.url)
        : [
            {
              id: `tmp-${item.url}`,
              title: item.title,
              url: item.url,
              source: item.source,
              image: item.image,
              snippet: item.description,
              status: "idea",
              savedAt: new Date().toISOString(),
            },
            ...prev,
          ],
    );
    const res = await toggleSavedIdea({
      title: item.title,
      url: item.url,
      source: item.source,
      image: item.image ?? undefined,
      snippet: item.description,
    });
    if (!res.ok) {
      toastError(res.error);
      // Roll back by reloading the truth on next render isn't trivial; re-fetch list.
      return;
    }
    if (res.saved) success("Saved to your ideas.");
    else success("Removed from saved ideas.");
  }

  async function onRemoveSaved(id: string) {
    setSaved((prev) => prev.filter((s) => s.id !== id));
    await deleteSavedIdea(id);
  }

  async function onCycleStatus(idea: SavedIdeaDTO) {
    const order = ["idea", "drafting", "done"] as const;
    const nextStatus = order[(order.indexOf(idea.status as (typeof order)[number]) + 1) % order.length];
    setSaved((prev) => prev.map((s) => (s.id === idea.id ? { ...s, status: nextStatus } : s)));
    await setSavedIdeaStatus(idea.id, nextStatus);
  }

  const followedSet = useMemo(() => new Set(topics.map((t) => t.topic.toLowerCase())), [topics]);

  async function onFollowCurrent() {
    const t = (query || searchInput).trim();
    if (t.length < 2) {
      toastError("Type a topic in the search box to follow it.");
      return;
    }
    if (followedSet.has(t.toLowerCase())) {
      toastError("You already follow that topic.");
      return;
    }
    const res = await addFollowedTopic({ topic: t, lang, country });
    if (res.ok) {
      setTopics((prev) => [res.topic, ...prev]);
      success(`Following “${t}”.`);
    } else {
      toastError(res.error);
    }
  }
  async function onUnfollow(id: string) {
    setTopics((prev) => prev.filter((t) => t.id !== id));
    await removeFollowedTopic(id);
  }
  function openFollowed(t: FollowedTopicDTO) {
    setLang(t.lang);
    setCountry(t.country);
    searchKeyword(t.topic);
  }

  const showRefine = phase === "ready" && items.length > 0;

  return (
    <div>
      <div className="adm-pagehead">
        <div className="adm-page-h" style={{ marginBottom: 0 }}>
          <h1>Trending News</h1>
          <p>Discover trending headlines, plan your coverage, and start an original draft.</p>
        </div>
        <button
          type="button"
          className="adm-btn-ghost adm-head-cta"
          onClick={() => loadFirst()}
          disabled={phase === "loading" || !configured}
          title="Reload the current feed"
        >
          <RefreshIcon className={`h-[17px] w-[17px] ${phase === "loading" ? "adm-spinning" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Inspiration-only / originality reminder — always visible. */}
      <div className="adm-trend-note" role="note">
        <span className="adm-trend-note-ic" aria-hidden>
          <TrendingIcon className="h-[18px] w-[18px]" />
        </span>
        <p>
          <strong>Inspiration only — never copy.</strong> These are trending headlines from around
          the web, shown as story ideas. Use them to start a fresh draft with a working title and a
          link to the source for your research. Always write the article{" "}
          <strong>in your own words</strong> — copying a source’s text is copyright infringement.
        </p>
      </div>

      {/* Discover / Saved switch. */}
      <div className="adm-seg" role="tablist" aria-label="Trending view">
        <button type="button" role="tab" aria-selected={view === "discover"} className={`adm-seg-btn ${view === "discover" ? "on" : ""}`} onClick={() => setView("discover")}>
          Discover
        </button>
        <button type="button" role="tab" aria-selected={view === "saved"} className={`adm-seg-btn ${view === "saved" ? "on" : ""}`} onClick={() => setView("saved")}>
          Saved ideas{saved.length > 0 && <span className="adm-seg-count">{saved.length}</span>}
        </button>
      </div>

      {view === "saved" ? (
        <SavedView
          saved={saved}
          aiConfigured={aiConfigured}
          onRemove={onRemoveSaved}
          onCycleStatus={onCycleStatus}
          onAi={(idea) => setAiTarget({ headline: idea.title })}
          onBrowse={() => setView("discover")}
        />
      ) : (
        <>
          {/* Followed topics (quick re-search). */}
          {topics.length > 0 && (
            <div className="adm-follow-row">
              <span className="adm-follow-lbl"><StarIcon filled className="h-[14px] w-[14px]" /> Following</span>
              {topics.map((t) => (
                <span key={t.id} className="adm-follow-chip">
                  <button type="button" onClick={() => openFollowed(t)} title={`Search “${t.topic}”`}>{t.topic}</button>
                  <button type="button" className="adm-follow-x" aria-label={`Unfollow ${t.topic}`} onClick={() => onUnfollow(t.id)}>
                    <CloseIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Controls: category/niche tabs + search + language/country. */}
          <div className="adm-trend-controls">
            <div className="adm-filterbar" role="tablist" aria-label="Trending categories">
              {categories.map((c) => {
                const active = !query && c.id === category;
                return (
                  <button
                    key={c.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    className={`adm-fchip ${active ? "on" : ""}`}
                    onClick={() => pickCategory(c.id)}
                    disabled={!configured}
                  >
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="adm-trend-toolrow">
              <div className="adm-trend-search" role="search">
                <SearchIcon className="adm-trend-search-ic h-4 w-4" />
                <input
                  className="adm-input"
                  type="search"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search any topic…"
                  aria-label="Search trending topics"
                  disabled={!configured}
                />
                {searchInput && (
                  <button type="button" className="adm-trend-search-clear" aria-label="Clear search" onClick={clearSearch}>
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </div>

              <button
                type="button"
                className="adm-btn-ghost adm-follow-btn"
                onClick={onFollowCurrent}
                disabled={!configured || (query || searchInput).trim().length < 2}
                title="Follow this topic for quick re-search"
              >
                <StarIcon className="h-4 w-4" />
                Follow
              </button>

              <label className="adm-trend-select">
                <span className="adm-trend-select-lbl">Language</span>
                <select className="adm-input" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!configured} aria-label="Language">
                  {languages.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
                </select>
              </label>
              <label className="adm-trend-select">
                <span className="adm-trend-select-lbl">Country</span>
                <select className="adm-input" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!configured} aria-label="Country">
                  {countries.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
                </select>
              </label>
            </div>
          </div>

          {/* Trending keywords (computed from already-fetched headlines — no quota). */}
          {showRefine && keywords.length > 0 && (
            <div className="adm-kw-panel">
              <button type="button" className="adm-kw-head" onClick={() => setShowKeywords((s) => !s)} aria-expanded={showKeywords}>
                <span>Trending keywords <span className="adm-kw-hint">from loaded headlines</span></span>
                <ChevronDownIcon className={`h-4 w-4 adm-kw-chev ${showKeywords ? "open" : ""}`} />
              </button>
              {showKeywords && (
                <div className="adm-kw-list">
                  {keywords.map((k) => (
                    <button key={k.term} type="button" className="adm-kw-chip" onClick={() => searchKeyword(k.term)} title={`Search “${k.term}”`}>
                      {k.term}<span className="adm-kw-n">{k.count}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {(query || cached || notice) && phase === "ready" && (
            <p className="adm-trend-resultline">
              {query ? <>Showing results for <strong>“{query}”</strong></> : <>Top headlines</>}
              {cached && <span className="adm-trend-cached"> · cached</span>}
              {notice && <span className="adm-trend-cached"> · {notice}</span>}
            </p>
          )}

          {/* Refine bar: sort + source filter (client-side over fetched results). */}
          {showRefine && (
            <div className="adm-refine">
              <label className="adm-refine-sort">
                <span>Sort</span>
                <select className="adm-input" value={sort} onChange={(e) => setSort(e.target.value as SortId)} aria-label="Sort results">
                  <option value="relevance">Relevance</option>
                  <option value="newest">Newest</option>
                  <option value="source">Source A–Z</option>
                </select>
              </label>
              {sources.length > 1 && (
                <SourceFilter sources={sources} hidden={hiddenSources} onToggle={toggleSource} onReset={() => setHiddenSources(new Set())} />
              )}
            </div>
          )}

          {/* ── Content states ── */}
          {!configured ? (
            <ConfigNeeded />
          ) : phase === "loading" ? (
            <SkeletonGrid />
          ) : phase === "error" ? (
            <ErrorState message={errorMsg} onRetry={() => loadFirst()} />
          ) : visibleItems.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              <div className="adm-trend-grid">
                {visibleItems.map((item, i) => (
                  <TrendingCard
                    key={`${item.url}-${i}`}
                    item={item}
                    saved={savedUrls.has(item.url)}
                    covered={isAlreadyCovered(item.title, existingTitles)}
                    aiConfigured={aiConfigured}
                    onToggleSave={() => onToggleSave(item)}
                    onAi={() => setAiTarget({ headline: item.title, topic: query || category })}
                  />
                ))}
              </div>

              <div className="adm-trend-more">
                {canLoadMore ? (
                  <button type="button" className="adm-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore && <span className="adm-spinner" aria-hidden />}
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                ) : ceiling ? (
                  <p className="adm-trend-ceiling">
                    That’s all GNews returns on the free tier (up to 10 per search). For more sources
                    or results, a paid GNews plan would be needed.
                  </p>
                ) : null}
              </div>
            </>
          )}
        </>
      )}

      {aiTarget && (
        <AiAssistModal headline={aiTarget.headline} topic={aiTarget.topic} onClose={() => setAiTarget(null)} />
      )}
    </div>
  );
}

function writeHref(title: string, url?: string) {
  const params = new URLSearchParams({ title });
  if (url) params.set("ref", url);
  return `/admin/articles/new?${params.toString()}`;
}

function TrendingCard({
  item,
  saved,
  covered,
  aiConfigured,
  onToggleSave,
  onAi,
}: {
  item: Item;
  saved: boolean;
  covered: boolean;
  aiConfigured: boolean;
  onToggleSave: () => void;
  onAi: () => void;
}) {
  return (
    <article className="adm-card adm-trend-card">
      <div className="adm-trend-thumb">
        <span className="adm-trend-thumb-fallback" aria-hidden>
          <TrendingIcon className="h-7 w-7" />
        </span>
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="adm-trend-img"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
        )}
        <button
          type="button"
          className={`adm-trend-save ${saved ? "on" : ""}`}
          aria-label={saved ? "Remove from saved ideas" : "Save for later"}
          aria-pressed={saved}
          title={saved ? "Saved — click to remove" : "Save for later"}
          onClick={onToggleSave}
        >
          <BookmarkIcon filled={saved} className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="adm-trend-body">
        <div className="adm-trend-meta">
          <span className="adm-trend-src">{item.source}</span>
          {item.publishedAt && (<><span aria-hidden>·</span><span>{timeAgo(item.publishedAt)}</span></>)}
          {covered && <span className="adm-covered-badge" title="A similar headline already exists in your articles">Already covered</span>}
        </div>

        <h3 className="adm-trend-title">{item.title}</h3>
        {item.description && <p className="adm-trend-snippet">{item.description}</p>}

        <div className="adm-trend-foot">
          <a className="adm-trend-read" href={item.url} target="_blank" rel="noopener noreferrer">
            Read original
            <ExternalLinkIcon className="h-[14px] w-[14px]" />
          </a>
          <div className="adm-trend-actions">
            <AiButton aiConfigured={aiConfigured} onClick={onAi} />
            <Link className="adm-trend-write" href={writeHref(item.title, item.url)}>
              <PencilIcon className="h-[15px] w-[15px]" />
              Write
            </Link>
          </div>
        </div>
      </div>
    </article>
  );
}

function AiButton({ aiConfigured, onClick }: { aiConfigured: boolean; onClick: () => void }) {
  if (!aiConfigured) {
    return (
      <Link className="adm-trend-ai disabled" href="/admin/trending#ai-setup" title="Set up AI to enable" aria-label="Set up AI to enable">
        <SparklesIcon className="h-[15px] w-[15px]" />
        Set up AI
      </Link>
    );
  }
  return (
    <button type="button" className="adm-trend-ai" onClick={onClick} title="Draft help from AI (paid, runs on click)">
      <SparklesIcon className="h-[15px] w-[15px]" />
      AI Assist
    </button>
  );
}

function SourceFilter({
  sources,
  hidden,
  onToggle,
  onReset,
}: {
  sources: string[];
  hidden: Set<string>;
  onToggle: (s: string) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const hiddenCount = hidden.size;
  return (
    <div className="adm-srcfilter" ref={ref}>
      <button type="button" className="adm-input adm-srcfilter-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Sources{hiddenCount > 0 ? ` · ${hiddenCount} hidden` : ""}
        <ChevronDownIcon className="h-3 w-3" />
      </button>
      {open && (
        <div className="adm-srcfilter-pop">
          <div className="adm-srcfilter-head">
            <span>Show sources</span>
            {hiddenCount > 0 && <button type="button" className="adm-link" onClick={onReset}>Reset</button>}
          </div>
          {sources.map((s) => (
            <label key={s} className="adm-srcfilter-row">
              <input type="checkbox" checked={!hidden.has(s)} onChange={() => onToggle(s)} />
              {s}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function SavedView({
  saved,
  aiConfigured,
  onRemove,
  onCycleStatus,
  onAi,
  onBrowse,
}: {
  saved: SavedIdeaDTO[];
  aiConfigured: boolean;
  onRemove: (id: string) => void;
  onCycleStatus: (idea: SavedIdeaDTO) => void;
  onAi: (idea: SavedIdeaDTO) => void;
  onBrowse: () => void;
}) {
  if (saved.length === 0) {
    return (
      <div className="adm-card">
        <div className="adm-empty">
          <div className="adm-ill"><BookmarkIcon className="h-[34px] w-[34px]" /></div>
          <h2 className="adm-serif">No saved ideas yet</h2>
          <p>Bookmark a trending story (the ribbon on each card) to keep it here for later.</p>
          <button type="button" className="adm-btn-primary" style={{ marginTop: 16 }} onClick={onBrowse}>
            Browse trending
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="adm-saved-list">
      {saved.map((idea) => (
        <div key={idea.id} className="adm-card adm-saved-row">
          {idea.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={idea.image} alt="" referrerPolicy="no-referrer" className="adm-saved-thumb" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          )}
          <div className="adm-saved-main">
            <div className="adm-trend-meta">
              <span className="adm-trend-src">{idea.source ?? "Saved idea"}</span>
              <span aria-hidden>·</span>
              <span>{timeAgo(idea.savedAt)}</span>
              <button type="button" className={`adm-status-pill ${idea.status}`} onClick={() => onCycleStatus(idea)} title="Click to change status">
                {idea.status}
              </button>
            </div>
            <h3 className="adm-trend-title">{idea.title}</h3>
            {idea.snippet && <p className="adm-trend-snippet">{idea.snippet}</p>}
            <div className="adm-trend-foot">
              {idea.url && (
                <a className="adm-trend-read" href={idea.url} target="_blank" rel="noopener noreferrer">
                  Read original<ExternalLinkIcon className="h-[14px] w-[14px]" />
                </a>
              )}
              <div className="adm-trend-actions">
                {aiConfigured && (
                  <button type="button" className="adm-trend-ai" onClick={() => onAi(idea)} title="Draft help from AI (paid, runs on click)">
                    <SparklesIcon className="h-[15px] w-[15px]" />AI Assist
                  </button>
                )}
                <Link className="adm-trend-write" href={writeHref(idea.title, idea.url ?? undefined)}>
                  <PencilIcon className="h-[15px] w-[15px]" />Turn into draft
                </Link>
                <button type="button" className="adm-saved-del" aria-label="Delete saved idea" onClick={() => onRemove(idea.id)}>
                  <TrashIcon className="h-[16px] w-[16px]" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="adm-trend-grid" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="adm-card adm-trend-card">
          <div className="sk adm-trend-thumb" style={{ borderRadius: 0 }} />
          <div className="adm-trend-body">
            <div className="sk h-3 w-28 rounded" />
            <div className="sk mt-3 h-4 w-full rounded" />
            <div className="sk mt-2 h-4 w-3/4 rounded" />
            <div className="sk mt-3 h-3 w-full rounded" />
            <div className="sk mt-2 h-3 w-5/6 rounded" />
            <div className="adm-trend-foot" style={{ border: "none" }}>
              <div className="sk h-3 w-20 rounded" />
              <div className="sk h-9 w-28 rounded-lg" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="adm-card">
      <div className="adm-empty">
        <div className="adm-ill"><SearchIcon className="h-[34px] w-[34px]" /></div>
        <h2 className="adm-serif">No stories found</h2>
        <p>Try another category, a different search term, or widen the language/country. If you hid sources, reset the filter.</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="adm-card">
      <div className="adm-empty">
        <div className="adm-ill"><TrendingIcon className="h-[34px] w-[34px]" /></div>
        <h2 className="adm-serif">Couldn’t load trending news</h2>
        <p>{message}</p>
        <button type="button" className="adm-btn-primary" style={{ marginTop: 18 }} onClick={onRetry}>
          <RefreshIcon className="h-[17px] w-[17px]" />Try again
        </button>
      </div>
    </div>
  );
}

function ConfigNeeded() {
  return (
    <div className="adm-card" id="ai-setup">
      <div className="adm-empty">
        <div className="adm-ill"><TrendingIcon className="h-[34px] w-[34px]" /></div>
        <h2 className="adm-serif">Add your free GNews API key</h2>
        <p>
          Trending News uses the GNews API. Create a free key at{" "}
          <a className="adm-link" href="https://gnews.io" target="_blank" rel="noopener noreferrer">gnews.io</a>{" "}
          (100 requests/day), then set <code className="adm-fb-code">GNEWS_API_KEY</code> in your
          environment — in Vercel, add it under Project → Settings → Environment Variables for
          Production &amp; Preview, then redeploy.
        </p>
      </div>
    </div>
  );
}
