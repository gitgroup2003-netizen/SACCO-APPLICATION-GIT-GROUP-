// Amani SACCO service worker (v2)
// - Only same-origin app files (the page, scripts, icons) are cached, so the app can open offline.
// - Nothing from the database/API/auth/storage is EVER cached: member balances and statements are
//   never written to the device cache, and one user can never be shown another user's data.
// - Bumping CACHE_NAME deletes every older cache, including data cached by the previous version.
const CACHE_NAME = 'amani-sacco-v2';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data === 'clear-caches') {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;                       // Supabase and any other site: never touched
  if (request.headers.has('authorization') || request.headers.has('apikey')) return;

  // Page loads: always try the network first so a new deploy is picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then((c) => c.put('/index.html', copy)).catch(() => {}); }
          return response;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/')))
    );
    return;
  }

  // Built files have hashed names (/assets/…), so cached copies are always correct.
  if (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') { const copy = response.clone(); caches.open(CACHE_NAME).then((c) => c.put(request, copy)).catch(() => {}); }
        return response;
      }))
    );
  }
});
