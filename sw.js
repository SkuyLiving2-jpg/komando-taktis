/* ============================================================
   SW — service worker edisi offline: semua berkas game disimpan
   di perangkat saat pertama dibuka, lalu game berjalan tanpa
   internet. Naikkan VERSI tiap rilis agar perangkat memperbarui.
   ============================================================ */
const VERSI = 'kt-offline-v40';
const BERKAS = [
  'play.html',
  'manifest.webmanifest',
  'css/style.css',
  'css/play.css',
  'fonts/bc500.woff2',
  'fonts/bc600.woff2',
  'fonts/bc700.woff2',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/core/core.js',
  'js/core/geo.js',
  'js/core/doctrine.js',
  'js/warzone/war-lang.js',
  'js/warzone/war-data.js',
  'js/warzone/war.js',
  'js/warzone/war-terrain.js',
  'js/operator/fps-lang.js',
  'js/operator/fps-data.js',
  'js/operator/fps.js',
  'js/operator/fps-sfx.js',
  'js/operator/fps-audio.js',
  'js/operator/fps-render.js',
  'js/operator/fps-models.js',
  'js/operator/fps-models2.js',
  'js/operator/fps-base.js',
  'js/operator/fps-gl.js',
  'js/operator/fps-vm.js',
  'js/operator/fps-heli.js',
  'js/operator/fps-veh.js',
  'js/operator/fps-life.js',
  'js/operator/fps-chute.js',
  'js/operator/fps-claycam.js',
  'js/operator/fps-cray.js',
  'js/operator/fps-kit.js',
  'js/operator/fps-bossdie.js',
  'js/operator/fps-ui.js',
  'js/operator/fps-touch.js',
  'js/offline/play.js'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSI).then(c => c.addAll(BERKAS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSI).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
/* cache dulu (cepat & offline); bila tidak ada, ambil dari jaringan lalu simpan */
self.addEventListener('fetch', e => {
  const r = e.request; if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).then(res => {
    if (res && res.ok) { const cp = res.clone(); caches.open(VERSI).then(c => c.put(r, cp)); }
    return res;
  }).catch(() => r.mode === 'navigate' ? caches.match('play.html') : undefined)));
});
