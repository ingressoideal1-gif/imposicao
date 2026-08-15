/**
 * O service worker da tela da portaria.
 *
 * Existe por um motivo so: a pagina precisa ABRIR sem rede. Depois de aberta,
 * quem decide e o IndexedDB — este arquivo nao guarda dado nenhum do evento.
 *
 * O nome do cache carrega a versao, que vem do `?v=` com que o portaria.html
 * registra este arquivo — o mesmo numero que o `publicar.ps1` bumpa em todas as
 * paginas a cada release. Publicar troca o cache sozinho, e nao existe o "meu
 * celular esta preso na versao antiga" que assombra service worker.
 */
const VERSAO = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'portaria-' + VERSAO;

const ARQUIVOS = [
    '/portaria.html',
    '/qr-ideal-hash.js?v=' + VERSAO,
    '/portaria-validacao.js?v=' + VERSAO,
    '/portaria-deposito.js?v=' + VERSAO,
    '/portaria-camera.js?v=' + VERSAO,
    '/portaria.js?v=' + VERSAO,
    '/jsqr.min.js?v=' + VERSAO,
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(nomes => Promise.all(
                nomes.filter(n => n.startsWith('portaria-') && n !== CACHE)
                     .map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    // A API NUNCA vem do cache: uma carga velha faria o aparelho recusar
    // ingresso que ja existe, ou aceitar um que foi cancelado.
    if (url.pathname.startsWith('/api/')) return;
    if (e.request.method !== 'GET') return;
    // ignoreSearch: o endereco que o dono compartilha (e o porteiro reabre)
    // e "/portaria.html?e=<evento_id>" -- mas o install acima guardou a
    // chave sem query. Sem ignorar a busca, o match exato falharia bem no
    // caso que este arquivo existe para cobrir: abrir de novo sem rede. Isso
    // e seguro porque cada pathname so tem UMA entrada por geracao de cache
    // (o nome do cache ja carrega a versao); nao ha como um "?v=" velho
    // responder no lugar de um novo.
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
