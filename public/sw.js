// Service worker do Codeon Ponto.
//
// Estrategia:
//   - navegacoes (HTML): rede primeiro, com a pagina inicial em cache como reserva;
//   - arquivos estaticos (css/js/icones): cache primeiro, atualizando em segundo plano;
//   - chamadas de API: sempre pela rede. Ponto registra no servidor - nunca em cache.
//
// Isso permite abrir o app pelo icone na tela inicial mesmo com internet oscilando,
// sem nunca registrar um ponto "offline" que não chegou ao banco.

const VERSAO = 'codeon-ponto-v1';
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/assets/app.css',
  '/assets/api.js',
  '/assets/app.js',
  '/assets/telas.js',
  '/assets/admin.js',
  '/assets/favicon.svg',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSAO)
      .then((cache) => cache.addAll(CACHE_ASSETS))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((k) => k !== VERSAO).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API nunca vem do cache.
  if (url.pathname.startsWith('/api/')) return;

  // Navegacao: rede primeiro, cache como reserva.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put('/index.html', copia));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Estatico: cache primeiro, revalidando em segundo plano.
  event.respondWith(
    caches.match(req).then((cacheado) => {
      const daRede = fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const copia = res.clone();
          caches.open(VERSAO).then((c) => c.put(req, copia));
        }
        return res;
      }).catch(() => cacheado);
      return cacheado || daRede;
    }),
  );
});
