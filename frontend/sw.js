// sw.js — CryptoAnalyst Service Worker
// Önbellek stratejisi: Cache-First (statik), Network-First (API)

'use strict';

// Versiyon numarasını her deploy sonrası artır — eski önbellek otomatik temizlenir
const CACHE_NAME    = 'crypto-analyst-v5';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/news.html',
  '/portfolio.html',
  '/history.html',
  '/compare.html',
  '/profile.html',
  '/reset-password.html',
  '/css/style.css',
  '/css/news.css',
  '/css/portfolio.css',
  '/css/history.css',
  '/js/api.js',
  '/js/utils.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/news.js',
  '/js/portfolio.js',
  '/js/history.js',
  '/js/payments.js',
  '/js/notifications.js',
  '/js/sharecard.js',
  '/js/compare.js',
  '/js/profile.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─── INSTALL: Statik varlıkları önbelleğe al ─────────────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Install edildi');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.allSettled(
        STATIC_ASSETS.map(url => cache.add(url).catch(() => {}))
      );
    }).then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE: Eski önbellekleri temizle ─────────────────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Aktifleşti — versiyon:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CACHE_NAME + '-api').map(k => caches.delete(k))
      )
    )
    .then(() => self.clients.claim())
    .then(() => {
      // Tüm açık sekmelere "yeni SW aktif, sayfayı yenile" mesajı gönder
      return self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME }));
      });
    })
  );
});

// ─── FETCH: Strateji belirle ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API istekleri: Network-First (önce ağ, başarısız olursa offline yanıtı)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Başarılı API yanıtlarını kısa süreli önbellekle (GET'ler)
          if (event.request.method === 'GET' && response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME + '-api').then(cache => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
        .catch(() => {
          // Ağ yoksa önbellekten dön
          return caches.match(event.request).then(cached => {
            if (cached) return cached;
            return new Response(
              JSON.stringify({ error: 'Çevrimdışısınız. İnternet bağlantısını kontrol edin.' }),
              { headers: { 'Content-Type': 'application/json' }, status: 503 }
            );
          });
        })
    );
    return;
  }

  // Statik varlıklar: Cache-First
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // HTML sayfaları için offline fallback
        if (event.request.headers.get('accept')?.includes('text/html')) {
          return caches.match('/index.html');
        }
      });
    })
  );
});

// ─── PUSH BİLDİRİM ALINDI ────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  let data = { title: 'CryptoAnalyst', body: 'Yeni bildirim!', icon: '/icons/icon-192.png', url: '/' };
  try { data = { ...data, ...event.data.json() }; } catch (_) {}

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body:    data.body,
      icon:    data.icon || '/icons/icon-192.png',
      badge:   '/icons/icon-192.png',
      tag:     data.tag || 'crypto-alert',
      data:    { url: data.url },
      vibrate: [200, 100, 200],
      actions: [
        { action: 'open',    title: '📊 Analiz Yap' },
        { action: 'dismiss', title: 'Kapat' },
      ],
    })
  );
});

// ─── BİLDİRİME TIKLANDI ──────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url === url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
