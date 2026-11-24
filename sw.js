// Offline app shell. AI model files are cached separately by Transformers.js (Cache Storage).
const VERSION = 'wardrobe-v11';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './js/app.js', './js/db.js', './js/enums.js', './js/color.js', './js/util.js', './js/weather.js', './js/learning.js',
  './js/recommender.js', './js/actions.js', './js/vision.js', './js/ai.js', './js/pipeline.js', './js/preview.js',
  './js/insights.js', './js/plan.js', './js/context.js', './js/demo.js', './js/profile.js', './js/stylist.js', './js/bodyscan.js', './js/tryon.js', './js/install.js', './js/native.js',
  './js/i18n.js', './js/sync.js', './js/declutter.js', './js/ai-worker.js', './js/genai.js', './js/carelabel.js', './js/config.js', './js/updater.js',
  './js/ui/dom.js', './js/ui/icons.js', './js/ui/today.js', './js/ui/closet.js', './js/ui/capture.js', './js/ui/builder.js',
  './js/ui/insights.js', './js/ui/plan.js', './js/ui/settings.js', './js/ui/onboarding.js', './js/ui/stylist.js', './js/ui/me.js', './js/ui/tryon.js', './js/ui/installui.js',
  './js/ui/shop.js', './js/ui/declutter.js', './js/ui/care.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('wardrobe-') && k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // Share target: a screenshot or link shared from another app (installed web app on Android)
  if (e.request.method === 'POST' && url.origin === location.origin && url.searchParams.has('share-target')) {
    e.respondWith((async () => {
      const fd = await e.request.formData();
      const inbox = await caches.open('share-inbox');
      const img = fd.getAll('image').find((f) => f && f.size);
      if (img) await inbox.put('shared-image', new Response(img, { headers: { 'Content-Type': img.type || 'image/jpeg' } }));
      const text = [fd.get('title'), fd.get('text'), fd.get('url')].filter(Boolean).join(' ');
      if (text) await inbox.put('shared-text', new Response(text));
      return Response.redirect('./#/shop?shared=1', 303);
    })());
    return;
  }
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // weather, CDN and model requests go straight to the network
  // network-first for the shell so updates arrive; cache fallback when offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then((res) => {
    const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html'))));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow('./#/today'))));
});
