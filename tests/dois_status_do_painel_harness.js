// O Painel de Producao tem so DOIS status de impressao: Aguardando e Impresso.
//
// Pedido do usuario em 28/08/2026, depois da verificacao de consequencias:
// Parcial e Revisao nunca foram usados (zero ocorrencias no banco) e nada
// reagia a eles. O meio-caminho de um pedido quem conta e a coluna Progresso.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. o normalizador so devolve Aguardando ou Impresso -- e os valores
//      legados (Parcial, Revisao, Erro) caem em Aguardando, a mesma leitura
//      que o Acabamento sempre fez;
//   2. o status do PEDIDO e Impresso quando TODOS os modelos estao impressos,
//      e Aguardando no resto -- sem estado intermediario;
//   3. nenhum seletor de status volta a oferecer Parcial ou Revisao;
//   4. os seletores de status continuam existindo (a reducao nao os removeu).
//
// Roda em node, sem navegador: `node tests/dois_status_do_painel_harness.js`.
// Os trechos sao LIDOS do codigo vivo, nao copiados.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const CODIGO = ['normalizarStatusImpressao', 'calcularStatusImpressaoPedido']
    .map(n => extrairFuncao(SCRIPT, n)).join('\n');
const api = new Function(CODIGO
    + '\nreturn { normalizarStatusImpressao, calcularStatusImpressaoPedido };')();

// --- 1. O normalizador so conhece dois status --------------------------------

(function soDoisStatusSaem() {
    const n = api.normalizarStatusImpressao;
    ok(n('IMPRESSO') === 'Impresso', 'IMPRESSO vira Impresso');
    ok(n('Impresso') === 'Impresso', 'Impresso minusculo tambem');
    ok(n(null) === 'Aguardando', 'vazio e Aguardando');
    ok(n('AGUARDANDO') === 'Aguardando', 'AGUARDANDO vira Aguardando');
    ok(n('AGUARD.') === 'Aguardando', 'a abreviacao antiga tambem');
})();

(function legadoCaiEmAguardando() {
    const n = api.normalizarStatusImpressao;
    ok(n('PARCIAL') === 'Aguardando', 'PARCIAL legado cai em Aguardando');
    ok(n('Parcial') === 'Aguardando', 'Parcial em caixa mista tambem');
    ok(n('REVISAO') === 'Aguardando', 'REVISAO legado cai em Aguardando');
    ok(n('Revisão') === 'Aguardando', 'Revisao com acento tambem');
    ok(n('ERRO') === 'Aguardando', 'ERRO legado cai em Aguardando');
})();

// --- 2. O status do pedido: tudo ou Aguardando -------------------------------

(function statusDoPedidoSemMeioTermo() {
    const c = api.calcularStatusImpressaoPedido;
    const m = st => ({ impressao: st, status_impressao: st });
    ok(c([]) === 'Aguardando', 'pedido sem modelos e Aguardando');
    ok(c([m('IMPRESSO'), m('IMPRESSO')]) === 'Impresso', 'todos impressos = Impresso');
    ok(c([m('IMPRESSO'), m(null)]) === 'Aguardando',
        'meio impresso = Aguardando (o meio-caminho e da coluna Progresso)');
    ok(c([m('PARCIAL')]) === 'Aguardando', 'PARCIAL legado nao tira o pedido da fila');
    ok(c([m('IMPRESSO'), m('Revisão')]) === 'Aguardando',
        'Revisao legada tambem le como nao impresso');
})();

// --- 3. Nenhum seletor volta a oferecer os status mortos ---------------------

(function seletoresSoComDuasOpcoes() {
    const fonte = SCRIPT + PEDIDO;
    ok((fonte.match(/value="Parcial"/g) || []).length === 0,
        'nenhuma <option value="Parcial"> sobrou');
    ok((fonte.match(/value="Revis/g) || []).length === 0,
        'nenhuma <option value="Revisão"> sobrou');
    // Os seletores em si continuam la: 3 no script.js (linhas do painel x2 e
    // fila da Imposicao) e 1 no pedido.js (fila do Pedido).
    const noScript = (SCRIPT.match(/onchange="updateItemImpressao\(|impQueueUpdateField\('\$\{item\.id\}', '\$\{osId\}', 'status_impressao'/g) || []).length;
    const noPedido = (PEDIDO.match(/pedQueueUpdateField\('\$\{item\.id\}', '\$\{osId\}', 'status_impressao'/g) || []).length;
    ok(noScript === 3, 'os 3 seletores do script.js continuam existindo', noScript);
    ok(noPedido === 1, 'o seletor da fila do Pedido continua existindo', noPedido);
})();

// --- Resultado ---------------------------------------------------------------

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('dois status do painel: ' + total + ' verificacoes, todas passaram.');
