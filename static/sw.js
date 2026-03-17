/// <reference lib="webworker" />
const CACHE_NAME = 'zaim-lens-dev';
const ASSETS_TO_CACHE = [
    '/',
    '/static/index.html',
    '/static/js/main.js',
    '/static/styles.css',
    '/static/manifest.json',
    '/static/favicon.ico',
    '/static/apple-touch-icon.png',
    '/static/icon-192.png',
    '/static/icon-512.png'
];

const sw = /** @type {ServiceWorkerGlobalScope & typeof globalThis} */ (/** @type {unknown} */ (self));

sw.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
            .then(() => sw.skipWaiting())
    );
});

sw.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => sw.clients.claim())
    );
});

sw.addEventListener('fetch', (event) => {
    // Only cache GET requests (don't break our API POSTs)
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
