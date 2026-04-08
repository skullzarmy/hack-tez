/* hack.tez service worker — cache-first for app shell, network-first for API */
const CACHE = "hack-tez-v6";
const SHELL = ["/", "/manage", "/site.webmanifest", "/favicon.svg", "/favicon.ico", "/favicon-96x96.png"];
const SKIP_CACHE = ["tzkt.io", "tezos.domains", "api.", "rpc.", "walletbeacon", "matrix.papers"];

self.addEventListener("install", (e) => {
    e.waitUntil(
        caches.open(CACHE).then((c) => c.addAll(SHELL))
    );
    self.skipWaiting();
});

self.addEventListener("activate", (e) => {
    e.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener("fetch", (e) => {
    const url = e.request.url;

    // Never intercept non-GET requests (e.g. POST uploads).
    if (e.request.method !== "GET") return;

    // Skip non-http(s) requests (chrome-extension, etc.)
    if (!url.startsWith("http")) return;

    // Skip cross-origin requests — the SW cannot fetch external URLs
    // under the page's connect-src CSP (e.g. Google Fonts, wallet APIs).
    // Let the browser handle them directly.
    if (!url.startsWith(self.location.origin)) return;

    // Navigation requests: network-first (ensures fresh Content-Type headers),
    // fall back to cache only when offline.
    if (e.request.mode === "navigate") {
        e.respondWith(
            fetch(e.request)
                .then((res) => {
                    // Update the cache with the fresh response
                    if (res?.ok) {
                        const clone = res.clone();
                        caches.open(CACHE).then((c) => c.put("/", clone));
                    }
                    return res;
                })
                .catch(() => caches.match("/").then((cached) => cached || caches.match(e.request)))
        );
        return;
    }

    // Assets: cache-first
    e.respondWith(
        caches.match(e.request).then((cached) => {
            if (cached) return cached;
            return fetch(e.request).then((res) => {
                if (!res || !res.ok || res.type !== "basic") return res;
                const clone = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, clone));
                return res;
            });
        })
    );
});
