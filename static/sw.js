/// <reference lib="webworker" />
const CACHE_NAME = 'zaim-lens-dev';
const ASSETS_TO_CACHE = [
    '/',
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
    // Only handle same-origin GET requests (exclude API routes) with Network-First
    if (event.request.method !== 'GET') {
        return;
    }

    const url = new URL(event.request.url);
    if (url.origin !== sw.location.origin || url.pathname.startsWith('/api/')) {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.ok) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => caches.match(event.request).then((cached) => cached || Response.error()))
    );
});
