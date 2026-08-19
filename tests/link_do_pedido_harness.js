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

// ─── As abas que o painel reaproveita ────────────────────────────────────────
//
// `_blank` quer dizer "sempre outra aba": abrir cinco pedidos no Vibe deixava
// cinco abas do Vibe. Um NOME faz o primeiro clique abrir a aba e os seguintes
// trocarem o conteudo dela.

(function asDuasAbasTemNome() {
    ok(/const ABA_DO_VIBE = 'vibe-ideal';/.test(SCRIPT), 'a aba do sistema parceiro tem nome');
    ok(/const ABA_DO_CLIENTE = 'cliente-ideal';/.test(SCRIPT), 'e a do link do cliente tambem');
})();

(function oIconeDoVibeAbreSempreNaMesmaAba() {
    const usos = SCRIPT.match(/target="\$\{ABA_DO_VIBE\}"/g) || [];
    ok(usos.length === 2, 'as duas telas que levam ao Vibe usam a mesma aba', usos.length);
    ok(!/vibe\.ai-ideal\.com\.br[^`]*target="_blank"/.test(SCRIPT),
        'e nenhuma delas ficou no _blank');
})();

(function oLinkDoClienteAbreSempreNaMesmaAba() {
    const usos = SCRIPT.match(/ABA_DO_CLIENTE\)/g) || [];
    ok(usos.length >= 1, 'o link do cliente abre na aba nomeada', usos.length);
    ok(!/window\.open\('\$\{escapeJsAttr\(linkSalvo\)\}','_blank'\)/.test(SCRIPT),
        'o botao da lista nao abre mais aba nova a cada clique');
})();

(function oNoopenerNaoPodeVoltarJuntoDoNome() {
    // Medido num Chrome, nao suposto: com `rel="noopener"` o navegador IGNORA o
    // nome e cria uma aba por clique -- +2 abas em dois cliques, contra +1 sem
    // ele. E `noreferrer` implica `noopener`, entao os dois teriam de voltar
    // juntos. Quem reintroduzir qualquer um dos dois desliga o reaproveitamento
    // sem quebrar nada: o link continua abrindo, so que sempre em aba nova.
    let i = SCRIPT.indexOf('target="${ABA_DO_VIBE}"');
    ok(i > 0, 'ha ancora abrindo na aba do Vibe');
    let quantas = 0;
    while (i > 0) {
        const tag = SCRIPT.slice(SCRIPT.lastIndexOf('<a ', i), SCRIPT.indexOf('>', i));
        ok(!/rel="[^"]*noopener/.test(tag) && !/rel="[^"]*noreferrer/.test(tag),
            'a ancora do Vibe nao traz noopener/noreferrer, que anulariam o nome da aba',
            tag.slice(0, 120));
        quantas++;
        i = SCRIPT.indexOf('target="${ABA_DO_VIBE}"', i + 1);
    }
    ok(quantas === 2, 'as duas ancoras foram conferidas', quantas);
})();

// ─── Em que menu do parceiro o pedido abre ───────────────────────────────────

(function oVibeAbreNoMenuPedido() {
    // Pedido do usuario em 19/08/2026: estava caindo no menu Produto.
    const i = SCRIPT.indexOf('function linkDoPedidoNoVibe');
    ok(i > 0, 'o endereco do Vibe mora numa funcao');
    const aba = (SCRIPT.match(/const ABA_DO_PEDIDO_NO_VIBE = '([^']+)'/) || [null, ''])[1];
    const link = new Function('ABA_DO_PEDIDO_NO_VIBE',
        SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2) + '\nreturn linkDoPedidoNoVibe;')(aba);

    ok(link('20928') === 'https://vibe.ai-ideal.com.br/orcamentos/20928/editar?tab=pedido',
        'e ele leva ao menu Pedido', link('20928'));
    ok(!/tab=produtos/.test(SCRIPT), 'nenhum link ficou no menu Produto');

    // Duas ancoras, um endereco: sem a funcao, mudar o menu exigiria caçar as
    // duas, e a que passasse batida abriria noutro lugar.
    const usos = SCRIPT.match(/linkDoPedidoNoVibe\(os\.numero\)/g) || [];
    ok(usos.length === 2, 'as duas telas montam o endereco pela mesma funcao', usos.length);
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
