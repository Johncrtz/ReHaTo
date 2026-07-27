// ReHaTo service worker — offline cache (network-first) + notification host.
const CACHE = 'rehato-v0.2.1';
const PRECACHE = [
  './', './index.html', './css/styles.css', './manifest.webmanifest', './icons/icon.svg',
  './js/main.js', './js/config.js', './js/i18n.js', './js/store.js', './js/ui.js',
  './js/calendar.js', './js/habits.js', './js/todos.js', './js/reminders.js',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: always try fresh (so feedback iterations show up),
// fall back to cache when offline. The supabase-js CDN module is cached
// too, so cloud mode can still boot without a network connection.
self.addEventListener('fetch', event => {
  const { request } = event;
  const cacheable = request.url.startsWith(self.location.origin)
    || request.url.startsWith('https://cdn.jsdelivr.net/');
  if (request.method !== 'GET' || !cacheable) return;
  event.respondWith(
    fetch(request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return response;
      })
      .catch(() =>
        caches.match(request).then(hit => hit || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const client = list.find(c => 'focus' in c);
      return client ? client.focus() : self.clients.openWindow('./#habits');
    })
  );
});
