// Simple offline cache for GitHub Pages / PWA-like behavior.
// Safe for MVP; update CACHE_VERSION when you change files.
const CACHE_VERSION = "bwp-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./src/main.js",
  "./src/util.js",
  "./manifest.webmanifest"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_VERSION ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
