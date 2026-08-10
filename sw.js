// Study Planner — Service Worker
// Cache the app shell so it works offline and feels instant.
// Bump CACHE on every release so old assets get evicted.
const CACHE = 'study-planner-v2';

const SHELL = [
  './',
  'index.html',
  'app.css',
  'manifest.json',
  'firebase-config.js',
  'js/store.jsx',
  'js/components.jsx',
  'js/modals.jsx',
  'js/session.jsx',
  'js/today.jsx',
  'js/week.jsx',
  'js/day.jsx',
  'js/manage.jsx',
  'js/log.jsx',
  'js/schedule.jsx',
  'js/app.jsx',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Don't intercept Firebase / Google / non-GET / cross-origin font requests with credentials
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin && !url.host.includes('fonts.')) return;

  // Stale-while-revalidate for app shell + same-origin requests
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetched = fetch(e.request)
        .then((resp) => {
          if (resp && resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
