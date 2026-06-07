"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import {
  listSharedArticles,
  getShareResults,
  type ShareResultRow,
} from "@/app/admin/facebook-actions";
import { formatDate, formatNumber } from "@/lib/site";
import { RefreshIcon } from "@/components/admin/icons";

type ArticleOpt = { id: string; title: string; posts: number; lastAt: string | null };

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 52 }}>
      <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 15, fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : formatNumber(value)}
      </span>
      <span className="adm-fb-sub" style={{ fontSize: 11 }}>{label}</span>
    </span>
  );
}

/**
 * "Share results" panel: pick a shared article and see how each page's post is
 * doing — reactions / comments / shares always, plus reach + impressions when the
 * `read_insights` permission is granted. Read live from the Graph API on demand
 * (Refresh re-reads). Self-fetches; renders nothing until something's been shared.
 */
export function FacebookShareResults() {
  const { error } = useToast();
  const [articles, setArticles] = useState<ArticleOpt[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(true);
  const [articleId, setArticleId] = useState("");
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<ShareResultRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listSharedArticles().then((res) => {
      if (cancelled) return;
      if (res.ok) setArticles(res.data.articles);
      else error(res.error);
      setLoadingArticles(false);
    });
    return () => {
      cancelled = true;
    };
  }, [error]);

  async function load(id: string) {
    if (!id) {
      setRows(null);
      setTitle("");
      return;
    }
    setLoading(true);
    const res = await getShareResults({ articleId: id });
    setLoading(false);
    if (res.ok) {
      setRows(res.data.results);
      setTitle(res.data.articleTitle);
    } else {
      error(res.error);
    }
  }

  // Nothing has been shared yet → don't render the panel at all.
  if (!loadingArticles && articles.length === 0) return null;

  const allInsightsUnavailable = (rows?.length ?? 0) > 0 && rows!.every((r) => r.insightsUnavailable);

  return (
    <div className="adm-card adm-card-pad" style={{ marginBottom: 22 }}>
      <div className="adm-list-head" style={{ alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="adm-card-title">Share results</div>
          <div className="adm-card-sub" style={{ marginTop: 2 }}>
            Pick a shared article to see how each page’s post is doing — live from Facebook.
          </div>
        </div>
        {articleId && (
          <button
            type="button"
            className="adm-btn-ghost"
            onClick={() => load(articleId)}
            disabled={loading}
            title="Reload the latest numbers"
          >
            <RefreshIcon className={`h-4 w-4 ${loading ? "adm-spinning" : ""}`} /> Refresh
          </button>
        )}
      </div>

      <label className="adm-field" style={{ marginTop: 12, maxWidth: 520 }}>
        <span>Article</span>
        <select
          className="adm-input"
          value={articleId}
          disabled={loadingArticles}
          onChange={(e) => {
            setArticleId(e.target.value);
            load(e.target.value);
          }}
          aria-label="Shared article"
        >
          <option value="">{loadingArticles ? "Loading…" : "Choose a shared article…"}</option>
          {articles.map((a) => (
            <option key={a.id} value={a.id}>
              {a.title} · {a.posts} post{a.posts === 1 ? "" : "s"}
              {a.lastAt ? ` · ${formatDate(a.lastAt)}` : ""}
            </option>
          ))}
        </select>
      </label>

      {loading ? (
        <p className="adm-card-sub" style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span className="adm-spinner" aria-hidden /> Loading results from Facebook…
        </p>
      ) : rows == null ? null : rows.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 16 }}>No posted shares found for “{title}”.</p>
      ) : (
        <>
          {allInsightsUnavailable && (
            <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 12 }}>
              Reach &amp; impressions need Facebook’s <strong>read_insights</strong> permission — reconnect your
              Pages granting it to see “views”. Reactions / comments / shares below work without it.
            </p>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12, marginTop: 14 }}>
            {rows.map((r, i) => (
              <div key={`${r.pageDbId}-${i}`} style={{ border: "1px solid var(--adm-bd)", borderRadius: 14, padding: 12, background: "var(--adm-card)" }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 700, color: "var(--adm-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                    {r.pageName}
                  </span>
                  <a href={r.permalink} target="_blank" rel="noreferrer" className="adm-link" style={{ fontSize: 12.5, flex: "none" }}>
                    View post →
                  </a>
                </div>
                <div className="adm-fb-sub" style={{ marginTop: 2 }}>
                  {r.postedAt ? `Posted ${formatDate(r.postedAt)}` : "Posted"}
                </div>
                {r.ok ? (
                  <>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
                      <Stat label="Reactions" value={r.reactions} />
                      <Stat label="Comments" value={r.comments} />
                      <Stat label="Shares" value={r.shares} />
                      <Stat label="Reach" value={r.reach} />
                    </div>
                    {r.impressions != null && (
                      <div className="adm-fb-sub" style={{ marginTop: 6 }}>{formatNumber(r.impressions)} impressions</div>
                    )}
                  </>
                ) : (
                  <p className="adm-fb-sub" style={{ color: "#b45309", marginTop: 8 }}>{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
