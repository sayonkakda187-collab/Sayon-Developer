// Production domain — the canonical public origin. Used as the fallback so a
// production build NEVER emits localhost canonical/og:url tags (which break
// Facebook/Twitter share previews), even if NEXT_PUBLIC_SITE_URL is unset.
const PRODUCTION_URL = "https://dailyledger.today";

/**
 * Absolute base URL for metadata/Open Graph, canonical tags, the sitemap, and
 * any absolute URL. Resolution order:
 *   1. NEXT_PUBLIC_SITE_URL if set (inlined at build; set this in Vercel).
 *   2. The production domain when building/running in production.
 *   3. http://localhost:3000 for local development.
 * Always returned without a trailing slash so callers can append paths safely.
 */
function resolveSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = fromEnv || (process.env.NODE_ENV === "production" ? PRODUCTION_URL : "http://localhost:3000");
  return base.replace(/\/+$/, "");
}

export const siteConfig = {
  name: "The Daily Ledger",
  description:
    "Independent reporting on technology, business, and the world.",
  // Absolute base URL (no trailing slash). Set NEXT_PUBLIC_SITE_URL in Vercel
  // (Production + Preview) to your domain; production falls back to the canonical
  // domain rather than localhost so share previews always resolve.
  url: resolveSiteUrl(),
  defaultOgImage: "/og-default.png",
};

export const ogImageSize = {
  width: 1200,
  height: 630,
} as const;

export function absoluteUrl(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl).toString();
  } catch {
    const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
    return new URL(path, siteConfig.url).toString();
  }
}

export function articleUrl(slug: string): string {
  return absoluteUrl(`/news/${slug}`);
}

export const defaultOgImageUrl = absoluteUrl(siteConfig.defaultOgImage);


export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

/** Compact relative timestamp for news cards ("2 hours ago"); falls back to a
 * date for anything older than ~4 weeks. */
export function timeAgo(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const mins = Math.floor(seconds / 60);
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  if (days < 28) {
    const weeks = Math.floor(days / 7);
    return `${weeks} week${weeks === 1 ? "" : "s"} ago`;
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
