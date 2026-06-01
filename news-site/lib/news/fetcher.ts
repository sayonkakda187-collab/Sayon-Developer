import "server-only";

import type { NewsSourceId } from "./sources";
import type { NormalizedItem } from "./normalize";

// Shared per-source machinery: a fetch with timeout, an in-memory cache (so a
// combined feed doesn't multiply requests and burn limited free tiers), and a
// per-source quota backoff. Each provider plugs in a fetch function.

export type ProviderResult = {
  items: NormalizedItem[];
  cached: boolean;
  /** Non-null when the source couldn't serve fresh results (UI note). */
  note: string | null;
  /** True only on a hard failure where nothing (not even cache) is available. */
  failed: boolean;
};

export class ProviderError extends Error {
  code: "auth" | "quota" | "network" | "unknown";
  constructor(code: ProviderError["code"], message: string) {
    super(message);
    this.code = code;
  }
}

const TTL = 20 * 60 * 1000; // 20 min — protects every free tier
const cache = new Map<string, { at: number; items: NormalizedItem[] }>();
// Per-source quota backoff windows (epoch ms).
const quotaBlocked = new Map<NewsSourceId, number>();

function nextUtcMidnight(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
}

/** fetch with an AbortController timeout so one slow source can't hang the feed. */
export async function timedFetch(url: string, init: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new ProviderError("network", "timed out");
    throw new ProviderError("network", "could not reach source");
  } finally {
    clearTimeout(t);
  }
}

/**
 * Run a provider fetch with caching + quota backoff + graceful degradation.
 * `key` should encode source + query + category + lang + country + page.
 */
export async function runProvider(
  id: NewsSourceId,
  key: string,
  fetchFresh: () => Promise<NormalizedItem[]>,
): Promise<ProviderResult> {
  const ckey = `${id}::${key}`;
  const cached = cache.get(ckey);
  if (cached && Date.now() - cached.at < TTL) {
    return { items: cached.items, cached: true, note: null, failed: false };
  }

  // Inside a quota backoff window → serve cache or report the limit (never throw).
  const blockedUntil = quotaBlocked.get(id) ?? 0;
  if (Date.now() < blockedUntil) {
    if (cached) return { items: cached.items, cached: true, note: "limit reached today", failed: false };
    return { items: [], cached: false, note: "limit reached today", failed: true };
  }

  try {
    const items = await fetchFresh();
    cache.set(ckey, { at: Date.now(), items });
    return { items, cached: false, note: null, failed: false };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : "unknown";
    if (code === "quota") quotaBlocked.set(id, nextUtcMidnight());
    // Stale-while-error: prefer slightly old results over nothing.
    if (cached) {
      return {
        items: cached.items,
        cached: true,
        note: code === "quota" ? "limit reached today" : "showing cached results",
        failed: false,
      };
    }
    return {
      items: [],
      cached: false,
      note: code === "quota" ? "limit reached today" : code === "auth" ? "key rejected" : "unavailable",
      failed: true,
    };
  }
}

/** Map a fetch Response's status to a ProviderError (shared by providers). */
export function errorForStatus(status: number, label: string): ProviderError {
  if (status === 429) return new ProviderError("quota", `${label} limit reached`);
  if (status === 401 || status === 403) return new ProviderError("auth", `${label} rejected the key`);
  return new ProviderError("unknown", `${label} error ${status}`);
}
