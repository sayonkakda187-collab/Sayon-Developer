import { unstable_cache, revalidateTag } from "next/cache";

/**
 * Caching for the PUBLIC read path.
 *
 * Every public pageview used to run its queries against Postgres directly: the
 * homepage 4, an article 3 (plus 5 analytics writes), a category 2. Nothing was
 * cached but the nav and the ticker. On a metered database that is what
 * exhausted the monthly allowance and took the site down — the reads scale with
 * traffic even though the answers are identical between publishes.
 *
 * Page-level caching would have been the broader fix, but it is not available
 * here: ledgerdailynews.com and dailyledger.today are served by ONE deployment
 * and render DIFFERENT article bodies (1 in-body ad vs 3, plus 3 section ads),
 * so a cached page would serve one host's layout to the other. Caching the
 * QUERIES instead is host-independent — every host renders from the same data —
 * and it targets the resource that actually ran out.
 *
 * ── Dates ──────────────────────────────────────────────────────────────────
 * unstable_cache serializes through JSON, so a `Date` comes back as a `string`
 * while TypeScript still claims it is a `Date`. That is a silent type lie that
 * blows up at the first `.getTime()` — and it is why the earlier caching work
 * could only cache Date-free selects. `reviveDates` converts them back on the
 * way out, so a cache hit is indistinguishable from a miss.
 */

/** Prisma `DateTime` fields reachable from the cached public payloads. */
const DATE_KEYS = new Set(["createdAt", "updatedAt", "publishedAt", "scheduledAt"]);

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Walk a JSON-revived value and turn date-shaped strings back into `Date`.
 *
 * Keyed on the field NAME rather than on "looks like a date", so a headline that
 * happens to be an ISO timestamp is never silently converted into an object.
 * The ISO test is a second guard: a malformed value is left alone rather than
 * becoming an Invalid Date that renders as "NaN".
 */
export function reviveDates<T>(value: T): T {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = reviveDates(value[i]);
    return value;
  }
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (DATE_KEYS.has(k) && typeof v === "string" && ISO.test(v)) {
        o[k] = new Date(v);
      } else if (v && typeof v === "object") {
        o[k] = reviveDates(v);
      }
    }
  }
  return value;
}

/**
 * Cache tags. Invalidation is by tag rather than by path because these are
 * `unstable_cache` entries, which `revalidatePath` does NOT clear — a detail
 * that would otherwise leave a published article invisible for the whole
 * revalidate window.
 */
export const TAG = {
  /** Any published-article set: homepage, category lists, read-next. */
  articles: "public:articles",
  /** One article by slug. */
  article: (slug: string) => `public:article:${slug}`,
  /** One article's approved comments. */
  comments: (articleId: string) => `public:comments:${articleId}`,
  /** The category/tag taxonomy itself. */
  categories: "public:categories",
} as const;

/**
 * `unstable_cache` with dates revived on the way out.
 *
 * `revalidate` is a ceiling, not the mechanism: every mutation revalidates the
 * tags it affects, so a publish shows up immediately. The timer only bounds how
 * stale something can get if an invalidation is ever missed.
 */
export function cachedPublicQuery<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
  keyParts: string[],
  opts: { revalidate: number; tags: string[] },
): (...args: A) => Promise<R> {
  const cached = unstable_cache(fn, keyParts, opts);
  return async (...args: A) => reviveDates(await cached(...args));
}

/* ── Invalidation ───────────────────────────────────────────────────────────
 *
 * `revalidatePath` does NOT clear `unstable_cache` entries — only the route
 * cache. Every mutation that changes what the public sees must therefore
 * revalidate the TAG too, or a freshly published article stays invisible for
 * the whole revalidate window. These helpers are the single place that mapping
 * lives, so a new call site cannot get it subtly wrong.
 */

/** Anything that changes the SET of published articles: publish, edit, delete. */
export function invalidatePublicArticles(slug?: string | null): void {
  revalidateTag(TAG.articles);
  if (slug) revalidateTag(TAG.article(slug));
}

/** Comment moderation on one article. */
export function invalidatePublicComments(articleId: string): void {
  revalidateTag(TAG.comments(articleId));
}

/** The taxonomy itself — a category added, renamed, or removed. Also drops the
 *  article caches, since category names are embedded in those payloads. */
export function invalidatePublicTaxonomy(): void {
  revalidateTag(TAG.categories);
  revalidateTag(TAG.articles);
}
