// Link direto para um pedido: `https://.../pedido/20928` abre o painel ja
// dentro do pedido 20928. E o endereco que se manda ao parceiro.
//
// Pedido do usuario em 19/08/2026.
//
// E CAMINHO, e nao `?pedido=20928`, por um motivo pratico: quando a pessoa nao
// esta logada, o login do Supabase volta para
// `window.location.origin + window.location.pathname`, e a query string se
// perde no caminho de ida. O caminho sobrevive, entao o link continua valendo
// para quem precisa entrar antes de ver.
//
// Roda em node: `node tests/link_do_pedido_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const VERCEL = JSON.parse(fs.readFileSync(path.join(RAIZ, 'vercel.json'), 'utf8'));

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

/**
 * As funcoes LIDAS do script.js, com um `window` e um `state` daquele caso.
 * `_linkDiretoJaAberto` entra junto porque e a memoria de "ja abri uma vez".
 */
function montar({ pathname, ordens, navegar, mostrarView, saiuDaArte }) {
    const fonte = 'let _linkDiretoJaAberto = false;\n'
        + extrairFuncao('linkDiretoDoPedido')
        + extrairFuncao('pedidoDoLinkDireto')
        + extrairFuncao('abrirPedidoDoLinkDireto');
    const win = { location: { origin: 'https://ideal-imposition.vercel.app', pathname: pathname } };
    if (mostrarView) win.showView = mostrarView;
    return new Function('window', 'state', 'navigateToAmostrasFromOS', 'pedidoSaiuDaArte',
        fonte + '\nreturn { linkDiretoDoPedido, pedidoDoLinkDireto, abrirPedidoDoLinkDireto };')(
        win, { ordens: ordens || [] }, navegar, saiuDaArte || (() => false));
}

// ─── O endereco ──────────────────────────────────────────────────────────────

(function oLinkQueSeCopia() {
    const api = montar({ pathname: '/' });
    ok(api.linkDiretoDoPedido('20928') === 'https://ideal-imposition.vercel.app/pedido/20928',
        'o link e a origem mais /pedido/<numero>', api.linkDiretoDoPedido('20928'));
    ok(api.linkDiretoDoPedido(20928).endsWith('/pedido/20928'), 'numero em numero tambem vale');
})();

(function oQueOEnderecoDiz() {
    ok(montar({ pathname: '/pedido/20928' }).pedidoDoLinkDireto() === '20928', 'le o numero do caminho');
    ok(montar({ pathname: '/pedido/20928/' }).pedidoDoLinkDireto() === '20928', 'com barra no fim tambem');
    ok(montar({ pathname: '/PEDIDO/20928' }).pedidoDoLinkDireto() === '20928', 'e sem ligar para a caixa');

    ok(montar({ pathname: '/' }).pedidoDoLinkDireto() === null, 'a raiz nao e link de pedido');
    ok(montar({ pathname: '/cliente/20927-5xs7te' }).pedidoDoLinkDireto() === null,
        'o link do cliente continua sendo dele');
    ok(montar({ pathname: '/pedido/abc' }).pedidoDoLinkDireto() === null, 'so numero vale');
    ok(montar({ pathname: '/pedido/20928/modelos' }).pedidoDoLinkDireto() === null,
        'e nada depois do numero');
})();

// ─── O que o link abre ───────────────────────────────────────────────────────

const PEDIDO = { id: 'vibe_20928', numero: '20928' };

(function caiDentroDoPedido() {
    // O mesmo que clicar na linha da Lista de Arte. Parar na lista com a linha
    // so destacada deixaria mais um clique para o parceiro dar.
    const abertos = [];
    const api = montar({ pathname: '/pedido/20928', ordens: [PEDIDO], navegar: id => abertos.push(id) });
    api.abrirPedidoDoLinkDireto();
    ok(abertos.length === 1 && abertos[0] === 'vibe_20928', 'abre o pedido pelo id dele', abertos);
})();

(function abreUmaVezSo() {
    // O `renderOrdens` roda muitas vezes; sem a memoria, cada desenho
    // arrastaria o operador de volta para o pedido do link.
    const abertos = [];
    const api = montar({ pathname: '/pedido/20928', ordens: [PEDIDO], navegar: id => abertos.push(id) });
    api.abrirPedidoDoLinkDireto();
    api.abrirPedidoDoLinkDireto();
    api.abrirPedidoDoLinkDireto();
    ok(abertos.length === 1, 'tres chamadas, uma abertura', abertos);
})();

(function pedidoQueAindaNaoChegouNaoConsomeAChance() {
    // Os pedidos chegam depois do primeiro desenho. Marcar como aberto aqui
    // gastaria a unica chance antes de o pedido existir.
    const abertos = [];
    const api = montar({ pathname: '/pedido/20928', ordens: [], navegar: id => abertos.push(id) });
    api.abrirPedidoDoLinkDireto();
    ok(abertos.length === 0, 'sem o pedido, nao abre nada');

    const api2 = montar({ pathname: '/pedido/20928', ordens: [], navegar: id => abertos.push(id) });
    api2.abrirPedidoDoLinkDireto();
    api2.state = null;
    ok(abertos.length === 0, 'e segue esperando');
})();

(function enderecoComumNaoMexeEmNada() {
    const abertos = [];
    const api = montar({ pathname: '/', ordens: [PEDIDO], navegar: id => abertos.push(id) });
    api.abrirPedidoDoLinkDireto();
    ok(abertos.length === 0, 'quem entrou pela raiz nao e levado a pedido nenhum');
})();

(function semONavegadorDePedidoAoMenosAListaCerta() {
    const views = [];
    montar({ pathname: '/pedido/20928', ordens: [PEDIDO], navegar: undefined,
             mostrarView: v => views.push(v), saiuDaArte: () => false }).abrirPedidoDoLinkDireto();
    ok(views[0] === 'view-lista-arte', 'pedido em arte cai na Lista de Arte', views);

    const views2 = [];
    montar({ pathname: '/pedido/20928', ordens: [PEDIDO], navegar: undefined,
             mostrarView: v => views2.push(v), saiuDaArte: () => true }).abrirPedidoDoLinkDireto();
    ok(views2[0] === 'view-lista-impressao', 'e quem saiu da arte, no Painel de Producao', views2);
})();

// ─── O caminho precisa chegar ao index.html ──────────────────────────────────

(function aVercelServeOPainelNesseCaminho() {
    // Sem esta reescrita, `/pedido/20928` cairia na regra generica `/:path*`,
    // que procuraria o arquivo `frontend/pedido/20928` e devolveria 404.
    const rewrites = VERCEL.rewrites || [];
    const iPedido = rewrites.findIndex(r => r.source === '/pedido/:match*');
    ok(iPedido >= 0, 'existe a rota /pedido/:match*');
    ok(rewrites[iPedido] && rewrites[iPedido].destination === '/frontend/index.html',
        'e ela serve o painel', rewrites[iPedido]);

    const iGenerica = rewrites.findIndex(r => r.source === '/:path*');
    ok(iGenerica < 0 || iPedido < iGenerica, 'declarada ANTES da regra generica',
        { iPedido, iGenerica });
})();

(function aPaginaResolveOsCaminhosContraARaiz() {
    // A pegadinha que so apareceu abrindo /pedido/20928 num Chrome de verdade:
    // o index.html carrega 23 scripts por caminho RELATIVO. Naquele endereco
    // eles resolveriam para /pedido/script.js, e a reescrita devolveria o
    // proprio index.html no lugar de cada um -- "Unexpected token '<'" oito
    // vezes, pagina morta. O mesmo valeria para o icone do Vibe, que o JS
    // escreve na linha do pedido.
    const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    const iBase = HTML.indexOf('<base href="/">');
    ok(iBase > 0, 'o painel declara a base na raiz');

    // Antes do primeiro caminho relativo, senao ela chega tarde demais.
    const iPrimeiroRelativo = HTML.search(/<(script src|link[^>]*href)="[a-zA-Z]/);
    ok(iPrimeiroRelativo < 0 || iBase < iPrimeiroRelativo,
        'e a declara antes do primeiro arquivo relativo', { iBase, iPrimeiroRelativo });

    // `<base>` mexe em TODA URL relativa do documento. Ancora relativa e o que
    // isso quebraria, e nao ha nenhuma -- este caso guarda essa condicao.
    ok(!/href="#/.test(HTML), 'e nao ha ancora relativa para a base atrapalhar');
})();

// ─── Onde o link e oferecido e disparado ────────────────────────────────────

(function aListaDeArteOfereceOLinkParaCopiar() {
    ok(/copiarLinkDoPedido\('\$\{os\.numero\}'\)/.test(SCRIPT),
        'a linha do pedido tem o botao de copiar');
    ok(/event\.stopPropagation\(\); copiarLinkDoPedido/.test(SCRIPT),
        'e copiar nao abre o pedido junto');
})();

(function oDesenhoDaListaDisparaAAbertura() {
    // Depois do desenho e fora da pilha dele: `abrirPedidoDoLinkDireto` chama
    // `renderOrdens` de novo pelo caminho de dentro, e chamar direto seria
    // recursao.
    ok(/if \(!_linkDiretoJaAberto && pedidoDoLinkDireto\(\)\) setTimeout\(abrirPedidoDoLinkDireto, 0\);/.test(SCRIPT),
        'o renderOrdens agenda a abertura');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
