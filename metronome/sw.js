const CACHE_NAME = 'namameto-cache-auto2';

// インストール時に最低限キャッシュしておくもの
// ※ここにはNamaMeto.htmlも含めておきます（初回インストール直後にオフラインになっても動くようにするため）
const urlsToCache = [
  './NamaMeto.html',
  './manifest.json',
  './manifest-en.json',
  './NamaMetoLogo192.png',
  './NamaMetoLogo512.png',
  './NamaMetroLogo192.png',
  './NamaMetroLogo512.png',
  './vendor/Sortable.min.js',
  './vendor/lame.min.js'
];

// 1. インストール時の処理
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache);
    })
  );
});

// 2. ネットワークファーストの処理
self.addEventListener('fetch', (event) => {
  // 【ここを追加】http/https 以外の通信（拡張機能など）は無視する
  if (!event.request.url.startsWith('http')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});
