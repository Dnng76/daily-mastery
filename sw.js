/* Daily Mastery service worker — network-first for HTML so the app always
   updates to the latest version when online, with an offline cache fallback. */
const VERSION = 'v20-2026-07-03';
const CACHE = 'daily-mastery-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png',
  './pdf.worker.min.js'   // self-hosted PDF worker → import works offline / in PWA
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const isHTML = req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    // Always try the network first so a new index.html is picked up immediately.
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
    );
    return;
  }

  // Other same-origin assets: cache-first, fall back to network.
  e.respondWith(caches.match(req).then(m => m || fetch(req)));
});
