// Client-safe helpers for the Trending News planning tools. Pure functions over
// ALREADY-FETCHED data — they never call GNews, so they cost zero quota.

// Common English stop words + a few news-generic tokens we don't want surfacing
// as "trending keywords".
const STOP = new Set([
  "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for", "with", "at", "by", "from",
  "as", "is", "are", "was", "were", "be", "been", "being", "it", "its", "this", "that", "these",
  "those", "his", "her", "their", "our", "your", "you", "we", "they", "he", "she", "i", "him",
  "them", "us", "has", "have", "had", "will", "would", "can", "could", "should", "may", "might",
  "not", "no", "new", "says", "say", "said", "after", "over", "into", "out", "up", "down", "off",
  "more", "most", "amid", "amP", "vs", "via", "how", "why", "what", "when", "who", "live", "watch",
  "update", "updates", "report", "reports", "news", "latest", "day", "week", "year", "years",
]);

/** Normalize a string for fuzzy comparison: lowercase, strip non-alphanumerics. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Significant word tokens (length ≥ 3, not a stop word, not pure digits). */
export function keywordsOf(text: string): string[] {
  return normalize(text)
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));
}

/**
 * Trending keyword counts across already-fetched headlines (+ snippets). Returns
 * the top `limit` terms by frequency. Bigrams (two-word phrases) are included
 * when they recur, since they're often the real topic ("interest rates").
 */
export function trendingKeywords(
  items: { title: string; description?: string }[],
  limit = 16,
): { term: string; count: number }[] {
  const counts = new Map<string, number>();
  const bump = (t: string, by = 1) => counts.set(t, (counts.get(t) ?? 0) + by);

  for (const it of items) {
    const words = keywordsOf(it.title);
    const seen = new Set<string>();
    for (let i = 0; i < words.length; i++) {
      if (!seen.has(words[i])) { bump(words[i]); seen.add(words[i]); }
      // Bigram from consecutive significant words.
      if (i + 1 < words.length) {
        const bg = `${words[i]} ${words[i + 1]}`;
        bump(bg, 1);
      }
    }
    // Snippets contribute at half weight (less authoritative than the headline).
    for (const w of new Set(keywordsOf(it.description ?? ""))) bump(w, 0.5);
  }

  return [...counts.entries()]
    .map(([term, count]) => ({ term, count: Math.round(count) }))
    // Keep terms that recur, OR single strong headline words; drop count<1 noise.
    .filter((x) => x.count >= 2 || (!x.term.includes(" ") && x.count >= 1))
    .sort((a, b) => b.count - a.count || b.term.length - a.term.length)
    .slice(0, limit);
}

/**
 * Fuzzy "already covered?" check: does this trending headline substantially
 * overlap an existing article title? Uses Jaccard overlap of significant words
 * plus a substring guard. Conservative (informs, never blocks).
 */
export function isAlreadyCovered(
  headline: string,
  existingTitles: string[],
  threshold = 0.5,
): boolean {
  const hWords = new Set(keywordsOf(headline));
  if (hWords.size === 0) return false;
  const hNorm = normalize(headline);

  for (const title of existingTitles) {
    const tNorm = normalize(title);
    if (!tNorm) continue;
    // Direct containment either way → clearly covered.
    if (hNorm.length > 10 && (tNorm.includes(hNorm) || hNorm.includes(tNorm))) return true;

    const tWords = new Set(keywordsOf(title));
    if (tWords.size === 0) continue;
    let shared = 0;
    for (const w of hWords) if (tWords.has(w)) shared++;
    const union = new Set([...hWords, ...tWords]).size;
    const jaccard = shared / union;
    // Either a high Jaccard, or a strong share of the (shorter) headline's words.
    const coverage = shared / Math.min(hWords.size, tWords.size);
    if (jaccard >= threshold || coverage >= 0.7) return true;
  }
  return false;
}
