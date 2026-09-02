// A fila de trabalho, nos dois paineis, sai em ordem de PRAZO DE ENTREGA -- do
// menor para o maior.
//
// Pedido do usuario em 02/09/2026: "no painel de producao, a lista dos pedidos
// deve estar em ordem de prazo de entrega, do menor para o maior", e logo em
// seguida "assim como no painel de acabamento".
//
// Ate aqui as duas listas saiam na ordem em que `state.ordens` nasce: numero do
// pedido, do maior para o menor -- o pedido mais NOVO na frente, que e o
// contrario do que a grafica precisa.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. a lista sobe: quem vence antes vem antes;
//   2. pedido SEM prazo vai para o FIM, e nao para o topo (que e onde um `null`
//      tratado como zero o poria numa ordem crescente);
//   3. empate no mesmo dia desempata pelo numero MENOR -- o pedido que entrou
//      antes --, e a lista nao "danca" entre desenhos;
//   4. data pura ("2026-08-21", sem hora) e lida como meia-noite LOCAL: no
//      Brasil, lida como UTC, ela viraria 21h do dia anterior e o pedido
//      trocaria de lugar na fila;
//   5. a funcao e pura: nao reordena o array que recebeu;
//   6. lista vazia, nula, ou com todos sem prazo, nao quebra.
//
// Roda em node, sem navegador: `node tests/ordem_por_prazo_de_entrega_harness.js`.
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

const NOMES = ['_prazoDoPedido', 'ordenarPorPrazoDeEntrega'];

let ordenarPorPrazoDeEntrega, _prazoDoPedido;
try {
    const CODIGO = NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n');
    // `window` existe so para a linha de exportacao do script.js nao explodir.
    const api = new Function('window', CODIGO + '\nreturn { ' + NOMES.join(', ') + ' };')({});
    ordenarPorPrazoDeEntrega = api.ordenarPorPrazoDeEntrega;
    _prazoDoPedido = api._prazoDoPedido;
} catch (e) {
    console.error('FALHOU: ' + e.message);
    console.error('\nAs funcoes da ordem por prazo nao estao no script.js com esse nome '
        + '(ou nao fecham com "}" na coluna zero).');
    process.exit(1);
}

/** `{numero, prazo}` -> o pedido como o painel o monta. */
function pedido(numero, prazo) {
    return { numero: numero, prazo_entrega: prazo === undefined ? null : prazo };
}

const numeros = lista => lista.map(os => os.numero);

// --- 1. A fila sobe pelo prazo ----------------------------------------------

(function daMenorParaAMaior() {
    const lista = [
        pedido(21100, '2026-09-20T00:00:00'),
        pedido(21200, '2026-09-04T00:00:00'),
        pedido(21300, '2026-09-11T00:00:00'),
    ];
    const fora = numeros(ordenarPorPrazoDeEntrega(lista));
    ok(JSON.stringify(fora) === JSON.stringify([21200, 21300, 21100]),
        'o pedido que vence antes vem antes', fora);
})();

(function oMaisNovoNaoVemNaFrenteSoPorSerNovo() {
    // O 21460 e o pedido mais NOVO e vence por ultimo: na ordem antiga (numero
    // decrescente) ele encabecava a fila.
    const lista = [
        pedido(21460, '2026-09-30T00:00:00'),
        pedido(20990, '2026-09-03T00:00:00'),
    ];
    ok(numeros(ordenarPorPrazoDeEntrega(lista))[0] === 20990,
        'o pedido mais novo nao encabeca a fila so por ser novo');
})();

// --- 2. Sem prazo vai para o fim --------------------------------------------

(function semPrazoVaiParaOFim() {
    const lista = [
        pedido(21001, null),
        pedido(21002, '2026-09-15T00:00:00'),
        pedido(21003, undefined),
        pedido(21004, '2026-09-02T00:00:00'),
    ];
    const fora = numeros(ordenarPorPrazoDeEntrega(lista));
    ok(JSON.stringify(fora) === JSON.stringify([21004, 21002, 21001, 21003]),
        'pedido sem prazo fica depois de todos os que tem prazo', fora);
})();

(function prazoInvalidoContaComoSemPrazo() {
    const lista = [pedido(21005, 'sem data'), pedido(21006, '2026-09-10T00:00:00')];
    ok(numeros(ordenarPorPrazoDeEntrega(lista))[0] === 21006,
        'texto que nao e data nao pode encabecar a fila');
})();

// --- 3. Empate desempata pelo numero menor ----------------------------------

(function empateVaiPeloNumeroMenor() {
    const lista = [
        pedido(21300, '2026-09-08T00:00:00'),
        pedido(21100, '2026-09-08T00:00:00'),
        pedido(21200, '2026-09-08T00:00:00'),
    ];
    const fora = numeros(ordenarPorPrazoDeEntrega(lista));
    ok(JSON.stringify(fora) === JSON.stringify([21100, 21200, 21300]),
        'mesmo prazo: o pedido que entrou antes vem antes', fora);
})();

(function todosSemPrazoSaemPeloNumero() {
    const lista = [pedido(21300, null), pedido(21100, null), pedido(21200, null)];
    const fora = numeros(ordenarPorPrazoDeEntrega(lista));
    ok(JSON.stringify(fora) === JSON.stringify([21100, 21200, 21300]),
        'sem prazo nenhum, a ordem e o numero do pedido, e nao o acaso', fora);
})();

// --- 4. Data pura nao troca de dia ------------------------------------------

(function dataPuraNaoVoltaUmDia() {
    // Se a data pura fosse lida como UTC, no Brasil ela viraria 21h do dia
    // ANTERIOR: o pedido apareceria vencendo um dia antes e subiria na fila.
    const dez = pedido(21001, '2026-09-10');
    const prazo = _prazoDoPedido(dez);
    ok(prazo && prazo.getDate() === 10 && prazo.getMonth() === 8,
        'data pura e meia-noite LOCAL do proprio dia', prazo && prazo.toString());

    const lista = [pedido(21002, '2026-09-10T00:00:00'), dez];
    const fora = numeros(ordenarPorPrazoDeEntrega(lista));
    ok(JSON.stringify(fora) === JSON.stringify([21001, 21002]),
        'data pura e data com hora do MESMO dia empatam, e desempatam pelo numero', fora);
})();

// --- 5. Pura: nao mexe no array de origem -----------------------------------

(function naoReordenaAOrigem() {
    const lista = [pedido(21300, '2026-09-20T00:00:00'), pedido(21100, '2026-09-01T00:00:00')];
    const antes = numeros(lista).slice();
    const fora = ordenarPorPrazoDeEntrega(lista);
    ok(JSON.stringify(numeros(lista)) === JSON.stringify(antes),
        'a lista de origem continua como estava (as metricas do topo leem dela)');
    ok(fora !== lista, 'a saida e outro array');
})();

// --- 6. Nao quebra no vazio -------------------------------------------------

(function vazioENulo() {
    ok(ordenarPorPrazoDeEntrega([]).length === 0, 'lista vazia sai vazia');
    ok(ordenarPorPrazoDeEntrega(null).length === 0, 'lista nula sai vazia, e nao quebra o desenho');
    ok(ordenarPorPrazoDeEntrega(undefined).length === 0, 'lista ausente sai vazia');
})();

// --- Resultado --------------------------------------------------------------

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('ordem por prazo de entrega: ' + total + ' verificacoes, todas passaram.');
