/* Daily Mastery service worker — network-first for the app page so it always
   updates to the latest version when online, with an offline copy of the page
   and of every file the app ships with (icons, PDF reader, Firebase). */
const VERSION = 'v53-2026-11-20';
const CACHE = 'daily-mastery-' + VERSION;
const SHELL = './index.html';
const ASSETS = [
  SHELL, './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './apple-touch-icon.png', './favicon-32.png',
  // self-hosted libraries → PDF import and sync start with no connection to any CDN
  './pdf.min.js', './pdf.worker.min.js',
  './firebase-app-compat.js', './firebase-auth-compat.js', './firebase-firestore-compat.js'
];
const abs = (path) => new URL(path, self.location).href;
const ASSET_URLS = new Set(ASSETS.map(abs));
const SHELL_URLS = new Set(['./', SHELL].map(abs));   // the app page, with or without "index.html"

self.addEventListener('install', (e) => {
  self.skipWaiting();
  // One file at a time: a single missing file must not stop the rest being saved.
  // 'reload' skips the browser's own cache so the saved copies are really current.
  e.waitUntil(caches.open(CACHE).then(c =>
    Promise.all(ASSETS.map(a => c.add(new Request(a, { cache: 'reload' })).catch(() => {})))));
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
  const url = req.url.split('#')[0].split('?')[0];

  // The app page: always try the network first so a new version is picked up
  // immediately; offline, use the saved copy. Only a real, successful copy of
  // the app page is ever saved — an error page, or another file opened under
  // this address (the reminders calendar), can't replace the offline copy.
  if (req.mode === 'navigate' && SHELL_URLS.has(url)) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then(c => c.put(SHELL, copy)));
        }
        return res;
      }).catch(() => caches.match(SHELL).then(m => m || Response.error()))
    );
    return;
  }

  // Files the app ships with: saved copy first, network as the fallback
  // (and that answer is saved for next time).
  if (ASSET_URLS.has(url)) {
    e.respondWith(caches.match(url).then(m => m || fetch(req).then(res => {
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then(c => c.put(url, copy)));
      }
      return res;
    })));
  }
  // Everything else (the calendar file, Google sign-in, sync traffic, a CDN
  // fallback) goes straight to the network, untouched.
});
