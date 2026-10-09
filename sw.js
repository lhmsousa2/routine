// Offline support. Network-first so the app is always current when online,
// but fall back to the cached copy if the network is down or slower than 3 seconds.
const CACHE = 'routine-v2';
const SHELL = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/engine.js',
  'js/store.js',
  'manifest.json',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const TIMEOUT_MS = 3000;

self.addEventListener('install', (ev) => {
  // cache: 'reload' bypasses the browser's HTTP cache so we never store a stale mix of files.
  ev.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function fromCache(req) {
  return caches
    .match(req, { ignoreSearch: true })
    .then((hit) => hit || (req.mode === 'navigate' ? caches.match('index.html') : undefined));
}

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Fetch by URL (a navigate-mode Request can't be re-issued with options), revalidating with the server.
  const network = fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  });

  ev.respondWith(
    new Promise((resolve) => {
      let settled = false;
      const finish = (res) => {
        if (!settled && res) {
          settled = true;
          resolve(res);
        }
      };
      network.then(finish).catch(async () => {
        const hit = await fromCache(req);
        if (hit) finish(hit);
        else if (!settled) {
          settled = true;
          resolve(Response.error());
        }
      });
      // Slow network: serve the cached copy; the network response still updates the cache.
      setTimeout(() => fromCache(req).then(finish), TIMEOUT_MS);
    }),
  );
});
