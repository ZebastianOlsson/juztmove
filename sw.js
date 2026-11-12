// Gör appen installerbar och användbar offline. Sidan hämtas alltid färskt när det finns nät.
const CACHE = 'juztmove-v9';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './icons/icon-192.png?v=8', './icons/icon-512.png?v=8', './apple-touch-icon.png?v=8', './apple-touch-icon-precomposed.png', './icons/favicon-32.png?v=8',
  './fonts/manrope-700.woff2', './fonts/manrope-800.woff2', './fonts/ibm-plex-sans-400.woff2', './fonts/ibm-plex-sans-500.woff2', './fonts/ibm-plex-sans-600.woff2'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.hostname.endsWith('supabase.co')) return; // databasen går aldrig via cachen
  if (url.pathname.endsWith('version.json')) return; // versionskollen ska alltid fråga servern
  if (e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('config.js')) {
    e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
    return;
  }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { if (res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); } return res; })));
});
