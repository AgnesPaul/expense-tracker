// Hand-written service worker — this is the whole of it.
//
// A service worker is just a background script the browser keeps around for
// your origin, sitting between the page and the network. Three rules here:
//
//   1. /api/*       → always network. Cached spending totals would be wrong.
//   2. navigations  → network first, fall back to the cached shell when offline.
//   3. everything else (JS/CSS/icons) → cache first, they are content-hashed.
//
// Browsers only register a service worker over HTTPS (localhost excepted),
// which is exactly why Phase 6 puts CloudFront in front of this app.

const CACHE = 'expense-v1'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api') || url.pathname === '/health') return // rule 1

  if (request.mode === 'navigate') { // rule 2
    event.respondWith(fetch(request).catch(() => caches.match('/index.html').then((r) => r ?? Response.error())))
    return
  }

  event.respondWith( // rule 3
    caches.match(request).then((hit) =>
      hit ?? fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(request, copy))
        }
        return res
      }),
    ),
  )
})
