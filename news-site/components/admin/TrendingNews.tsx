"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { timeAgo } from "@/lib/site";
import {
  SearchIcon,
  CloseIcon,
  RefreshIcon,
  ExternalLinkIcon,
  PencilIcon,
  TrendingIcon,
} from "@/components/admin/icons";

type Category = { id: string; label: string };

// Mirrors lib/gnews `TrendingItem`. Declared here so this client component never
// imports the server-only GNews module.
type Item = {
  title: string;
  description: string;
  source: string;
  url: string;
  image: string | null;
  publishedAt: string | null;
};

type Phase = "loading" | "ready" | "error";

export function TrendingNews({
  categories,
  configured,
}: {
  categories: Category[];
  configured: boolean;
}) {
  const [category, setCategory] = useState<string>(categories[0]?.id ?? "general");
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState(""); // the submitted search term
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>(configured ? "loading" : "error");
  const [errorMsg, setErrorMsg] = useState("");
  const [cached, setCached] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (cat: string, q: string) => {
      if (!configured) {
        setPhase("error");
        return;
      }
      // Cancel any in-flight request so fast tab/search switches don't race.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPhase("loading");
      setErrorMsg("");
      try {
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        else params.set("category", cat);
        const res = await fetch(`/api/admin/trending?${params.toString()}`, {
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          items?: Item[];
          cached?: boolean;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          setItems([]);
          setErrorMsg(data.error ?? "Couldn’t load trending stories. Please try again.");
          setPhase("error");
          return;
        }
        setItems(data.items ?? []);
        setCached(Boolean(data.cached));
        setPhase("ready");
      } catch {
        if (controller.signal.aborted) return; // superseded by a newer request
        setItems([]);
        setErrorMsg(
          "Couldn’t load trending stories. Please check your connection and try again.",
        );
        setPhase("error");
      }
    },
    [configured],
  );

  useEffect(() => {
    load(category, query);
    return () => abortRef.current?.abort();
  }, [category, query, load]);

  function onSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQuery(searchInput.trim());
  }
  function clearSearch() {
    setSearchInput("");
    if (query) setQuery("");
  }
  function pickCategory(id: string) {
    setSearchInput("");
    setQuery("");
    setCategory(id);
  }

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
          onClick={() => load(category, query)}
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
          <strong>Inspiration only — never copy.</strong> These are trending headlines from
          around the web, shown as story ideas. Pick one and we’ll open a fresh draft with the
          headline as a working title and a link to the source for your research. Always write the
          article <strong>in your own words</strong> — copying a source’s text is copyright
          infringement.
        </p>
      </div>

      {/* Controls: category tabs + keyword search. */}
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

        <form className="adm-trend-search" role="search" onSubmit={onSearchSubmit}>
          <SearchIcon className="adm-trend-search-ic h-4 w-4" />
          <input
            className="adm-input"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search a topic…"
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
        </form>
      </div>

      {query && phase === "ready" && (
        <p className="adm-trend-resultline">
          Showing results for <strong>“{query}”</strong>
          {cached && <span className="adm-trend-cached"> · cached</span>}
        </p>
      )}

      {/* ── Content states ── */}
      {!configured ? (
        <ConfigNeeded />
      ) : phase === "loading" ? (
        <SkeletonGrid />
      ) : phase === "error" ? (
        <ErrorState message={errorMsg} onRetry={() => load(category, query)} />
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="adm-trend-grid">
          {items.map((item, i) => (
            <TrendingCard key={`${item.url}-${i}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function TrendingCard({ item }: { item: Item }) {
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
        </div>

        <h3 className="adm-trend-title">{item.title}</h3>
        {item.description && <p className="adm-trend-snippet">{item.description}</p>}

        <div className="adm-trend-foot">
          <a
            className="adm-trend-read"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Read original
            <ExternalLinkIcon className="h-[14px] w-[14px]" />
          </a>
          <Link className="adm-trend-write" href={writeHref}>
            <PencilIcon className="h-[15px] w-[15px]" />
            Write article
          </Link>
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
        <p>Try another category or a different search term.</p>
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

function ConfigNeeded() {
  return (
    <div className="adm-card">
      <div className="adm-empty">
        <div className="adm-ill">
          <TrendingIcon className="h-[34px] w-[34px]" />
        </div>
        <h2 className="adm-serif">Add your free GNews API key</h2>
        <p>
          Trending News uses the GNews API. Create a free key at{" "}
          <a
            className="adm-link"
            href="https://gnews.io"
            target="_blank"
            rel="noopener noreferrer"
          >
            gnews.io
          </a>{" "}
          (100 requests/day), then set <code className="adm-fb-code">GNEWS_API_KEY</code> in your
          environment — in Vercel, add it under Project → Settings → Environment Variables for
          Production &amp; Preview, then redeploy.
        </p>
      </div>
    </div>
  );
}
