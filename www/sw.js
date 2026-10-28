/* Offline cache so the website also works without internet once opened (not used inside the Android app). */
const CACHE = 'rupivo-v1';
const FILES = [
  './', 'index.html', 'terms.html', 'manifest.webmanifest', 'assets/logo.svg', 'css/styles.css',
  'js/config.js', 'js/utils.js', 'js/icons.js', 'js/crypto.js', 'js/storage.js', 'js/store.js', 'js/sms.js', 'js/charts.js',
  'js/ui.js', 'js/forms.js', 'js/view-dashboard.js', 'js/view-accounts.js', 'js/view-people.js', 'js/view-reports.js',
  'js/view-settings.js', 'js/lock.js', 'js/app.js',
];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
);
// network first (so updates show up), fall back to cache when offline
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
