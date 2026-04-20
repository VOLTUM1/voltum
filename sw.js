/* Voltum Service Worker
 * Estrategias:
 *  - Static assets (CSS/JS/fonts/imgs): cache-first (rápido tras primera visita).
 *  - HTML: network-first con fallback al cache (siempre frescos si hay red).
 *  - External CDN (fonts.gstatic/jsdelivr): stale-while-revalidate.
 * Version bump invalida cache obsoleto automáticamente.
 */

const VERSION = 'voltum-v3';
const STATIC_CACHE = `${VERSION}-static`;
const HTML_CACHE   = `${VERSION}-html`;
const CDN_CACHE    = `${VERSION}-cdn`;

const PRECACHE_URLS = [
  '/',
  '/css/styles.css',
  '/js/config.js',
  '/favicon.svg',
  '/apple-touch-icon.svg',
  '/manifest.webmanifest',
  // Google Fonts CSS (variable fonts + pesos reducidos)
  'https://fonts.googleapis.com/css2?family=Archivo:wght@700;800;900&family=Inter:wght@300..900&family=JetBrains+Mono:wght@500;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

function isStatic(url) {
  return /\.(css|js|woff2?|ttf|otf|png|jpg|jpeg|webp|avif|svg|gif|ico)$/i.test(url.pathname);
}
function isHTML(req) {
  return req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
}
function isCDN(url) {
  return ['fonts.gstatic.com','fonts.googleapis.com','cdn.jsdelivr.net','unpkg.com'].some(h => url.host.endsWith(h));
}

// cache-first con refresh en background
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    fetch(request).then((res) => {
      if (res && res.ok) cache.put(request, res.clone());
    }).catch(() => {});
    return cached;
  }
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    return cached || Response.error();
  }
}

// network-first, fallback a cache
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (_) {
    const cached = await cache.match(request);
    return cached || cache.match('/') || Response.error();
  }
}

// stale-while-revalidate
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((res) => {
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  }).catch(() => cached);
  return cached || fetchPromise;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Skip Supabase API, Mercado Pago, Resend, Vercel insights — nunca cachear
  if (
    url.host.endsWith('supabase.co') ||
    url.host.endsWith('mercadopago.com') ||
    url.host.endsWith('resend.com') ||
    url.pathname.startsWith('/_vercel') ||
    url.pathname.startsWith('/api/')
  ) return;

  if (isStatic(url) && url.origin === self.location.origin) {
    event.respondWith(cacheFirst(req, STATIC_CACHE));
  } else if (isCDN(url)) {
    event.respondWith(staleWhileRevalidate(req, CDN_CACHE));
  } else if (isHTML(req)) {
    event.respondWith(networkFirst(req, HTML_CACHE));
  }
});
