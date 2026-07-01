const CACHE_NAME = 'mt5-simulator-v50';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './الشريط العلوي.JPG',
  './الشريط السفلي.JPG',
  './الشارت.jpg',
  './M15.jpg',
  './public/icon-192.png',
  './public/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Only handle GET requests for caching
  if (e.request.method !== 'GET') {
    return;
  }
  
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // If it's a valid response, cache it
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If network request fails (offline), load from cache
        return caches.match(e.request);
      })
  );
});
