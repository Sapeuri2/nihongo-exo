// Hors ligne (Challenger) : on prend toujours la version du réseau si possible, sinon celle en cache.
// Le cache porte le nom de l'adresse de l'appli : plusieurs applis partagent le domaine.
// Les fichiers lus dans les 3 autres applis (leur contenu data/) passent aussi par ici et sont mis en cache :
// la séance sans IA marche hors ligne une fois ce contenu chargé.
const PREFIX = `cache:${new URL(self.registration.scope).pathname}:`;
const CACHE = `${PREFIX}v1`;
const CORE = [
  './', 'index.html', 'css/style.css', 'css/theme.css', 'css/exo.css', 'js/app.js', 'js/state.js', 'js/sync.js', 'js/text.js',
  'js/liste.js', 'js/ui.js', 'js/config.js', 'js/exo-ia.js', 'js/exo-outils.js', 'js/exo-seance.js', 'js/exo-sources.js',
  'js/exo-strategie.js', 'js/exo-vues.js', 'manifest.webmanifest', 'icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      // Ne supprime que nos anciens caches : d'autres applis partagent le même domaine.
      .then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Seulement notre domaine : les appels à l'IA (Google) ne passent jamais par le cache.
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true }))),
  );
});
