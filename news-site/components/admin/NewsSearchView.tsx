"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/site";
import { AiAssistModal } from "@/components/admin/AiAssistModal";
import {
  SearchIcon,
  CloseIcon,
  ExternalLinkIcon,
  PencilIcon,
  TrendingIcon,
  SparklesIcon,
  KeyIcon,
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
  configured?: boolean;
  items?: Item[];
  page?: number;
  hasMore?: boolean;
  cached?: boolean;
  notice?: string | null;
  error?: string;
  provider?: string;
};
type Phase = "loading" | "ready" | "error" | "unconfigured";

// Provider-backed News Search (SerpApi / NewsAPI) — keyword + category + region +
// language. Clean result cards reuse the trending card styles + the AI Assist and
// "Write article" flow. Key stays server-side; an unset key shows a setup state.
export function NewsSearchView({
  categories,
  languages,
  countries,
  providerLabel,
  configured,
  aiConfigured,
}: {
  categories: Option[];
  languages: Option[];
  countries: Option[];
  providerLabel: string;
  configured: boolean;
  aiConfigured: boolean;
}) {
  const [category, setCategory] = useState("general");
  const [lang, setLang] = useState("en");
  const [country, setCountry] = useState("us");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");

  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>(configured ? "loading" : "unconfigured");
  const [errorMsg, setErrorMsg] = useState("");
  const [cached, setCached] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [canLoadMore, setCanLoadMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [aiTarget, setAiTarget] = useState<{ headline: string; topic?: string } | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const buildParams = useCallback(
    (p: number) => {
      const params = new URLSearchParams();
      if (query) params.set("query", query);
      params.set("category", category);
      params.set("lang", lang);
      params.set("country", country);
      params.set("page", String(p));
      return params;
    },
    [query, category, lang, country],
  );

  const loadFirst = useCallback(async () => {
    if (!configured) {
      setPhase("unconfigured");
      return;
    }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase("loading");
    setErrorMsg("");
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/news-search?${buildParams(1).toString()}`, { signal: controller.signal });
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (res.status === 503 && data.configured === false) {
        setPhase("unconfigured");
        return;
      }
      if (!res.ok || data.ok === false) {
        setItems([]);
        setErrorMsg(data.error ?? "Couldn’t run the search. Please try again.");
        setPhase("error");
        return;
      }
      setItems(data.items ?? []);
      setCached(Boolean(data.cached));
      setNotice(data.notice ?? null);
      setPage(1);
      setCanLoadMore(Boolean(data.hasMore));
      setPhase("ready");
    } catch {
      if (controller.signal.aborted) return;
      setItems([]);
      setErrorMsg("Couldn’t reach the search service. Please try again.");
      setPhase("error");
    }
  }, [configured, buildParams]);

  async function loadMore() {
    if (loadingMore || !canLoadMore) return;
    setLoadingMore(true);
    const next = page + 1;
    try {
      const res = await fetch(`/api/admin/news-search?${buildParams(next).toString()}`);
      const data = (await res.json().catch(() => ({}))) as ApiResponse;
      if (!res.ok || data.ok === false) {
        setCanLoadMore(false);
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
    } catch {
      setCanLoadMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  // Debounce the search box.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setQuery(searchInput.trim()), 450);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  useEffect(() => {
    loadFirst();
    return () => abortRef.current?.abort();
  }, [loadFirst]);

  if (!configured) {
    return (
      <div className="adm-card">
        <div className="adm-empty">
          <div className="adm-ill"><KeyIcon className="h-[32px] w-[32px]" /></div>
          <h2 className="adm-serif">Add your API key to enable search</h2>
          <p>
            News Search uses <strong>{providerLabel}</strong> (a paid provider). Add its API key in{" "}
            <Link className="adm-link" href="/admin/settings" style={{ display: "inline" }}>API Settings</Link>{" "}
            (or set its env var in Vercel), then come back. The free <strong>Trending</strong> tab works without it.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="adm-trend-resultline" style={{ marginTop: 0 }}>
        Searching via <strong>{providerLabel}</strong>
      </p>

      <div className="adm-trend-controls">
        <div className="adm-filterbar" role="tablist" aria-label="Search categories">
          {categories.map((c) => {
            const active = !query && c.id === category;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`adm-fchip ${active ? "on" : ""}`}
                onClick={() => { setSearchInput(""); setQuery(""); setCategory(c.id); }}
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
              placeholder="Search news…"
              aria-label="Search news"
            />
            {searchInput && (
              <button type="button" className="adm-trend-search-clear" aria-label="Clear search" onClick={() => { setSearchInput(""); setQuery(""); }}>
                <CloseIcon className="h-4 w-4" />
              </button>
            )}
          </div>
          <label className="adm-trend-select">
            <span className="adm-trend-select-lbl">Language</span>
            <select className="adm-input" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="Language">
              {languages.map((l) => (<option key={l.id} value={l.id}>{l.label}</option>))}
            </select>
          </label>
          <label className="adm-trend-select">
            <span className="adm-trend-select-lbl">Region</span>
            <select className="adm-input" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Region">
              {countries.map((c) => (<option key={c.id} value={c.id}>{c.label}</option>))}
            </select>
          </label>
        </div>
      </div>

      {(cached || notice) && phase === "ready" && (
        <p className="adm-trend-resultline">
          {query ? <>Results for <strong>“{query}”</strong></> : <>Top results</>}
          {cached && <span className="adm-trend-cached"> · cached</span>}
          {notice && <span className="adm-trend-cached"> · {notice}</span>}
        </p>
      )}

      {phase === "loading" ? (
        <SkeletonGrid />
      ) : phase === "error" ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill"><TrendingIcon className="h-[32px] w-[32px]" /></div>
            <h2 className="adm-serif">Search unavailable</h2>
            <p>{errorMsg}</p>
            <button type="button" className="adm-btn-primary" style={{ marginTop: 16 }} onClick={() => loadFirst()}>Try again</button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="adm-card">
          <div className="adm-empty">
            <div className="adm-ill"><SearchIcon className="h-[32px] w-[32px]" /></div>
            <h2 className="adm-serif">No results</h2>
            <p>Try another keyword, category, or region.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="adm-trend-grid">
            {items.map((item, i) => (
              <ResultCard
                key={`${item.url}-${i}`}
                item={item}
                aiConfigured={aiConfigured}
                onAi={() => setAiTarget({ headline: item.title, topic: query || category })}
              />
            ))}
          </div>
          <div className="adm-trend-more">
            {canLoadMore && (
              <button type="button" className="adm-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore && <span className="adm-spinner" aria-hidden />}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        </>
      )}

      {aiTarget && (
        <AiAssistModal headline={aiTarget.headline} topic={aiTarget.topic} onClose={() => setAiTarget(null)} />
      )}
    </div>
  );
}

function ResultCard({ item, aiConfigured, onAi }: { item: Item; aiConfigured: boolean; onAi: () => void }) {
  const writeHref = `/admin/articles/new?${new URLSearchParams({ title: item.title, ref: item.url }).toString()}`;
  return (
    <article className="adm-card adm-trend-card">
      <div className="adm-trend-thumb">
        <span className="adm-trend-thumb-fallback" aria-hidden><TrendingIcon className="h-7 w-7" /></span>
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image} alt="" loading="lazy" referrerPolicy="no-referrer" className="adm-trend-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
      </div>
      <div className="adm-trend-body">
        <div className="adm-trend-meta">
          <span className="adm-trend-src">{item.source}</span>
          {item.publishedAt && (<><span aria-hidden>·</span><span>{timeAgo(item.publishedAt)}</span></>)}
        </div>
        <h3 className="adm-trend-title">{item.title}</h3>
        {item.description && <p className="adm-trend-snippet">{item.description}</p>}
        <div className="adm-trend-foot">
          <a className="adm-trend-read" href={item.url} target="_blank" rel="noopener noreferrer">
            Read original<ExternalLinkIcon className="h-[14px] w-[14px]" />
          </a>
          <div className="adm-trend-actions">
            {aiConfigured ? (
              <button type="button" className="adm-trend-ai" onClick={onAi} title="Draft help from AI (paid, runs only on click)">
                <SparklesIcon className="h-[15px] w-[15px]" />AI Assist
              </button>
            ) : (
              <Link className="adm-trend-ai disabled" href="/admin/trending" title="Set up AI to enable">
                <SparklesIcon className="h-[15px] w-[15px]" />Set up AI
              </Link>
            )}
            <Link className="adm-trend-write" href={writeHref}>
              <PencilIcon className="h-[15px] w-[15px]" />Write
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
          </div>
        </div>
      ))}
    </div>
  );
}
