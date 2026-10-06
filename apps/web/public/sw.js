/*
 * Service worker (§20 access requirements): app shell cached for fast, low-data
 * starts, and the daily digest cached network-first for offline reading.
 * Private game state is never cached here.
 */
const SHELL = 'runway-shell-v2';
const DIGEST = 'runway-digest-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL).then((c) => c.addAll(['/', '/icon.svg', '/manifest.webmanifest'])),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== SHELL && k !== DIGEST).map((k) => caches.delete(k))),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname === '/api/digest') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(DIGEST).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request).then((r) => r || Response.error())),
    );
    return;
  }
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((res) => {
            // Never cache an HTML fallback or an error as a JavaScript asset.
            if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
              const copy = res.clone();
              caches.open(SHELL).then((c) => c.put(event.request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
  }
});
