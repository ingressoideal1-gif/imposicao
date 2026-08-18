/**
 * O service worker do Ideal Control — as duas telas do aplicativo.
 *
 * Nasceu servindo so a portaria, e desde 16/08/2026 serve o aplicativo inteiro:
 * a casa (a lista de eventos, onde o cliente tambem carrega os pedidos dele) e
 * o portao. O escopo e `/ic/`, que vem do endereco por onde ele e registrado.
 *
 * Existe por um motivo so: a pagina precisa ABRIR sem rede. Isso e obrigacao no
 * portao, onde nao ha sinal e ha fila. Depois de aberta, quem decide e o
 * IndexedDB — este arquivo nao guarda dado nenhum do evento, e NUNCA guarda
 * resposta de API.
 *
 * O nome do cache carrega a versao, que vem do `?v=` com que a pagina registra
 * este arquivo. O TEXTO daqui e quase sempre igual entre releases --
 * a versao vem de `self.location` em tempo de execucao, nunca do proprio
 * codigo -- entao o navegador quase nunca detecta "o sw.js mudou" pelo
 * conteudo. Quem dispara a troca e OUTRA coisa: o `register` do portaria.html
 * aponta para este arquivo com um `?v=` novo a cada release, e registrar um
 * script de URL diferente no mesmo escopo instala um service worker novo.
 * Um comentario anterior aqui dizia que o conteudo mudava; corrigido em
 * revisao de codigo, 15/08/2026, junto com o defeito que ele escondia: sem
 * isto, um aparelho pareado num release antigo ficava preso NA PAGINA antiga
 * para sempre, mesmo com o servidor ja publicado.
 *
 * A saida esta no `fetch` abaixo: a NAVEGACAO (abrir ou recarregar
 * portaria.html) e network-first, entao toda abertura pega o HTML mais
 * novo -- que ja chega com os `?v=` novos nas tags `<script>` e com o
 * `register` apontando para um `?v=` novo, que e o que faz este proprio
 * arquivo se trocar. Os outros arquivos continuam cache-first, casando a URL INTEIRA
 * (`?v=` incluido), que e o que garante "abrir sem rede" e o carregamento
 * rapido no portao sem prender o aparelho no codigo de uma geracao anterior.
 */
const VERSAO = new URL(self.location).searchParams.get('v') || 'dev';
const CACHE = 'ideal-control-' + VERSAO;

// TODOS os caminhos RELATIVOS, e nao por estilo: este arquivo e servido de
// `/ic/sw.js`, entao `'portaria.js'` vira `/ic/portaria.js` -- que e exatamente
// o que as paginas pedem. Um `'/portaria.js'` guardaria um endereco que
// ninguem visita.
const ARQUIVOS = [
    // A casa. `'./'` e o endereco que o `start_url` do manifesto abre.
    './',
    'controle.html',
    'controle.css?v=' + VERSAO,
    'controle.js?v=' + VERSAO,
    // A tela inicial nova (v613). Sem estes quatro aqui, o aplicativo
    // INSTALADO abre sem rede e mostra a casa VAZIA -- sem lista, sem luzes,
    // sem o toque que vira portao. E a casa e a unica tela que o porteiro ve
    // antes de comecar a ler, entao ela e justamente a que nao pode faltar.
    'chaveiro.js?v=' + VERSAO,
    'lista-eventos.js?v=' + VERSAO,
    'conta.js?v=' + VERSAO,
    'mostrar-senha.js?v=' + VERSAO,
    'meus-pedidos.js?v=' + VERSAO,
    'carregar-pedido.js?v=' + VERSAO,
    'virar-portao.js?v=' + VERSAO,
    'fila-presa.js?v=' + VERSAO,
    'caixa-confirmar.js?v=' + VERSAO,
    'menu-geral.js?v=' + VERSAO,
    'parede-pwa.js?v=' + VERSAO,
    // Sairam em 17/08/2026, com a camera da casa: o `ler-qr.js` lia o QR do
    // Pedido, e o `qr-canvas.js` + `qrcode-generator.min.js` desenhavam o QR de
    // pareamento, que ja nao existe. Guardar arquivo que tela nenhuma pede so
    // ocupa espaco no aparelho -- e o `install` falha inteiro se UM deles
    // deixar de existir. O `evento.html`/`evento.js` e o `instalar.js` que ele
    // carregava sairam junto, na mesma limpeza.
    'aparelho.js?v=' + VERSAO,

    'portaria.html',
    'qr-ideal-hash.js?v=' + VERSAO,
    'portaria-validacao.js?v=' + VERSAO,
    'portaria-deposito.js?v=' + VERSAO,
    // O aviso sonoro e o relogio de cinco minutos (v615). Os dois trabalham
    // JUSTAMENTE quando nao ha rede -- o bipe e gerado no aparelho, e o
    // sincronismo precisa existir para saber que falhou e tentar de novo. Ficar
    // de fora daqui seria deixa-los faltar exatamente no portao.
    'aviso-sonoro.js?v=' + VERSAO,
    'portaria-sincronismo.js?v=' + VERSAO,
    'portaria.js?v=' + VERSAO,

    // Compartilhados pelas duas telas.
    'portaria-camera.js?v=' + VERSAO,
    'jsqr.min.js?v=' + VERSAO,
    'supabase-js.min.js?v=' + VERSAO,
    'supabase-config.js?v=' + VERSAO,
    'acesso-conta.js?v=' + VERSAO,
    'sw-registro.js?v=' + VERSAO,

    // Sem versao, de proposito: o `publicar.ps1` so renumera `.js?v=` e
    // `.css?v=`. Estes sao servidos com `no-cache` pela Vercel, entao a
    // instalacao seguinte ja guarda o arquivo novo. Sem eles aqui, o aplicativo
    // abre sem rede mas o Android nao consegue reler o manifesto, e o icone
    // pode voltar ao generico.
    'app.webmanifest',
    'icones/portaria-192.png',
    'icones/portaria-512.png',
    'apple-touch-icon.png',
    'Logo Ideal Dark.png',
    // A fonte da identidade visual (18/08/2026). Sem ela aqui, o aplicativo
    // sem rede abre com a letra do sistema -- funciona, mas nao e ele.
    'ideal-control.woff2',
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            // `portaria-` continua na lista de propósito: é o nome que os
            // caches criados antes de 16/08/2026 carregam, e sem ele a geração
            // antiga ficaria ocupando espaço no aparelho para sempre.
            .then(nomes => Promise.all(
                nomes.filter(n => (n.startsWith('ideal-control-') || n.startsWith('portaria-'))
                                  && n !== CACHE)
                     .map(n => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Outra ORIGEM nunca passa por aqui. A API da portaria e uma Edge Function
    // do Supabase (`…supabase.co/functions/v1/portaria`), em outro dominio --
    // antes era `/api/...` no mesmo dominio, e o teste era pelo caminho. Uma
    // resposta de controle de acesso servida de cache faria o aparelho recusar
    // ingresso que existe, ou aceitar um que foi cancelado.
    if (url.origin !== self.location.origin) return;
    if (e.request.method !== 'GET') return;

    // caches.open(CACHE).then(c => c.match(...)), e nao caches.match(...)
    // global: o origin ja tem outro cache (frontend/editor-foto.js abre
    // 'ideal-modelos-ia' para modelos ONNX). O global varreria os dois: sem
    // pathname em comum hoje, mas restringir ao cache desta versao da
    // portaria e o que garante que um nome futuro nunca colida por acidente.

    // SO a navegacao (abrir/recarregar portaria.html) e network-first.
    // Cache-first ali prenderia a pagina na versao do dia em que o aparelho
    // pareou -- para sempre, mesmo publicando de novo. "Abrir sem rede"
    // continua garantido: o catch so cai no cache quando a rede falha de
    // verdade.
    //
    // Ignorar a query so acontece nesse ramo: o endereco que o dono compartilha
    // (e o porteiro reabre) e "/portaria.html?e=<evento_id>", mas o install
    // guardou a chave sem query. Sem isso, o match falharia bem no caso que
    // este arquivo existe para cobrir -- reabrir sem rede.
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request).catch(() =>
                caches.open(CACHE).then(c => c.match(e.request, { ignoreSearch: true })))
        );
        return;
    }

    // Os arquivos que a pagina referencia: CACHE-FIRST, com casamento EXATO da
    // URL (o `?v=` incluido). Rede so quando o cache nao tem -- e o que faz o
    // aparelho abrir rapido e continuar funcionando sem sinal no portao, que e
    // a razao deste arquivo existir.
    //
    // Por que exato, e nao ignorando a query como na navegacao: ignorando-a,
    // um pedido de `/portaria.js?v=608` casaria com o `/portaria.js?v=607`
    // guardado, e o aparelho INSTALADO rodaria codigo antigo sob HTML novo.
    // Numa portaria isso e a pior forma de bug: a regra de validacao publicada
    // hoje nao seria a regra que decide na porta.
    //
    // E "abrir sem rede" continua de pe -- reparar que as duas pontas usam a
    // MESMA geracao. Sem rede, a navegacao cai no HTML do cache, e esse HTML
    // pede exatamente os `?v=` que o install daquela geracao guardou. Com rede,
    // o HTML novo pede `?v=` novo, o cache nao tem, e a rede responde.
    e.respondWith(
        caches.open(CACHE)
            .then(c => c.match(e.request))
            .then(r => r || fetch(e.request))
    );
});
