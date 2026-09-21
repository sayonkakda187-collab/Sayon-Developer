import type { WpFailure } from "./types";

/**
 * Pure helpers for the WordPress client: URL normalisation, error mapping and
 * entity decoding.
 *
 * They live outside `client.ts` because that module is `server-only` and so
 * cannot be imported by a test runner. Keeping the logic that is worth testing
 * in a module with no credentials and no I/O means it can be exercised directly
 * (`npm run check:wordpress`) instead of only through a live site.
 */

/**
 * Accepts what a person is likely to paste — a bare domain, a trailing slash, or
 * the full REST root — and returns the site root with no trailing slash.
 * Returns null for anything that is not http(s), so a stray value cannot turn
 * into a request on another protocol.
 */
export function normalizeBaseUrl(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;
  // A scheme-less value is assumed https; "ftp://…" etc. must still be rejected,
  // so only prepend when there is no scheme at all.
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed);
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  // Tolerate someone pasting the endpoint instead of the site root.
  const path = url.pathname.replace(/\/+$/, "").replace(/\/wp-json(\/.*)?$/i, "");
  return `${url.origin}${path}`;
}

/**
 * Turns an HTTP status plus WordPress's error body into advice.
 *
 * The statuses are grouped by what the operator would actually DO about them,
 * which is why 401 and 403 stay apart: one means the credentials are wrong, the
 * other means they are fine but this user may not do that. Collapsing them into
 * "auth error" sends people to the wrong settings screen.
 */
export function describeError(
  status: number,
  body: { code?: string; message?: string } | null,
  baseUrl: string | null,
): WpFailure {
  const wpMessage = (body?.message ?? "").trim();
  const code = body?.code;
  const site = baseUrl ?? "your WordPress site";
  const tail = wpMessage ? ` WordPress said: ${wpMessage}` : "";

  if (status === 401) {
    return {
      ok: false, kind: "unauthorized", status, code,
      message:
        "WordPress rejected the credentials (401). Check that WP_USERNAME is the account's " +
        "login name — not its display name or email — and that the application password has " +
        "not been revoked. If both look right, the host may be stripping the Authorization " +
        "header before PHP sees it." + tail,
    };
  }
  if (status === 403) {
    return {
      ok: false, kind: "forbidden", status, code,
      message:
        "WordPress accepted the login but refused the action (403). The user's role is missing " +
        "the capability: publishing needs Author or above, and editing someone else's post " +
        "needs Editor." + tail,
    };
  }
  if (status === 404) {
    return {
      ok: false, kind: "not_found", status, code,
      message:
        `Not found (404). Either that post no longer exists, or the REST API is disabled or ` +
        `blocked at ${site}.` + tail,
    };
  }
  if (status === 429) {
    return {
      ok: false, kind: "rate_limited", status, code,
      message: "WordPress (or a proxy in front of it) is rate-limiting these requests. Wait and retry." + tail,
    };
  }
  if (status >= 500) {
    return {
      ok: false, kind: "server", status, code,
      message: `WordPress returned a server error (${status}).` + (wpMessage ? ` ${wpMessage}` : ""),
    };
  }
  return {
    ok: false, kind: "invalid", status, code,
    message: wpMessage || `WordPress rejected the request (${status}).`,
  };
}

/** Strips tags and decodes the entities WordPress puts in rendered titles, so a
 *  list shows text rather than markup. */
export function plain(html: string): string {
  return (html ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&#x([\da-f]+);/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    // &amp; last, so "&amp;lt;" decodes to "&lt;" rather than "<".
    .replace(/&amp;/g, "&")
    .trim();
}
