// A lista do botao IMPRESSO, no Painel de Producao, sai do mais RECENTE ao
// mais ANTIGO pela data em que o pedido ficou impresso.
//
// Pedido do usuario em 22/08/2026: "ao selecionar os pedidos 'Impressos' deve
// mostrar a lista do mais recente ao mais antigo, pela data de status
// 'Impresso'. Apenas ao selecionar botao 'IMPRESSO'".
//
// O que estes testes protegem, em uma frase cada:
//
//   1. a data do PEDIDO e a MAIOR entre as dos modelos dele -- o pedido so
//      fica impresso quando o ultimo modelo e marcado;
//   2. a lista sai decrescente: o que saiu por ultimo da impressora no topo;
//   3. pedido sem data vai para o FIM, e nao para o topo (que e onde um `null`
//      tratado como zero o poria numa ordem decrescente);
//   4. o desempate continua sendo o numero maior primeiro, para a lista nao
//      "dancar" entre desenhos;
//   5. a ordem NAO vale para os outros filtros -- Geral, Para Hoje e Atrasados
//      sao fila de trabalho, e ali quem vem na frente e quem precisa sair
//      primeiro;
//   6. clicar num cabecalho continua vencendo: e uma escolha explicita do
//      operador.
//
// Roda em node, sem navegador: `node tests/ordem_dos_impressos_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// Os trechos sao LIDOS do `script.js`, nao copiados: uma copia continuaria
// passando depois de o original mudar.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

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

const NOMES = ['quandoOPedidoFicouImpresso', 'ordenarImpressosPorData'];

let CODIGO;
try {
    CODIGO = NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n');
} catch (e) {
    console.error('FALHOU: ' + e.message);
    console.error('\nAs funcoes da ordem dos impressos nao estao no script.js com esse nome '
        + '(ou nao fecham com "}" na coluna zero).');
    process.exit(1);
}

/** A API com um `state` proprio daquele caso. */
function api(st) {
    return new Function('state', CODIGO + '\nreturn { ' + NOMES.join(', ') + ' };')(st || {});
}

/**
 * Um `state` com pedidos: cada um vira uma entrada em `modelosGlobais`,
 * indexada pelo numero do pedido, como no painel de verdade.
 *
 * `{ numero, datas: [...] }` -> um modelo por data (null = modelo sem data).
 */
function comPedidos(pedidos) {
    const st = { modelosGlobais: {}, osItens: {} };
    const lista = pedidos.map(p => {
        st.modelosGlobais[p.numero] = (p.datas || []).map((d, i) => ({
            id: p.numero + '-' + i,
            status_impressao: 'Impresso',
            status_impressao_em: d,
        }));
        return { id: 'os-' + p.numero, numero: String(p.numero) };
    });
    return { st, lista };
}

// --- 1. A data do pedido e a MAIOR entre as dos modelos ----------------------
//
// O pedido so fica impresso quando o ULTIMO modelo e marcado. Pegar a menor (ou
// a primeira que aparecesse) poria no topo um pedido cujo primeiro modelo saiu
// hoje mas que ainda tem material saindo da impressora.

(function aDataDoPedidoEADoUltimoModelo() {
    const { st, lista } = comPedidos([
        { numero: 100, datas: ['2026-08-20T10:00:00Z', '2026-08-22T18:00:00Z', '2026-08-21T09:00:00Z'] },
    ]);
    const { quandoOPedidoFicouImpresso } = api(st);
    ok(quandoOPedidoFicouImpresso(lista[0]) === Date.parse('2026-08-22T18:00:00Z'),
        'a data do pedido e a do modelo marcado por ultimo');
})();

(function modeloSemDataNaoZeraAConta() {
    const { st, lista } = comPedidos([
        { numero: 100, datas: [null, '2026-08-22T18:00:00Z', undefined, ''] },
    ]);
    const { quandoOPedidoFicouImpresso } = api(st);
    ok(quandoOPedidoFicouImpresso(lista[0]) === Date.parse('2026-08-22T18:00:00Z'),
        'modelo sem data e ignorado, e nao derruba a data do pedido');
})();

(function dataQuebradaNaoViraNaN() {
    const { st, lista } = comPedidos([
        { numero: 100, datas: ['nao e uma data', '2026-08-22T18:00:00Z'] },
    ]);
    const { quandoOPedidoFicouImpresso } = api(st);
    ok(quandoOPedidoFicouImpresso(lista[0]) === Date.parse('2026-08-22T18:00:00Z'),
        'texto que nao e data nao contamina a conta');
})();

(function pedidoSemNenhumaDataDaNull() {
    const { st, lista } = comPedidos([{ numero: 100, datas: [null, null] }]);
    const { quandoOPedidoFicouImpresso } = api(st);
    ok(quandoOPedidoFicouImpresso(lista[0]) === null, 'pedido sem data nenhuma devolve null');
})();

(function pedidoSemModeloDaNull() {
    const { quandoOPedidoFicouImpresso } = api({ modelosGlobais: {}, osItens: {} });
    ok(quandoOPedidoFicouImpresso({ id: 'os-1', numero: '1' }) === null, 'pedido sem modelo devolve null');
    ok(quandoOPedidoFicouImpresso(null) === null, 'sem pedido nenhum devolve null');
})();

(function caiNoOsItensQuandoNaoHaModelosGlobais() {
    // Mesma precedencia do `pedidoTotalmenteImpresso`: os modelos globais na
    // frente, o `osItens` do pedido aberto como reserva.
    const st = {
        modelosGlobais: {},
        osItens: { 'os-100': [{ id: 'a', status_impressao_em: '2026-08-19T12:00:00Z' }] },
    };
    const { quandoOPedidoFicouImpresso } = api(st);
    ok(quandoOPedidoFicouImpresso({ id: 'os-100', numero: '100' }) === Date.parse('2026-08-19T12:00:00Z'),
        'sem modelos globais, vale o que o pedido aberto carregou');
})();

// --- 2. A ordem: do mais recente ao mais antigo ------------------------------

(function doMaisRecenteAoMaisAntigo() {
    const { st, lista } = comPedidos([
        { numero: 10, datas: ['2026-08-01T10:00:00Z'] },
        { numero: 20, datas: ['2026-08-22T10:00:00Z'] },
        { numero: 30, datas: ['2026-08-15T10:00:00Z'] },
    ]);
    const { ordenarImpressosPorData } = api(st);
    const ordem = ordenarImpressosPorData(lista).map(o => o.numero);
    ok(JSON.stringify(ordem) === JSON.stringify(['20', '30', '10']),
        'a lista sai do mais recente ao mais antigo', ordem);
})();

(function semDataVaiParaOFim() {
    const { st, lista } = comPedidos([
        { numero: 10, datas: [null] },
        { numero: 20, datas: ['2026-08-01T10:00:00Z'] },
        { numero: 30, datas: [] },
        { numero: 40, datas: ['2026-08-22T10:00:00Z'] },
    ]);
    const { ordenarImpressosPorData } = api(st);
    const ordem = ordenarImpressosPorData(lista).map(o => o.numero);
    ok(JSON.stringify(ordem) === JSON.stringify(['40', '20', '30', '10']),
        'quem nao tem data fica no fim, e entre eles o numero maior primeiro', ordem);
})();

(function empateDesempataPeloNumeroMaior() {
    const MESMA = '2026-08-22T10:00:00Z';
    const { st, lista } = comPedidos([
        { numero: 10, datas: [MESMA] },
        { numero: 30, datas: [MESMA] },
        { numero: 20, datas: [MESMA] },
    ]);
    const { ordenarImpressosPorData } = api(st);
    const ordem = ordenarImpressosPorData(lista).map(o => o.numero);
    ok(JSON.stringify(ordem) === JSON.stringify(['30', '20', '10']),
        'empate no instante desempata pelo numero maior', ordem);
})();

(function naoReordenaOArrayDeOrigem() {
    const { st, lista } = comPedidos([
        { numero: 10, datas: ['2026-08-01T10:00:00Z'] },
        { numero: 20, datas: ['2026-08-22T10:00:00Z'] },
    ]);
    const { ordenarImpressosPorData } = api(st);
    const antes = lista.map(o => o.numero).join(',');
    ordenarImpressosPorData(lista);
    ok(lista.map(o => o.numero).join(',') === antes,
        'a lista de origem continua na ordem em que chegou');
})();

(function listaVaziaNaoQuebra() {
    const { ordenarImpressosPorData } = api({ modelosGlobais: {}, osItens: {} });
    ok(ordenarImpressosPorData([]).length === 0, 'lista vazia devolve lista vazia');
})();

// --- 3. A ligacao com a tela ------------------------------------------------

(function aColunaVemNoSelectDosModelos() {
    // Sem ela em `carregarModelosGlobais`, a lista inteira ficaria sem data e a
    // ordem cairia no desempate por numero -- passando despercebido.
    const i = SCRIPT.indexOf("'id, id_int, status_arte, status_impressao");
    ok(i > 0, 'o select dos modelos globais continua onde estava');
    const trecho = SCRIPT.slice(i, i + 400);
    ok(trecho.indexOf('status_impressao_em') !== -1,
        'carregarModelosGlobais traz a coluna status_impressao_em');
})();

(function aOrdemSoValeNoBotaoImpresso() {
    const i = SCRIPT.indexOf('filteredImpressao = ordenarImpressosPorData(filteredImpressao)');
    ok(i > 0, 'renderOrdens usa a ordem nova');
    const antes = SCRIPT.slice(Math.max(0, i - 300), i);
    ok(antes.indexOf("=== 'impressos'") !== -1,
        'e so quando o filtro e o botao IMPRESSO');
})();

(function oCabecalhoEscolhidoContinuaVencendo() {
    // `aplicarProdSort` DEPOIS: clicar numa coluna e uma escolha explicita do
    // operador, e ela manda mais que a ordem que a tela traz sozinha.
    const iNova = SCRIPT.indexOf('filteredImpressao = ordenarImpressosPorData(filteredImpressao)');
    const iSort = SCRIPT.indexOf('filteredImpressao = aplicarProdSort(filteredImpressao)');
    ok(iNova > 0 && iSort > iNova, 'a ordenacao do cabecalho e aplicada depois', { iNova, iSort });
})();

// --- Resultado --------------------------------------------------------------

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('ordem dos impressos: ' + total + ' verificacoes, todas passaram.');
