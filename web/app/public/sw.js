// B.Zik service worker : coquille de l'app en cache (installable + démarrage hors-ligne),
// le réseau reste prioritaire pour tout le reste (audio, API, parolier...).
const CACHE = 'bzik-shell-v1';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (req.mode === 'navigate' || /\.(js|css|svg|png|woff2?|webmanifest)$/.test(url.pathname))) {
        const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((r) => r || (req.mode === 'navigate' ? caches.match(self.registration.scope) : Response.error())))
  );
});
