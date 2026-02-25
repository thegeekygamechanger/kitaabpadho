const CACHE_NAME = 'kitaabpadhoindia-shell-v12';
const SHELL_ASSETS = [
  '/',
  '/admin',
  '/seller',
  '/delivery',
  '/index.html',
  '/manifest.webmanifest',
  '/assets/icons/bookish.svg',
  '/assets/css/app.css',
  '/assets/js/app.js',
  '/assets/js/admin-page.js',
  '/assets/js/api.js',
  '/assets/js/state.js',
  '/assets/js/ui.js',
  '/assets/js/auth.js',
  '/assets/js/profile.js',
  '/assets/js/notifications.js',
  '/assets/js/feedback.js',
  '/assets/js/location.js',
  '/assets/js/marketplace.js',
  '/assets/js/community.js',
  '/assets/js/seller.js',
  '/assets/js/delivery.js',
  '/assets/js/sound.js',
  '/assets/js/ai.js',
  '/assets/js/realtime.js',
  '/assets/js/pwa.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'KitaabPadho', body: event.data?.text?.() || 'New update available.' };
  }

  const title = payload.title || 'KitaabPadho';
  const options = {
    body: payload.body || 'You have a new notification.',
    icon: '/assets/icons/bookish.svg',
    badge: '/assets/icons/bookish.svg',
    data: { url: payload.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return null;
    })
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')));
    return;
  }

  if (!isSameOrigin || url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
