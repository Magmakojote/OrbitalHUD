/**
 * OrbitalHUD Service Worker
 * - App-Shell & Bibliotheken: Cache-first (offline startfähig)
 * - Kartenkacheln: Stale-while-revalidate mit Größenlimit
 * - APIs: immer Netz (die App cached Bahndaten selbst im localStorage)
 */
const VERSION = 'v2.0.1';
const SHELL = `orbitalhud-shell-${VERSION}`;
const TILES = 'orbitalhud-tiles-v1';
const MAX_TILES = 400;

const SHELL_FILES = [
    './',
    'index.html',
    'css/app.css',
    'js/app.js', 'js/geo.js', 'js/orbit.js', 'js/map.js', 'js/ui.js', 'js/passes.js', 'js/net.js', 'js/store.js', 'js/data.js',
    'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/satellite.js/4.1.3/satellite.min.js'
];

const TILE_HOSTS = ['server.arcgisonline.com', 'tile.opentopomap.org'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL)
            .then(cache => Promise.all(SHELL_FILES.map(url => cache.add(new Request(url, { cache: 'reload' })).catch(() => null))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k.startsWith('orbitalhud-shell-') && k !== SHELL).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

async function trimCache(name, max) {
    const cache = await caches.open(name);
    const keys = await cache.keys();
    for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Kartenkacheln
    if (TILE_HOSTS.some(h => url.hostname.endsWith(h))) {
        event.respondWith((async () => {
            const cache = await caches.open(TILES);
            const cached = await cache.match(req);
            const network = fetch(req).then(res => {
                if (res.ok || res.type === 'opaque') {
                    cache.put(req, res.clone()).then(() => trimCache(TILES, MAX_TILES));
                }
                return res;
            }).catch(() => cached);
            return cached || network;
        })());
        return;
    }

    // App-Shell & Bibliotheken
    const isShell = url.origin === self.location.origin || url.hostname === 'unpkg.com' || url.hostname === 'cdnjs.cloudflare.com';
    if (isShell) {
        event.respondWith((async () => {
            const cache = await caches.open(SHELL);
            // Eigene Dateien: Netz zuerst (schnelle Updates), Fallback Cache. CDN: Cache zuerst.
            if (url.origin === self.location.origin) {
                try {
                    const res = await fetch(req);
                    if (res.ok) cache.put(req, res.clone());
                    return res;
                } catch {
                    return (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? cache.match('index.html') : Response.error());
                }
            }
            const cached = await cache.match(req);
            if (cached) return cached;
            const res = await fetch(req);
            if (res.ok) cache.put(req, res.clone());
            return res;
        })());
    }
    // Alles andere (APIs): Standardverhalten des Browsers
});
