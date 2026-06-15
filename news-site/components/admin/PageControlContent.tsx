"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/Toast";
import { RefreshIcon, ExternalLinkIcon } from "@/components/admin/icons";
import { formatDate, formatNumber } from "@/lib/site";
import type { PagePost, PostReactions, ReactionKey } from "@/lib/facebook";

type Sort = "recent" | "engagement";

function engagementOf(p: PagePost): number {
  return (p.reactions ?? 0) + (p.comments ?? 0) + (p.shares ?? 0);
}

// Emoji + colour per reaction emotion (order matches the Graph breakdown). Emoji
// keeps it asset-free + theme-safe; the colours tint the tiny proportion bar.
const REACTION_META: { key: ReactionKey; emoji: string; label: string; color: string }[] = [
  { key: "like", emoji: "👍", label: "Like", color: "#1877f2" },
  { key: "love", emoji: "❤️", label: "Love", color: "#f3425f" },
  { key: "haha", emoji: "😆", label: "Haha", color: "#f7b928" },
  { key: "wow", emoji: "😮", label: "Wow", color: "#00b3a4" },
  { key: "sad", emoji: "😢", label: "Sad", color: "#8a5cf6" },
  { key: "angry", emoji: "😡", label: "Angry", color: "#e9710f" },
];

/**
 * Compact per-emotion reaction breakdown: a tiny proportion bar + emoji/counts for
 * the reactions present. Renders nothing when all counts are zero (the card's total
 * "Reactions" stat still shows), so a missing/retired metric degrades silently.
 */
function ReactionBreakdown({ counts }: { counts: PostReactions }) {
  const items = REACTION_META.map((m) => ({ ...m, n: counts[m.key] ?? 0 })).filter((m) => m.n > 0);
  const total = items.reduce((s, m) => s + m.n, 0);
  if (total === 0) return null;
  return (
    <div style={{ marginTop: 10 }}>
      <div
        className="adm-bar-track"
        style={{ height: 6, borderRadius: 4, overflow: "hidden", display: "flex" }}
        role="img"
        aria-label={`Reactions — ${items.map((m) => `${m.label}: ${m.n}`).join(", ")}`}
      >
        {items.map((m) => (
          <div key={m.key} style={{ width: `${(m.n / total) * 100}%`, background: m.color, height: "100%" }} />
        ))}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 7 }}>
        {items.map((m) => (
          <span key={m.key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }} title={`${m.label}: ${formatNumber(m.n)}`}>
            <span aria-hidden style={{ fontSize: 13.5, lineHeight: 1 }}>{m.emoji}</span>
            <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontVariantNumeric: "tabular-nums" }}>{formatNumber(m.n)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | null }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", minWidth: 46 }}>
      <span style={{ fontWeight: 700, color: "var(--adm-ink)", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
        {value == null ? "—" : formatNumber(value)}
      </span>
      <span className="adm-fb-sub" style={{ fontSize: 10.5 }}>{label}</span>
    </span>
  );
}

/** One real published post: thumbnail, caption excerpt, date, engagement + reach,
 *  and a "View on Facebook" permalink. Shared by Content and the Summary preview. */
export function PagePostCard({ post }: { post: PagePost }) {
  const caption = post.message?.replace(/\s+/g, " ").trim() ?? "";
  return (
    <div className="adm-card adm-pc-post">
      {post.thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="adm-pc-post-img" src={post.thumbnail} alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="adm-pc-post-img adm-pc-post-noimg" aria-hidden>
          <span>No image</span>
        </div>
      )}
      <div className="adm-pc-post-body">
        <p className="adm-pc-post-cap">{caption || <span className="adm-fb-sub">(No caption)</span>}</p>
        <div className="adm-fb-sub" style={{ marginTop: 2 }}>{post.createdTime ? formatDate(post.createdTime) : "Published"}</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10 }}>
          <Stat label="Reactions" value={post.reactions} />
          <Stat label="Comments" value={post.comments} />
          <Stat label="Shares" value={post.shares} />
          <Stat label="Reach" value={post.reach} />
        </div>
        {post.reactionsByType ? (
          <ReactionBreakdown counts={post.reactionsByType} />
        ) : (post.reactions ?? 0) > 0 ? (
          <p className="adm-fb-sub" style={{ fontSize: 10.5, marginTop: 8 }}>Reaction breakdown not available.</p>
        ) : null}
        {post.videoAdImpressions != null && post.videoAdImpressions > 0 && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, padding: "3px 9px", borderRadius: 999, background: "rgba(37,99,235,.10)", color: "#2563eb", fontSize: 12, fontWeight: 700 }} title="Ad impressions served in this video's ad breaks — not earnings">
            <span aria-hidden>▶</span>
            <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatNumber(post.videoAdImpressions)}</span>
            <span style={{ fontWeight: 600 }}>ad-break impressions</span>
          </div>
        )}
        <a
          href={post.permalink}
          target="_blank"
          rel="noreferrer"
          className="adm-link"
          style={{ marginTop: 10, fontSize: 12.5, display: "inline-flex", alignItems: "center", gap: 4 }}
        >
          View on Facebook <ExternalLinkIcon className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

function Skeletons() {
  return (
    <div className="adm-pc-posts">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="adm-card adm-pc-post" aria-hidden>
          <div className="adm-pc-post-img adm-pc-skel" />
          <div className="adm-pc-post-body">
            <div className="adm-pc-skel" style={{ height: 14, borderRadius: 6, width: "90%" }} />
            <div className="adm-pc-skel" style={{ height: 14, borderRadius: 6, width: "60%", marginTop: 8 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Page Control → Content: a Page's REAL published posts pulled live from the Graph
 * API (cached ~6h server-side). Cursor "Load more", a sort toggle (Most recent /
 * Most engagement, applied over loaded posts), and a Refresh. Lazy — only fetched
 * when this sub-tab mounts. A token without the needed scope shows the same
 * "Needs reconnect" state as Insights.
 */
export function PageControlContent({ pageDbId, apiBase = "/api/admin/page-control" }: { pageDbId: string; apiBase?: string }) {
  const API = `${apiBase}/posts`;
  const { error } = useToast();
  const [posts, setPosts] = useState<PagePost[]>([]);
  const [after, setAfter] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("recent");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reconnect, setReconnect] = useState(false);

  const load = useCallback(
    (refresh = false) => {
      setLoading(true);
      fetch(`${API}?page=${encodeURIComponent(pageDbId)}${refresh ? "&refresh=1" : ""}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((json) => {
          if (!json.ok) {
            error(json.error || "Couldn’t load this Page’s posts.");
            return;
          }
          setReconnect(json.status === "reconnect");
          setPosts(Array.isArray(json.posts) ? json.posts : []);
          setAfter(typeof json.after === "string" ? json.after : null);
        })
        .catch(() => error("Couldn’t load this Page’s posts."))
        .finally(() => setLoading(false));
    },
    [pageDbId, error, API],
  );

  useEffect(() => {
    load(false);
  }, [load]);

  function loadMore() {
    if (!after || loadingMore) return;
    setLoadingMore(true);
    fetch(`${API}?page=${encodeURIComponent(pageDbId)}&after=${encodeURIComponent(after)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) {
          error(json.error || "Couldn’t load more posts.");
          return;
        }
        setPosts((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const next = (json.posts as PagePost[]).filter((p) => !seen.has(p.id));
          return [...prev, ...next];
        });
        setAfter(typeof json.after === "string" ? json.after : null);
      })
      .catch(() => error("Couldn’t load more posts."))
      .finally(() => setLoadingMore(false));
  }

  const view = sort === "engagement" ? [...posts].sort((a, b) => engagementOf(b) - engagementOf(a)) : posts;

  return (
    <div>
      <div className="adm-list-head" style={{ alignItems: "center", flexWrap: "wrap", gap: 10 }}>
        <div className="adm-seg" role="tablist" aria-label="Sort posts">
          <button type="button" role="tab" aria-selected={sort === "recent"} className={`adm-seg-btn ${sort === "recent" ? "on" : ""}`} onClick={() => setSort("recent")}>
            Most recent
          </button>
          <button type="button" role="tab" aria-selected={sort === "engagement"} className={`adm-seg-btn ${sort === "engagement" ? "on" : ""}`} onClick={() => setSort("engagement")}>
            Most engagement
          </button>
        </div>
        <button type="button" className="adm-btn-ghost" onClick={() => load(true)} disabled={loading}>
          <RefreshIcon className="h-4 w-4" /> Refresh
        </button>
      </div>

      {loading ? (
        <Skeletons />
      ) : reconnect ? (
        <div className="adm-card adm-card-pad" style={{ marginTop: 4 }}>
          <span className="adm-pill amber">Needs reconnect</span>
          <p className="adm-card-sub" style={{ marginTop: 8 }}>
            This Page’s token can’t read its posts. Reconnect it in <strong>Facebook → Pages</strong> (granting
            <code> pages_read_engagement</code>) and try again.
          </p>
        </div>
      ) : view.length === 0 ? (
        <p className="adm-card-sub" style={{ marginTop: 14 }}>No published posts found for this Page yet.</p>
      ) : (
        <>
          <div className="adm-pc-posts">
            {view.map((p) => (
              <PagePostCard key={p.id} post={p} />
            ))}
          </div>
          {after && sort === "recent" && (
            <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
              <button type="button" className="adm-btn-ghost" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <><span className="adm-spinner" aria-hidden /> Loading…</> : "Load more"}
              </button>
            </div>
          )}
          {after && sort === "engagement" && (
            <p className="adm-fb-sub" style={{ textAlign: "center", marginTop: 12 }}>
              Sorting the loaded posts by engagement. Switch to <strong>Most recent</strong> to load more.
            </p>
          )}
        </>
      )}
    </div>
  );
}
