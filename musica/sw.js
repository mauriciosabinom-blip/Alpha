// Service worker: deixa o app abrir mesmo sem internet (o estudo funciona offline).
const CACHE = 'refrao-v32';
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // APIs externas vão direto à rede
  // rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(e.request, { cache: 'no-cache' }).then(r => {
    const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
  }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});

// ---------- notificações de mensagem nova (push) ----------
// O som é o toque padrão do aparelho (o iPhone não deixa app web escolher outro).
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data && e.data.text() }; }
  e.waitUntil((async () => {
    await self.registration.showNotification(d.title || '💬 Nova mensagem no Refrão', {
      body: d.body || '', tag: d.tag, renotify: true, icon: 'icon-192.png', badge: 'icon-192.png', data: { url: d.url || './' },
      requireInteraction: true,                 // fica na tela até a pessoa ver (onde o aparelho permitir)
      vibrate: [300, 150, 300, 150, 600]        // vibração longa (Android; o iPhone usa a dele)
    });
    // número no ícone do app (quando o aparelho permite)
    try { const n = (await self.registration.getNotifications()).length; if (self.navigator.setAppBadge) await self.navigator.setAppBadge(n); } catch (err) {}
  })());
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const wins = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        await w.focus();
        const chat = new URL(url).searchParams.get('chat');
        if (chat) w.postMessage({ openChat: chat });
        return;
      }
    }
    await clients.openWindow(url);
  })());
});
