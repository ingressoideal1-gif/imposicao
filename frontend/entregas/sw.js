'use strict';
const CACHE = 'vibe-entregas-v5';
const FILES = ['./', './index.html', './app.js', './api.js', './rotas.js', './public-config.js', './icon-192.png', './icon-512.png', './app.css', './app.webmanifest', '../logo-ideal-2026.png', '../supabase-js.min.js'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vibe-entregas-') && key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const allowed = FILES.map(file => new URL(file, self.location).href);
  if (!allowed.includes(event.request.url)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});
