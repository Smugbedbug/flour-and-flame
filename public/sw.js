/* Flour and Flame service worker: caches the app so it opens offline after one online visit.
   Works at a site root (localhost) or in a sub-folder (GitHub Pages): everything is relative to the scope. */
const CACHE = 'flour-and-flame-app-v0142';
const SCOPE = self.registration.scope; // e.g. https://name.github.io/flour-and-flame/
const SCOPE_PATH = new URL(SCOPE).pathname;
const STATIC = ['', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon.svg', 'apple-touch-icon.png'];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch(SCOPE, { cache: 'reload' });
    if (!response.ok) throw Error('Unable to cache app shell');
    const html = await response.text();
    const urls = STATIC.map(u => new URL(u, SCOPE).href);
    for (const m of html.matchAll(/(?:src|href)="((?:\.\/|\/)?[^"]*assets\/[^"]+)"/g)) urls.push(new URL(m[1], SCOPE).href);
    await cache.addAll([...new Set(urls)]);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => event.waitUntil((async () => {
  const names = await caches.keys();
  await Promise.all(names.filter(n => n.startsWith('flour-and-flame-app-') && n !== CACHE).map(n => caches.delete(n)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(SCOPE_PATH)) return;
  const rel = url.pathname.slice(SCOPE_PATH.length);
  if (event.request.mode === 'navigate') {
    // Network first so updates arrive; cached copy when offline.
    event.respondWith((async () => {
      try {
        const res = await fetch(event.request);
        if (res.ok) { const cache = await caches.open(CACHE); await cache.put(SCOPE, res.clone()); }
        return res;
      } catch {
        return (await caches.match(SCOPE)) || Response.error();
      }
    })());
    return;
  }
  if (rel.startsWith('assets/') || STATIC.includes(rel)) {
    event.respondWith((async () => {
      const cached = await caches.match(event.request);
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        if (res.ok) { const cache = await caches.open(CACHE); await cache.put(event.request, res.clone()); }
        return res;
      } catch { return Response.error(); }
    })());
  }
});

// Tapping a new-order notification opens (or focuses) the app on the Orders screen.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./#/orders', self.registration.scope).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if (w.url.startsWith(self.registration.scope) && !w.url.includes('/order-form/')) { await w.focus(); return w.navigate(target).catch(() => {}); } }
    return self.clients.openWindow(target);
  })());
});
