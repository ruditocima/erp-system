// Service Worker ACM-WMS
// Strategi: cache-first untuk aset statis (shell aplikasi + CDN),
// request non-GET (Supabase RPC/auth/websocket) dibiarkan lewat tanpa cache.
const CACHE = 'acm-wms-v1';
const PRECACHE = [
    './',
    './index.html',
    './manifest.webmanifest',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE)
            .then((cache) => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // Hanya tangani GET; biarkan POST/PATCH (Supabase RPC, auth, upload) lewat.
    if (req.method !== 'GET') return;

    const url = new URL(req.url);
    const isStaticCdn = ['cdn.', 'fonts.', 'unpkg.com', 'cdnjs.', 'jsdelivr'].some(h => url.hostname.includes(h));
    if (url.origin !== location.origin && !isStaticCdn) return;

    event.respondWith(
        caches.match(req).then((cached) => {
            const fetched = fetch(req).then((res) => {
                if (res && (res.ok || res.type === 'opaque')) {
                    const copy = res.clone();
                    caches.open(CACHE).then((c) => c.put(req, copy));
                }
                return res;
            }).catch(() => cached);
            // cache-first, fallback ke jaringan
            return cached || fetched;
        })
    );
});