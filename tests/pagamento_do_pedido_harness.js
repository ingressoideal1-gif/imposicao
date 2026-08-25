// A regra de "pago", e a coluna Pagamento da Lista de Arte.
//
// Duas telas fazem a mesma pergunta sobre o mesmo dinheiro: a aba 💳 Pagar do
// link do cliente e a coluna Pagamento da Lista de Arte. Se divergirem, o
// cliente e a grafica passam a ver coisas diferentes -- e e a grafica que
// descobre por ultimo. Por isso a regra mora em `pagamento-do-pedido.js`, e
// estas verificacoes prendem que as duas continuam bebendo da mesma fonte.
//
// Roda em node: `node tests/pagamento_do_pedido_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const REGRA = require(path.join(RAIZ, 'frontend', 'pagamento-do-pedido.js'));
const PAGAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-pagamento.js'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const PRODUCAO = fs.readFileSync(path.join(RAIZ, 'frontend', 'producao.html'), 'utf8');
const CLIENTE_HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.html'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function recortar(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

const { pedidoEstaPago, contarCobrancas } = REGRA;

// ─── 1. Quando o pedido esta pago ────────────────────────────────────────────
//
// Vocabulario medido no banco em 25/08/2026: PAID (6.513), A_RECEBER (368),
// CANCELADO (331) e A_VENCER (272).

(function umaCobrancaSo() {
    ok(pedidoEstaPago([{ status: 'PAID' }]) === true, 'paga');
    ok(pedidoEstaPago([{ status: 'A_RECEBER' }]) === false, 'a receber');
    ok(pedidoEstaPago([{ status: 'A_VENCER' }]) === false, 'a vencer');
})();

(function maisDeUmaCobranca() {
    // Sao 190 pedidos com duas ou mais -- entrada mais parcela, com a
    // referencia indo 20927-A, 20927-B. E os 12 com uma paga e outra em aberto
    // sao os que definem o desenho.
    ok(pedidoEstaPago([{ status: 'PAID' }, { status: 'PAID' }]) === true, 'as duas pagas');
    ok(pedidoEstaPago([{ status: 'PAID' }, { status: 'A_RECEBER' }]) === false,
        'entrada paga e parcela em aberto NAO e pago');
    ok(pedidoEstaPago([{ status: 'A_RECEBER' }, { status: 'A_VENCER' }]) === false, 'nenhuma paga');
})();

(function semCobrancaNaoEPago() {
    // 350 dos 2.629 pedidos hoje na Lista de Arte estao nesse caso. Ali a
    // cobranca ainda nao saiu -- nao que alguem pagou.
    ok(pedidoEstaPago([]) === false, 'lista vazia');
    ok(pedidoEstaPago(null) === false, 'nulo');
    ok(pedidoEstaPago(undefined) === false, 'indefinido');
})();

(function aCanceladaNaoConta() {
    // Sao 331 no banco, e sao cobranca que a grafica DESFEZ: conta-las
    // impediria para sempre o selo de um pedido recotado.
    ok(pedidoEstaPago([{ status: 'PAID' }, { status: 'CANCELADO' }]) === true,
        'paga + cancelada = pago');
    ok(pedidoEstaPago([{ status: 'CANCELADO' }]) === false,
        'so cancelada nao e pago: nao sobrou cobranca viva');
    const c = contarCobrancas([{ status: 'PAID' }, { status: 'CANCELADO' }, { status: 'A_VENCER' }]);
    ok(c.total === 2 && c.pagas === 1, 'a cancelada sai do total e das pagas', c);
})();

(function oErroCaiParaOLadoSeguro() {
    // Selo a menos faz alguem conferir; selo a mais faz alguem deixar de cobrar.
    ok(pedidoEstaPago([{ status: 'STATUS_QUE_O_ERP_INVENTAR' }]) === false, 'status novo');
    ok(pedidoEstaPago([{ status: null }]) === false, 'status nulo');
    ok(pedidoEstaPago([{}]) === false, 'linha sem status');
    ok(pedidoEstaPago([null]) === false, 'linha nula na lista');
    ok(pedidoEstaPago([{ status: '  paid  ' }]) === true, 'espaco e minuscula sao lidos');
})();

// ─── 2. As duas telas bebem da mesma fonte ───────────────────────────────────

(function oLinkDoClienteUsaAMesmaConta() {
    const st = recortar(PAGAMENTO, 'statusDoPagamento');
    ok(/contarCobrancas\(/.test(st),
        'statusDoPagamento conta pela regra compartilhada, e nao por conta propria');
    ok(!/filter\(p =>[^)]*PAID/.test(st),
        'e nao sobrou a contagem antiga, feita a mao ali dentro');
    ok(/pagamento-do-pedido\.js/.test(CLIENTE_HTML),
        'o cliente.html carrega o modulo da regra');
    const iRegra = CLIENTE_HTML.indexOf('pagamento-do-pedido.js');
    const iPagamento = CLIENTE_HTML.indexOf('cliente-pagamento.js');
    ok(iRegra > 0 && iPagamento > 0 && iRegra < iPagamento,
        'e o carrega ANTES de quem o usa', [iRegra, iPagamento]);
})();

(function oPainelUsaAMesmaRegra() {
    const celula = recortar(SCRIPT, 'celulaDePagamentoHtml');
    ok(/pedidoEstaPago\(/.test(celula), 'a celula pergunta a regra compartilhada');
    ok(!/=== 'PAID'/.test(celula), 'e nao repete o vocabulario do ERP por dentro');
    [['index.html', INDEX], ['producao.html', PRODUCAO]].forEach(([nome, html]) => {
        ok(/pagamento-do-pedido\.js/.test(html), nome + ' carrega o modulo da regra');
    });
})();

// ─── 3. A coluna, no lugar que o usuario pediu ───────────────────────────────
//
// "entre as colunas status e itens", 25/08/2026.

(function aColunaFicaEntreStatusEItens() {
    [['index.html', INDEX], ['producao.html', PRODUCAO]].forEach(([nome, html]) => {
        const cabecalho = html.slice(html.indexOf('id="table-arte"'));
        const ths = (cabecalho.slice(0, cabecalho.indexOf('</thead>')).match(/<th[^>]*>([^<]*)</g) || [])
            .map(t => t.replace(/<th[^>]*>/, '').replace('<', '').trim());
        const iStatus = ths.indexOf('Status');
        const iPagamento = ths.indexOf('Pagamento');
        const iItens = ths.indexOf('Itens');
        ok(iStatus >= 0 && iPagamento >= 0 && iItens >= 0, nome + ': as tres colunas existem', ths);
        ok(iPagamento === iStatus + 1 && iItens === iPagamento + 1,
            nome + ': Pagamento fica ENTRE Status e Itens', ths);
    });
})();

(function aCelulaSaiNaMesmaOrdemDaLinha() {
    // Cabecalho e celula desencontrados poem o selo embaixo de outra coluna, e
    // isso nao quebra nada -- so mente.
    const i = SCRIPT.indexOf('celulaDePagamentoHtml(os)}');
    ok(i > 0, 'a celula e chamada na montagem da linha');
    const antes = SCRIPT.lastIndexOf('getStatusBadge(os.status_calculado', 0 + i);
    const depois = SCRIPT.indexOf("'item' : 'itens'", i);
    ok(antes > 0 && antes < i, 'depois da celula de Status', [antes, i]);
    ok(depois > i, 'e antes da celula de Itens', [i, depois]);
})();

// ─── 4. O selo, e o que acontece quando ele nao carrega ──────────────────────

(function oSeloEOArquivoQueOUsuarioMandou() {
    ok(/1787495041552_Pago\.png/.test(SCRIPT), 'o endereco do carimbo esta no codigo');
    const celula = recortar(SCRIPT, 'celulaDePagamentoHtml');
    ok(/SELO_PAGO_URL/.test(celula), 'e a celula o usa por constante, nao colado na mao');
    ok(/alt="Pago"/.test(celula) && /title="Pedido pago"/.test(celula),
        'imagem com texto ao lado: sozinha ela nao se explica');
})();

(function seOSeloNaoCarregarNinguemLeNaoPago() {
    // Sem isto, uma falha de rede deixaria a celula IGUAL a do pedido nao pago.
    const celula = recortar(SCRIPT, 'celulaDePagamentoHtml');
    ok(/onerror=/.test(celula), 'a imagem tem plano B');
    ok(/PAGO/.test(celula.slice(celula.indexOf('onerror='))),
        'e o plano B ainda diz PAGO, em texto');
})();

(function oNaoPagoNaoGanhaAlarme() {
    // Dos 2.629 pedidos hoje na Lista de Arte, 1.950 estao pagos: um selo em
    // cada um dos outros 679 encheria a coluna de alarme para o estado NORMAL
    // de um pedido que acabou de entrar.
    const celula = recortar(SCRIPT, 'celulaDePagamentoHtml');
    const ramoNaoPago = celula.slice(celula.indexOf('if (!pago)'), celula.indexOf('return `<td', celula.indexOf('if (!pago)') + 60));
    ok(!/img/.test(ramoNaoPago), 'o pedido em aberto nao ganha imagem nenhuma');
    ok(/Sem cobrança gerada/.test(celula) && /em aberto/.test(celula),
        'mas o title diz qual dos dois casos e', ramoNaoPago.slice(0, 200));
})();

// ─── 5. A consulta ───────────────────────────────────────────────────────────

(function aConsultaTrazSoOQueAColunaPrecisa() {
    const carga = SCRIPT.slice(SCRIPT.indexOf('async function carregarPagamentosGlobais'));
    const corpo = carga.slice(0, carga.indexOf('\n}\n'));
    ok(/select\('id_int, status'\)/.test(corpo),
        'so id_int e status: link de cobranca e pix nao se espalham por listagem');
    ok(/neq\('status', 'CANCELADO'\)/.test(corpo),
        'a cancelada fica de fora ja na consulta');
    ok(/slice\(i, i \+ bloco\)/.test(corpo),
        'em blocos: o .in() vira URL, e a Lista de Arte abre com milhares de pedidos');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias da coluna Pagamento.');
