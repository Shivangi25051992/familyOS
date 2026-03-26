// FamilyOS Service Worker
// ⚠️  BUMP THIS VERSION on every deploy — this triggers updates on ALL clients
// Last updated: Bypass non-GET entirely, fix POST cache
const VERSION = 'v3-20260315080000';
const CACHE = `familyos-${VERSION}`;
const PRECACHE_URLS = ['/', '/index.html'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE_URLS)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Never intercept API/backend requests — let browser handle directly
  if (url.hostname.includes('firestore.googleapis') ||
      url.hostname.includes('firebase') ||
      url.hostname.includes('gstatic') ||
      url.hostname.includes('googleapis') ||
      url.hostname.includes('cloudfunctions.net') ||
      url.protocol === 'chrome-extension:') return;
  // Never cache or intercept non-GET (Cache API rejects POST)
  if (e.request.method !== 'GET') return;

  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('.html')) {
    // Cache-bust main document so updates deploy quickly
    const bust = new URL(e.request.url);
    bust.searchParams.set('_v', VERSION);
    e.respondWith(
      fetch(bust.toString(), {cache:'no-store'})
        .then(res => {
          if (e.request.method === 'GET') {
            const clone = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
          }
          return res;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Cache API only supports GET requests — skip caching POST/PUT/etc
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
      if (res.ok && e.request.method === 'GET') {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return res;
    }))
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'NOTIFY') {
    self.registration.showNotification(e.data.title, {
      body: e.data.body, icon: '/icon-192.png',
      tag: e.data.tag || 'familyos', vibrate: [200,100,200]
    });
  }
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
