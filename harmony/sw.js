// Harmony Pad service worker: 自ファイルを precache し、ネットワーク優先・失敗時キャッシュ
const CACHE = 'harmony-pad-v3';
const FILES = ['./', './index.html', './style.css', './app.js', './theory.js', './synth.js',
  './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (!e.request.url.startsWith(self.registration.scope)) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res && res.status === 200) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request)));
});
