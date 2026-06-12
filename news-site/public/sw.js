/*
 * Service worker for the Daily Ledger admin PWA.
 *
 * FRESHNESS-FIRST, so the INSTALLED app always tracks the latest deploy (the old
 * SW served a stale build forever — this fixes that):
 *  - Page navigations / HTML / RSC  -> NETWORK-FIRST. Always the latest admin
 *    when online; a cached copy is used only as an OFFLINE fallback. The
 *    installed PWA can never show a stale UI while online.
 *  - Immutable build output (/_next/static/*) -> cache-first. Those URLs are
 *    content-hashed, so they change every deploy — safe to cache forever.
 *  - Icons / fonts / images -> stale-while-revalidate (fast + self-healing).
 *  - /api + any POST/mutation -> never cached (straight to the network).
 *
 * UPDATES: a new SW does NOT skip-waiting on install, so it never reloads you
 * mid-edit. The page detects the waiting worker, shows an "update available"
 * prompt, and on tap posts SKIP_WAITING -> the SW activates, purges old caches,
 * and the page reloads into the fresh build. Bump VERSION to force a purge.
 */
const VERSION = "v5-20260612-fb-tabs";
const STATIC_CACHE = `dl-admin-static-${VERSION}`;
const PAGES_CACHE = `dl-admin-pages-${VERSION}`;
const KEEP = new Set([STATIC_CACHE, PAGES_CACHE]);

self.addEventListener("install", () => {
  // Intentionally NO skipWaiting() — wait for the app's "Reload" prompt so an
  // update never interrupts an in-progress edit.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The page asks us to take over immediately (user tapped "Reload").
self.addEventListener("message", (event) => {
  const type = event.data && (event.data.type || event.data);
  if (type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return; // never touch login/mutations
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Content-hashed build output → cache-first (immutable).
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Page navigations / HTML documents → network-first (always latest online).
  if (request.mode === "navigate" || (request.headers.get("accept") || "").includes("text/html")) {
    event.respondWith(networkFirst(request, PAGES_CACHE));
    return;
  }

  // Icons / fonts / images → stale-while-revalidate.
  if (
    url.pathname.startsWith("/icons/") ||
    /\.(?:css|js|woff2?|png|jpe?g|svg|ico|gif|webp|avif)$/.test(url.pathname)
  ) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }
  // Everything else (/api, RSC data fetches) → default to the network (fresh).
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch {
    return (await cache.match(request)) || (await cache.match("/admin")) || Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => {
      if (res.ok) cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || fetching;
}

// ── Web Push: AI Assistant approval alerts ───────────────────────────────────
// Payload carries only a title/body (the action title) + a url to open. Never
// cached (push is event-driven, not fetch).
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Daily Ledger Admin";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      tag: data.tag || "agent",
      data: { url: data.url || "/admin/ai-assistant" },
      icon: "/icons/icon-192",
      badge: "/icons/icon-192",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/admin/ai-assistant";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const c of all) {
        if (c.url.includes("/admin")) {
          if ("navigate" in c) {
            try {
              await c.navigate(target);
            } catch {
              /* ignore */
            }
          }
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })(),
  );
});
