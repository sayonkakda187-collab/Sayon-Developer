/**
 * Shared WordPress types. Client-safe on purpose: nothing here carries or
 * implies a credential, so admin components can import it freely. The client
 * that actually holds the credentials is `lib/wordpress/client.ts`, which is
 * `server-only`.
 */

/** The post statuses this integration offers. WordPress supports more. */
export type WpStatus = "publish" | "draft" | "pending" | "private";

export type WpPostInput = {
  title: string;
  /** HTML — WordPress stores `post_content` as HTML, not Markdown. */
  content: string;
  status: WpStatus;
  excerpt?: string;
  slug?: string;
  /** WordPress term IDs, not names. */
  categories?: number[];
  tags?: number[];
  /** Media attachment ID, or null to clear it. */
  featuredMedia?: number | null;
};

export type WpPost = {
  id: number;
  title: string;
  status: WpStatus | string;
  link: string;
  date: string | null;
  modified: string | null;
  categories: number[];
  tags: number[];
  featuredMedia: number | null;
};

/** A post opened for editing — carries the RAW title/content, not the rendered
 *  HTML, so what goes back on save is what WordPress actually stores. */
export type WpPostDetail = WpPost & { contentRaw: string; excerptRaw: string; slug: string };

export type WpTerm = { id: number; name: string; count: number };

export type WpPage<T> = {
  items: T[];
  page: number;
  perPage: number;
  /** From the X-WP-Total / X-WP-TotalPages response headers. */
  total: number;
  totalPages: number;
};

export type WpUser = { id: number; name: string; slug: string; capabilities: string[] };

/**
 * Why a call failed, in terms the UI can act on. Kept separate from the HTTP
 * status because several statuses map to the same advice, and two of the cases
 * ("not configured", "not JSON") never have one.
 */
export type WpErrorKind =
  | "not_configured"
  | "unauthorized"
  | "forbidden"
  | "invalid"
  | "not_found"
  | "rate_limited"
  | "server"
  | "network"
  | "not_json";

export type WpFailure = {
  ok: false;
  kind: WpErrorKind;
  /** Safe to show a human. Never contains the credentials. */
  message: string;
  /** HTTP status, when there was one. */
  status?: number;
  /** WordPress's own error code, e.g. "rest_cannot_create". */
  code?: string;
};

export type WpResult<T> = { ok: true; data: T } | WpFailure;

export type WpConfigStatus = {
  configured: boolean;
  /** Which env vars are missing, for a precise setup message. */
  missing: string[];
  /** The normalized site URL, safe to display. Never the username/password. */
  baseUrl: string | null;
};
