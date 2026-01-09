const CACHE_NAME = 'accounting-app-v1';
const ASSETS_TO_CACHE = [
    '/',
    '/manifest.json',
    '/icon.png',
    // Note: Most Next.js assets are hashed, so static caching is hard manually.
    // This is a minimal fallback service worker.
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS_TO_CACHE);
        })
    );
});

self.addEventListener('fetch', (event) => {
    // Only handle GET requests for static assets
    if (event.request.method !== 'GET') return;

    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
