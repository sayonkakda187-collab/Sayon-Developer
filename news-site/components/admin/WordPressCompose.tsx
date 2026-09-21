"use client";

import { useState } from "react";
import {
  draftWordPressArticle, fetchWordPressTrending,
} from "@/app/admin/wordpress-actions";
import type { WpAiDraft, WpComposeStatus, WpTrendingItem } from "@/lib/wordpress/types";
import { AI_MODELS } from "@/lib/aiModels";
import { useAiModel } from "@/lib/useAiModel";
import { SparklesIcon, TrendingIcon, RefreshIcon } from "@/components/admin/icons";

/**
 * "Find a story" — trending headlines plus AI drafting, feeding the WordPress
 * editor above it.
 *
 * Both halves reuse the pipelines that already power /admin/trending and the
 * article editor's AI Assist: the same keys, prompts and originality
 * guardrails. Nothing here talks to an external service directly — it calls
 * server actions, which is also why no API key can reach this component.
 *
 * INSPIRATION ONLY, and that is not a disclaimer bolted on afterwards: the
 * model is given the HEADLINE and topic, never the source article's text. It
 * writes from general knowledge. The source link is shown so the editor can
 * read the original themselves and verify before publishing.
 */

type Option = { id: string; label: string };

export function WordPressCompose({
  status, categories, onApply, busy,
}: {
  status: WpComposeStatus;
  categories: Option[];
  onApply: (draft: WpAiDraft, sourceUrl?: string) => void;
  busy: boolean;
}) {
  const [model, setModel] = useAiModel();
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState(categories[0]?.id ?? "general");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [items, setItems] = useState<WpTrendingItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [drafting, setDrafting] = useState<string | null>(null); // the headline being written
  const [draftError, setDraftError] = useState<string | null>(null);
  const [lastDraft, setLastDraft] = useState<WpAiDraft | null>(null);

  async function loadFeed(nextPage = 1) {
    setLoadingFeed(true);
    setFeedError(null);
    const res = await fetchWordPressTrending({ category, query: search, page: nextPage });
    setLoadingFeed(false);
    if (!res.ok) { setFeedError(res.message); setItems([]); return; }
    setItems(nextPage === 1 ? res.data : [...items, ...res.data]);
    setPage(nextPage);
  }

  async function draft(headline: string, sourceUrl?: string) {
    setDrafting(headline);
    setDraftError(null);
    const res = await draftWordPressArticle({ headline, topic: topic.trim(), model });
    setDrafting(null);
    if (!res.ok) { setDraftError(res.message); return; }
    setLastDraft(res.data);
    onApply(res.data, sourceUrl);
  }

  const disabled = busy || drafting !== null;

  return (
    <div className="adm-card adm-card-pad">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="adm-card-title">Find a story</div>
          <div className="adm-card-sub" style={{ marginTop: 2 }}>
            Draft an original article from a trending headline or your own topic, then edit it above
            before publishing.
          </div>
        </div>
        {AI_MODELS.length > 1 && status.aiConfigured && (
          <label className="adm-field" style={{ minWidth: 168 }}>
            <span className="adm-field-hint">AI model</span>
            <select className="adm-input" value={model} onChange={(e) => setModel(e.target.value)}>
              {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        )}
      </div>

      {!status.aiConfigured && (
        <div className="adm-card-sub" style={{
          marginTop: 12, padding: "9px 11px", borderRadius: 10,
          border: "1px solid var(--adm-bd)", background: "rgba(245,158,11,0.10)",
        }}>
          AI drafting needs <code>ANTHROPIC_API_KEY</code> in your environment, then a redeploy.
          Trending headlines below still work without it — you can pick one and write it yourself.
        </div>
      )}

      {/* ── write about anything ─────────────────────────────────────────── */}
      <div style={{ marginTop: 14 }}>
        <label className="adm-field">
          <span>Your topic <span className="adm-field-hint" style={{ display: "inline" }}>(a headline, or what the piece should cover)</span></span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              className="adm-input" value={topic} style={{ flex: 1, minWidth: 200 }}
              onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && topic.trim() && status.aiConfigured) void draft(topic.trim()); }}
              placeholder="e.g. Cambodia's garment exports in 2026"
            />
            <button
              type="button" className="adm-btn-primary"
              disabled={disabled || !topic.trim() || !status.aiConfigured}
              onClick={() => void draft(topic.trim())}
              title={!status.aiConfigured ? "Set ANTHROPIC_API_KEY to enable drafting" : undefined}
            >
              {drafting === topic.trim()
                ? <span className="adm-spinner" aria-hidden />
                : <SparklesIcon className="h-4 w-4" />}
              Write with AI
            </button>
          </div>
        </label>
      </div>

      {draftError && (
        <div className="adm-card-sub" style={{
          marginTop: 10, padding: "9px 11px", borderRadius: 10,
          border: "1px solid var(--adm-bd)", background: "rgba(190,60,60,0.08)", color: "rgb(150,40,40)",
        }}>
          {draftError}
        </div>
      )}

      {lastDraft && (
        <div className="adm-card-sub" style={{
          marginTop: 10, padding: "9px 11px", borderRadius: 10,
          border: "1px solid var(--adm-bd)", background: "rgb(var(--sa) / 0.08)",
        }}>
          <strong>Draft applied to the editor above.</strong>{" "}
          {lastDraft.brief && <span>{lastDraft.brief}</span>}
          {lastDraft.headlines.length > 1 && (
            <div style={{ marginTop: 8 }}>
              <span className="adm-field-hint">Other headlines — click to use:</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                {lastDraft.headlines.slice(1).map((h) => (
                  <button
                    key={h} type="button" className="adm-btn-ghost"
                    style={{ fontSize: 12, padding: "4px 9px" }}
                    onClick={() => onApply({ ...lastDraft, title: h })}
                  >
                    {h}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="adm-field-hint" style={{ marginTop: 8 }}>
            Written from the headline only — the source article was never sent to the model.
            Read the original and check the facts before publishing.
          </div>
        </div>
      )}

      {/* ── trending ─────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 18, borderTop: "1px solid var(--adm-bd)", paddingTop: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="adm-card-title" style={{ flex: 1, fontSize: 14 }}>
            <span style={{ display: "inline-flex", verticalAlign: "-3px", marginRight: 6 }}>
              <TrendingIcon className="h-4 w-4" />
            </span>
            Trending headlines
          </div>
          <button type="button" className="adm-btn-ghost" disabled={loadingFeed} onClick={() => void loadFeed(1)}>
            {loadingFeed ? <span className="adm-spinner" aria-hidden /> : <RefreshIcon className="h-4 w-4" />}
            {items.length ? "Refresh" : "Load headlines"}
          </button>
        </div>

        {!status.newsConfigured ? (
          <div className="adm-card-sub" style={{ marginTop: 10 }}>
            No news source is set up. Add a free key — <code>GNEWS_API_KEY</code>,{" "}
            <code>NEWSDATA_API_KEY</code>, <code>THENEWSAPI_KEY</code> or{" "}
            <code>CURRENTSAPI_KEY</code> — and redeploy.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0" }}>
              <div className="adm-seg" role="tablist" aria-label="Trending category">
                {categories.slice(0, 7).map((c) => (
                  <button
                    key={c.id} type="button" role="tab" aria-selected={category === c.id}
                    className={`adm-seg-btn ${category === c.id ? "on" : ""}`}
                    onClick={() => { setCategory(c.id); setItems([]); setPage(1); }}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              <input
                className="adm-input" value={search} placeholder="Search headlines…"
                style={{ flex: 1, minWidth: 150 }}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void loadFeed(1); }}
              />
            </div>

            {feedError && (
              <div className="adm-card-sub" style={{
                padding: "9px 11px", borderRadius: 10, border: "1px solid var(--adm-bd)",
                background: "rgba(190,60,60,0.08)", color: "rgb(150,40,40)",
              }}>
                {feedError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it) => (
                <div key={it.url} style={{
                  display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px",
                  border: "1px solid var(--adm-bd)", borderRadius: 12, background: "var(--adm-card)",
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.4 }}>{it.title}</div>
                    <div className="adm-card-sub" style={{ marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {it.source && <span>{it.source}</span>}
                      {it.publishedAt && <span>{new Date(it.publishedAt).toLocaleString()}</span>}
                      <a className="adm-link" href={it.url} target="_blank" rel="noopener noreferrer">
                        Read the original
                      </a>
                    </div>
                  </div>
                  <button
                    type="button" className="adm-btn-ghost" style={{ flex: "none" }}
                    disabled={disabled || !status.aiConfigured}
                    onClick={() => void draft(it.title, it.url)}
                    title={status.aiConfigured ? "Draft an original article about this" : "Set ANTHROPIC_API_KEY to enable drafting"}
                  >
                    {drafting === it.title
                      ? <span className="adm-spinner" aria-hidden />
                      : <SparklesIcon className="h-4 w-4" />}
                    Write with AI
                  </button>
                </div>
              ))}
            </div>

            {items.length > 0 && (
              <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
                <button type="button" className="adm-btn-ghost" disabled={loadingFeed}
                        onClick={() => void loadFeed(page + 1)}>
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
