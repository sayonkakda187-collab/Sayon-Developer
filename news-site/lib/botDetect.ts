import "server-only";

// Minimal shape we need — accepts both the readonly `headers()` result and a Headers.
type Hdrs = { get(name: string): string | null };

// Known non-human User-Agents: search/social crawlers, link scrapers (notably
// Facebook's `facebookexternalhit`), uptime monitors, and headless/HTTP clients.
// Deliberately does NOT match the Facebook in-app browser (FBAN/FBAV/FBIOS) — those
// are REAL people, so we keep counting them.
const BOT_RE =
  /bot|crawl|spider|slurp|facebookexternalhit|facebookcatalog|whatsapp|embedly|quora|yandex|baidu|semrush|ahrefs|screaming|headless|phantom|puppeteer|playwright|lighthouse|chrome-lighthouse|gtmetrix|pingdom|statuscake|uptime|scrape|prerender|go-http-client|python-requests|curl\/|wget|axios|node-fetch|okhttp|java\//i;

/**
 * True when a request is NOT a real human viewing the page — a bot / link
 * scraper (e.g. Facebook's `facebookexternalhit`), an uptime monitor, or a
 * Next.js / browser **prefetch** (the link was fetched but nobody opened it).
 *
 * Used ONLY to keep the article view + Audience counters honest, so the Admin
 * numbers reflect real people (and line up better with AdsKeeper). It does NOT
 * touch the private-gallery "Live audience" — that uses a client-side JS
 * heartbeat and is intentionally left exactly as-is.
 */
export function isNonHumanView(h: Hdrs): boolean {
  // A prefetch fetched the page, but the reader never actually opened it.
  if (h.get("next-router-prefetch")) return true;
  const purpose = (h.get("purpose") || h.get("x-purpose") || "").toLowerCase();
  if (purpose === "prefetch") return true;
  if ((h.get("sec-purpose") || "").toLowerCase().includes("prefetch")) return true;

  const ua = (h.get("user-agent") || "").trim();
  if (!ua) return true; // missing UA → almost always a bot / health check
  return BOT_RE.test(ua);
}
