// Practice Kit shell service worker: シェル自身の静的ファイルだけを扱う(子アプリは各自の SW)
const CACHE = 'practice-kit-shell-v1';
const FILES = ['./manifest.json', './shell/icon-192.png', './shell/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = e.request.url;
  const scope = self.registration.scope;
  if (!url.startsWith(scope)) return;
  // 子アプリ配下は触らない
  if (/\/(metronome|tuner|harmony)\//.test(url.slice(scope.length - 1))) return;
  e.respondWith(fetch(e.request).then(res => {
    if (res && res.status === 200) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request)));
});
