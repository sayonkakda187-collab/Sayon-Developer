/*
 * Minimal service worker for the Daily Ledger admin PWA.
 * - Cache-first for hashed static assets (instant, reliable shell).
 * - Network for everything else: pages and /api are always fresh, and POST
 *   requests (login, mutations) are never intercepted/cached.
 */
const STATIC_CACHE = "dl-admin-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isStatic =
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/apple-icon") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|ico|gif|webp|avif)$/.test(url.pathname);

  if (!isStatic) return; // pages + /api go straight to the network (always fresh)

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      } catch {
        return cached || Response.error();
      }
    }),
  );
});
