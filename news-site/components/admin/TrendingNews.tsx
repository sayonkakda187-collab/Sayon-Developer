"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/site";
import { AiAssistModal } from "@/components/admin/AiAssistModal";
import { NewsSearchView } from "@/components/admin/NewsSearchView";
import {
  SearchIcon,
  CloseIcon,
  RefreshIcon,
  ExternalLinkIcon,
  PencilIcon,
  TrendingIcon,
  SparklesIcon,
} from "@/components/admin/icons";

type Option = { id: string; label: string };

// A news source surfaced in the selector (mirrors lib/news/sources, kept local
// so this client component never imports a server-only module).
type SourceMeta = { id: string; label: string; site: string; freeNote: string; configured: boolean };
// Per-source status returned with each feed response.
type SourceStatus = { id: string; label: string; configured: boolean; ok: boolean; count: number; note: string | null };

// Normalized inspiration-only item. `via` is which API surfaced it.
type Item = {
  title: string;
  description: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
  via?: string;
};

type ApiResponse = {
  ok?: boolean;
  items?: Item[];
  sources?: SourceStatus[];
  cached?: boolean;
  stale?: boolean;
  page?: number;
  hasMore?: boolean;
  notice?: string | null;
  error?: string;
};

type Phase = "loading" | "ready" | "error";

// Short label for the "via" provenance tag on each card.
const VIA_LABEL: Record<string, string> = {
  gnews: "GNews",
  newsdata: "NewsData",
  thenewsapi: "TheNewsAPI",
  currents: "Currents",
};

export function TrendingNews({
  categories,
  languages,
  countries,
  sources,
  configured,
  aiConfigured,
  newsSearch,
}: {
  categories: Option[];
  languages: Option[];
  countries: Option[];
  // All registered news sources + whether each has a key set.
  sources: SourceMeta[];
  // True when AT LEAST ONE news source is configured.
  configured: boolean;
  // Whether ANTHROPIC_API_KEY is set (server-decided). When false, the AI Assist
  // button shows a "Set up AI" state instead of calling the paid API.
  aiConfigured: boolean;
  // Active paid News Search provider (SerpApi / NewsAPI) + whether its key is set.
  newsSearch: { provider: string; label: string; configured: boolean };
}) {
  // Top-level view: the free aggregated Trending feed, or provider-backed News Search.
  const [view, setView] = useState<"trending" | "search">("trending");
  // Which sources are enabled (default: all configured ones on).
  const [enabled, setEnabled] = useState<Set<string>>(
    () => new Set(sources.filter((s) => s.configured).map((s) => s.id)),
  );
  // Per-source status from the latest fetch (counts / limit notes).
  const [sourceStatus, setSourceStatus] = useState<SourceStatus[]>([]);
  const [category, setCategory] = useState<string>(categories[0]?.id ?? "general");
  // The trending story an AI Assist modal is open for (null = closed). Topic is
  // the active search term or category — sent alongside the headline, never the
  // source's article text.
  const [aiTarget, setAiTarget] = useState<{ headline: string; topic?: string } | null>(null);
  const [lang, setLang] = useState<string>("en");
  const [country, setCountry] = useState<string>("us");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState(""); // the debounced search term

  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>(configured ? "loading" : "error");
  const [errorMsg, setErrorMsg] = useState("");
  const [cached, setCached] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [ceiling, setCeiling] = useState(false); // hit the free-tier page ceiling

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enabledKey = [...enabled].sort().join(",");
  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      else params.set("category", category);
      params.set("lang", lang);
      params.set("country", country);
      params.set("page", String(p));
      if (enabledKey) params.set("sources", enabledKey);
      return params;
    },
    [query, category, lang, country, enabledKey],
  );

  // Load page 1 (replaces the list). Triggered by any filter change.
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
      const res = await fetch(`/api/admin/trending?${buildParams(1).toString()}`, {
        signal: controller.signal,
      });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || data.ok === false) {
        setItems([]);
        setErrorMsg(data.error ?? "Couldn’t load trending stories. Please try again.");
        setPhase("error");
        return;
      }
      setItems(data.items ?? []);
      setSourceStatus(data.sources ?? []);
      setCached(Boolean(data.cached));
      setNotice(data.notice ?? null);
      setPage(1);
      setCanLoadMore(Boolean(data.hasMore));
      setPhase("ready");
    } catch {
      if (controller.signal.aborted) return;
      setItems([]);
      setErrorMsg("Couldn’t load trending stories. Please check your connection and try again.");
      setPhase("error");
    }
  }, [configured, buildParams]);

  // Append the next page; dedupe by URL. A failed/empty page on the free tier
  // (no pagination) just means "that's all" — shown as a friendly ceiling note.
  async function loadMore() {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/admin/trending?${buildParams(next).toString()}`);
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || data.ok === false) {
        // A failed "load more" just means no further pages on this tier.
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
      const more = Boolean(data.hasMore) && added > 0;
      setCanLoadMore(more);
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

  // Reload page 1 whenever any input changes — but only while the Trending view
  // is active (don't spend a GNews call when the News Search tab is showing).
  useEffect(() => {
    if (view !== "trending") return;
    loadFirst();
    return () => abortRef.current?.abort();
  }, [loadFirst, view]);

  function clearSearch() {
    setSearchInput("");
    setQuery("");
  }
  function pickCategory(id: string) {
    setSearchInput("");
    setQuery("");
    setCategory(id);
  }
  // Toggle a configured source on/off (triggers a reload via buildParams deps).
  function toggleSource(id: string) {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size === 1) return prev; // keep at least one source enabled
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }
  // Quick status lookup by source id from the latest fetch.
  const statusById = (id: string) => sourceStatus.find((s) => s.id === id);

  return (
    <div>
      <div className="adm-pagehead">
        <div className="adm-page-h" style={{ marginBottom: 0 }}>
          <h1>Trending News</h1>
          <p>Discover trending headlines, then start an original draft from one.</p>
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

      {/* View toggle: free aggregated Trending vs. provider-backed News Search. */}
      <div className="adm-seg" role="tablist" aria-label="View" style={{ marginBottom: 14 }}>
        <button type="button" role="tab" aria-selected={view === "trending"} className={`adm-seg-btn ${view === "trending" ? "on" : ""}`} onClick={() => setView("trending")}>
          Trending feed
        </button>
        <button type="button" role="tab" aria-selected={view === "search"} className={`adm-seg-btn ${view === "search" ? "on" : ""}`} onClick={() => setView("search")}>
          News Search
          {!newsSearch.configured && <span className="adm-seg-tag">setup</span>}
        </button>
      </div>

      {view === "search" ? (
        <NewsSearchView
          categories={categories}
          languages={languages}
          countries={countries}
          providerLabel={newsSearch.label}
          configured={newsSearch.configured}
          aiConfigured={aiConfigured}
        />
      ) : (
      <>
      {/* Inspiration-only / originality reminder — always visible. */}
      <div className="adm-trend-note" role="note">
        <span className="adm-trend-note-ic" aria-hidden>
          <TrendingIcon className="h-[18px] w-[18px]" />
        </span>
        <p>
          <strong>Inspiration only — never copy.</strong> These are trending headlines from
          around the web, shown as story ideas. Pick one and we’ll open a fresh draft with the
          headline as a working title and a link to the source for your research. Always write the
          article <strong>in your own words</strong> — copying a source’s text is copyright
          infringement.
        </p>
      </div>

      {/* Source selector: toggle which free news APIs feed the combined feed. */}
      <div className="adm-srcbar" role="group" aria-label="News sources">
        <span className="adm-srcbar-lbl">Sources</span>
        {sources.map((s) => {
          const st = statusById(s.id);
          const on = enabled.has(s.id);
          const note = !s.configured
            ? "not set up"
            : st?.note && st.note !== "off"
              ? st.note
              : on && st
                ? `${st.count}`
                : null;
          return (
            <button
              key={s.id}
              type="button"
              role="switch"
              aria-checked={s.configured && on}
              className={`adm-srcchip ${!s.configured ? "off" : on ? "on" : ""}`}
              onClick={() => s.configured && toggleSource(s.id)}
              disabled={!s.configured}
              title={s.configured ? `${s.label} · ${s.freeNote}` : `${s.label} — add ${s.site} key to enable`}
            >
              <span className="adm-srcchip-dot" aria-hidden />
              {s.label}
              {note !== null && <span className="adm-srcchip-n">{note}</span>}
            </button>
          );
        })}
      </div>

      {/* Controls: category tabs + keyword search + language/country. */}
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
              <button
                type="button"
                className="adm-trend-search-clear"
                aria-label="Clear search"
                onClick={clearSearch}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>

          <label className="adm-trend-select">
            <span className="adm-trend-select-lbl">Language</span>
            <select className="adm-input" value={lang} onChange={(e) => setLang(e.target.value)} disabled={!configured} aria-label="Language">
              {languages.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </label>
          <label className="adm-trend-select">
            <span className="adm-trend-select-lbl">Country</span>
            <select className="adm-input" value={country} onChange={(e) => setCountry(e.target.value)} disabled={!configured} aria-label="Country">
              {countries.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {(query || cached || notice) && phase === "ready" && (
        <p className="adm-trend-resultline">
          {query ? <>Showing results for <strong>“{query}”</strong></> : <>Top headlines</>}
          {cached && <span className="adm-trend-cached"> · cached</span>}
          {notice && <span className="adm-trend-cached"> · {notice}</span>}
        </p>
      )}

      {/* ── Content states ── */}
      {!configured ? (
        <ConfigNeeded sources={sources} />
      ) : phase === "loading" ? (
        <SkeletonGrid />
      ) : phase === "error" ? (
        <ErrorState message={errorMsg} onRetry={() => loadFirst()} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          <div className="adm-trend-grid">
            {items.map((item, i) => (
              <TrendingCard
                key={`${item.url}-${i}`}
                item={item}
                aiConfigured={aiConfigured}
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
                That’s all the combined free tiers return for now. Enable more sources above, or a
                paid plan on one provider would be needed for higher volume.
              </p>
            ) : null}
          </div>
        </>
      )}
      </>
      )}

      {aiTarget && (
        <AiAssistModal
          headline={aiTarget.headline}
          topic={aiTarget.topic}
          onClose={() => setAiTarget(null)}
        />
      )}
    </div>
  );
}

function TrendingCard({
  item,
  aiConfigured,
  onAi,
}: {
  item: Item;
  aiConfigured: boolean;
  onAi: () => void;
}) {
  // Reuse the existing create-article flow: link to the new-article editor with
  // the headline + source URL as query params. No separate publishing path, and
  // the source's article text is never carried over — only the title + a
  // reference link the writer researches from.
  const writeHref = `/admin/articles/new?${new URLSearchParams({
    title: item.title,
    ref: item.url,
  }).toString()}`;

  return (
    <article className="adm-card adm-trend-card">
      <div className="adm-trend-thumb">
        <span className="adm-trend-thumb-fallback" aria-hidden>
          <TrendingIcon className="h-7 w-7" />
        </span>
        {item.image && (
          // News images come from many domains; a plain <img> avoids configuring
          // next/image remotePatterns for every possible source host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="adm-trend-img"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        )}
      </div>

      <div className="adm-trend-body">
        <div className="adm-trend-meta">
          <span className="adm-trend-src">{item.source}</span>
          {item.publishedAt && (
            <>
              <span aria-hidden>·</span>
              <span>{timeAgo(item.publishedAt)}</span>
            </>
          )}
          {item.via && <span className="adm-trend-via" title={`Found via ${VIA_LABEL[item.via] ?? item.via}`}>{VIA_LABEL[item.via] ?? item.via}</span>}
        </div>

        <h3 className="adm-trend-title">{item.title}</h3>
        {item.description && <p className="adm-trend-snippet">{item.description}</p>}

        <div className="adm-trend-foot">
          <a className="adm-trend-read" href={item.url} target="_blank" rel="noopener noreferrer">
            Read original
            <ExternalLinkIcon className="h-[14px] w-[14px]" />
          </a>
          <div className="adm-trend-actions">
            {aiConfigured ? (
              <button
                type="button"
                className="adm-trend-ai"
                onClick={onAi}
                title="Draft help from AI (paid, runs only on click)"
              >
                <SparklesIcon className="h-[15px] w-[15px]" />
                AI Assist
              </button>
            ) : (
              <Link
                className="adm-trend-ai disabled"
                href="/admin/trending#ai-setup"
                title="Set up AI to enable"
              >
                <SparklesIcon className="h-[15px] w-[15px]" />
                Set up AI
              </Link>
            )}
            <Link className="adm-trend-write" href={writeHref}>
              <PencilIcon className="h-[15px] w-[15px]" />
              Write
            </Link>
          </div>
        </div>
      </div>
    </article>
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
        <div className="adm-ill">
          <SearchIcon className="h-[34px] w-[34px]" />
        </div>
        <h2 className="adm-serif">No stories found</h2>
        <p>Try another category, a different search term, or widen the language/country.</p>
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="adm-card">
      <div className="adm-empty">
        <div className="adm-ill">
          <TrendingIcon className="h-[34px] w-[34px]" />
        </div>
        <h2 className="adm-serif">Couldn’t load trending news</h2>
        <p>{message}</p>
        <button type="button" className="adm-btn-primary" style={{ marginTop: 18 }} onClick={onRetry}>
          <RefreshIcon className="h-[17px] w-[17px]" />
          Try again
        </button>
      </div>
    </div>
  );
}

function ConfigNeeded({ sources }: { sources: SourceMeta[] }) {
  return (
    <div className="adm-card">
      <div className="adm-empty">
        <div className="adm-ill">
          <TrendingIcon className="h-[34px] w-[34px]" />
        </div>
        <h2 className="adm-serif">Add a free news API key</h2>
        <p>
          Trending News aggregates several free news APIs — add at least one key to get started.
          Each is free; set its env var in Vercel (Project → Settings → Environment Variables for
          Production &amp; Preview), then redeploy.
        </p>
        <ul className="adm-srclist">
          {sources.map((s) => (
            <li key={s.id}>
              <a className="adm-link" href={`https://${s.site}`} target="_blank" rel="noopener noreferrer">{s.label}</a>
              {" — "}{s.freeNote}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
