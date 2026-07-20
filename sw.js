// __CACHE_VERSION__ is replaced with the deploy's commit SHA by the deploy
// workflow, so every deploy gets a fresh cache name -- old caches (including
// a possibly-stale index.html) are dropped on activate instead of lingering
// forever the way a fixed cache name would.
const CACHE_NAME = "pub-finder-__CACHE_VERSION__";

const CORE_ASSETS = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(CORE_ASSETS))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Only cache same-origin app assets. Cross-origin requests (postcode
  // lookups, map tiles, Wikipedia summaries, the Leaflet CDN) go straight to
  // the network -- those need to stay live, not be served stale offline.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
    })
  );
});
