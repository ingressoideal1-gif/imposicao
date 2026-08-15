/**
 * O service worker da tela da portaria.
 *
 * Existe por um motivo so: a pagina precisa ABRIR sem rede. Depois de aberta,
 * quem decide e o IndexedDB — este arquivo nao guarda dado nenhum do evento.
 *
 * O nome do cache carrega a versao, que vem do `?v=` com que o portaria.html
 * registra este arquivo. MAS o TEXTO deste arquivo e byte-identico entre
 * releases -- a versao vem de `self.location` em tempo de execucao, nunca do
 * proprio codigo -- e por isso o navegador NUNCA detecta "o sw.js mudou" e
 * NUNCA reinstala este service worker sozinho. Um comentario anterior aqui
 * afirmava o contrario; corrigido em revisao de codigo, 15/08/2026, junto
 * com o defeito que ele escondia: sem isto, um aparelho pareado num release
 * antigo ficava preso NA PAGINA antiga para sempre, mesmo com o servidor ja
 * publicado.
 *
 * A saida esta no `fetch` abaixo: a NAVEGACAO (abrir ou recarregar
 * portaria.html) e network-first, entao toda abertura pega o HTML mais
 * novo -- que ja chega com os `?v=` novos nas tags `<script>`. Os outros
 * arquivos continuam cache-first, que e o que garante "abrir sem rede" e o
 * carregamento rapido no portao.
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

    // ignoreSearch, nas duas estrategias abaixo: o endereco que o dono
    // compartilha (e o porteiro reabre) e "/portaria.html?e=<evento_id>" --
    // mas o install guardou a chave sem query. Sem ignorar a busca, o match
    // exato falharia bem no caso que este arquivo existe para cobrir: abrir
    // de novo sem rede. Isso e seguro porque cada pathname so tem UMA
    // entrada por geracao de cache (o nome do cache ja carrega a versao);
    // nao ha como um "?v=" velho responder no lugar de um novo.
    //
    // caches.open(CACHE).then(c => c.match(...)), e nao caches.match(...)
    // global: o origin ja tem outro cache (frontend/editor-foto.js abre
    // 'ideal-modelos-ia' para modelos ONNX). O global varreria os dois: sem
    // pathname em comum hoje, mas restringir ao cache desta versao da
    // portaria e o que garante que um nome futuro nunca colida por acidente.

    if (e.request.mode === 'navigate') {
        // SO a navegacao (abrir/recarregar portaria.html) e network-first.
        // Este SW nunca reinstala sozinho (ver comentario no topo do
        // arquivo), entao cache-first aqui prenderia a pagina na versao do
        // dia em que o aparelho pareou -- para sempre, mesmo publicando de
        // novo. "abrir sem rede" continua garantido: o catch so cai no
        // cache quando a rede falha de verdade.
        e.respondWith(
            fetch(e.request).catch(() =>
                caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })))
        );
        return;
    }

    // Os arquivos que a pagina referencia (JS): CACHE-FIRST, de proposito.
    // Rede so quando o cache nao tem -- e o que faz o aparelho abrir rapido
    // e continuar funcionando sem sinal no portao, que e a razao deste
    // arquivo existir. Ficam presos na versao com que este SW instalou ate
    // ele proprio ser substituido (o que exige o TEXTO do sw.js mudar, nao
    // so a query string) -- essa limitacao mais funda nao e o que este
    // achado pediu para resolver; o que ele pediu, e que este `if` acima
    // resolve, e a PAGINA nunca mais ficar presa.
    e.respondWith(
        caches.open(CACHE)
            .then(c => c.match(e.request, { ignoreSearch: true }))
            .then(r => r || fetch(e.request))
    );
});
