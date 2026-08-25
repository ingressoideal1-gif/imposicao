// A PORTA DE ENTRADA DOS PAINEIS (24/08/2026).
//
// Fila de Arte, Fila de Producao e Painel do Acabamento desenham a MESMA
// `state.ordens`. O que nao passa pelo `pedidoEntraNoPainel` nao existe para
// nenhum dos tres -- foi assim que o pedido 20943 ficou invisivel: estava no
// banco, tinha modelo, e o ERP ja o tinha mandado para a EXPEDICAO.
//
// A regra nasceu como "entra quem esta no comercial OU quem tem arte lancada".
// A metade comercial morreu (a tabela `pedidos` nao existe neste banco), e a
// metade da arte virou porta unica. A terceira condicao devolve a metade que
// faltava, pelo campo certo: o que o proprio ERP diz do pedido.
//
// Nada aqui e copia da regra: as funcoes sao recortadas do script.js e
// executadas.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

function recortarConst(nome) {
    const i = SCRIPT.indexOf('const ' + nome + ' = [');
    if (i < 0) throw new Error('nao achei a lista ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('];', i) + 2);
}

const regras = new Function('window', `
    ${recortarConst('SINAIS_SAIU_DA_ARTE')}
    ${recortar('pedidoSaiuDaArte')}
    ${recortar('pedidosJaNaGrafica')}
    ${recortar('pedidoEntraNoPainel')}
    return { pedidoSaiuDaArte, pedidosJaNaGrafica, pedidoEntraNoPainel };
`)({});

const { pedidosJaNaGrafica, pedidoEntraNoPainel } = regras;

// ─── 1. As duas portas antigas continuam abrindo ────────────────────────────

(function asPortasAntigasContinuamAbrindo() {
    const artes = [{ id_int: 21030 }];
    const comercial = [{ id_int: 999 }];
    const vazio = new Set();

    ok(pedidoEntraNoPainel(21030, [], artes, vazio),
       'pedido com arte lancada entra -- e como todos os 49 de hoje entram');
    ok(pedidoEntraNoPainel(999, comercial, [], vazio),
       'pedido no comercial entra, se um dia essa tabela voltar a existir');
    ok(!pedidoEntraNoPainel(12345, comercial, artes, vazio),
       'e quem nao esta em lugar nenhum continua de fora');

    // O numero chega ora texto, ora numero -- do `p.id_int` e do `parseInt`.
    ok(pedidoEntraNoPainel('21030', [], artes, vazio), 'o numero como texto tambem casa');
    ok(pedidoEntraNoPainel(21030, [], [{ id_int: '21030' }], vazio),
       'e a arte gravada como texto tambem');
})();

// ─── 2. A terceira porta: o que o ERP ja mandou para a grafica ──────────────

(function oQueOErpJaMandouParaAGraficaEntra() {
    // O caso que originou tudo: 20943, LISITON, em EXPEDICAO, sem arte nenhuma.
    const naGrafica = pedidosJaNaGrafica([
        { id_int: 20943, status_interno: 'EXPEDICAO' },
    ]);

    ok(naGrafica.has('20943'), 'o pedido em EXPEDICAO conta como "ja na grafica"');
    ok(pedidoEntraNoPainel(20943, [], [], naGrafica),
       'e por isso ele entra nos paineis mesmo sem arte lancada -- era isto que faltava');
})();

(function osEstagiosQueContamComoGrafica() {
    const entram = [
        'EM PRODUCAO', 'EM PRODUÇÃO', 'EM IMPRESSAO', 'EM ACABAMENTO',
        'REVISAO PRODUCAO', 'EXPEDICAO', 'EXPEDIÇÃO', 'EM TRANSITO', 'ENTREGUE',
        // 25/08/2026: a retirada no balcao. O ERP carimba `A RETIRAR` quando o
        // pedido de retirada local fica pronto esperando o cliente -- foi o que
        // devolveu o 21105 e o 21107 para a Fila de Aprovacao.
        'A RETIRAR', 'RETIRADO',
    ];
    entram.forEach(st => {
        const set = pedidosJaNaGrafica([{ id_int: 1, status_interno: st }]);
        ok(set.has('1'), 'entra com status_interno "' + st + '"');
    });

    // A caixa da letra nao importa: o `pedidoSaiuDaArte` normaliza.
    ok(pedidosJaNaGrafica([{ id_int: 1, status_interno: 'expedicao' }]).has('1'),
       'e a caixa da letra nao importa');
    ok(pedidosJaNaGrafica([{ id_int: 1, status_interno: '  EM PRODUCAO  ' }]).has('1'),
       'nem o espaco em volta');
})();

// ─── 3. O comercial continua do lado de fora ────────────────────────────────
//
// Esta e a metade que protege a lista: sao 8 mil pedidos no banco, e a
// esmagadora maioria esta num estagio comercial. Se qualquer um destes passasse,
// a Fila de Arte da grafica viraria um catalogo.

(function oComercialNaoEntraPelaPortaNova() {
    const fora = ['NOVO', 'APROVADO', 'LIBERADO', 'AGUARDANDO', 'CANCELADO',
                  'REVISAO ATENDENTE', 'AGUARDANDO / EM ARTE', '', null, undefined];
    fora.forEach(st => {
        const set = pedidosJaNaGrafica([{ id_int: 2, status_interno: st }]);
        ok(!set.has('2'), 'NAO entra com status_interno "' + st + '"');
        ok(!pedidoEntraNoPainel(2, [], [], set),
           'e o pedido continua fora dos paineis com "' + st + '"');
    });
})();

(function semArteELiberadoContinuaInvisivel() {
    // O LIBERADO merece teste proprio: eram 78 pedidos no dia em que isto foi
    // escrito, e deixa-lo entrar seria a diferenca entre abrir a porta para 17
    // pedidos e abri-la para quase cem.
    const naGrafica = pedidosJaNaGrafica([
        { id_int: 20938, status_interno: 'LIBERADO' },
        { id_int: 20943, status_interno: 'EXPEDICAO' },
    ]);
    ok(!pedidoEntraNoPainel(20938, [], [], naGrafica), 'LIBERADO nao abre a porta');
    ok(pedidoEntraNoPainel(20943, [], [], naGrafica), 'EXPEDICAO abre');
    ok(naGrafica.size === 1, 'so um dos dois entrou no conjunto', String(naGrafica.size));
})();

// ─── 4. Nada de entrada por engano ──────────────────────────────────────────

(function listasVaziasNaoDerrubamNadaENaoAbremNada() {
    ok(!pedidoEntraNoPainel(1), 'sem fonte nenhuma, ninguem entra -- e nao explode');
    ok(!pedidoEntraNoPainel(1, null, null, null), 'nem com tudo nulo');
    ok(pedidosJaNaGrafica(null).size === 0, 'propostas nula devolve conjunto vazio');
    ok(pedidosJaNaGrafica([null, undefined]).size === 0, 'linha nula nao vira numero');
    ok(pedidosJaNaGrafica([{ id_int: 3 }]).size === 0,
       'proposta sem status_interno nao entra: ausencia nao e producao');
})();

// ─── 5. A regra e a MESMA do `pedidoSaiuDaArte` ─────────────────────────────

(function aReguaEAUnica() {
    // Se um dia alguem acrescentar um status ao `SINAIS_SAIU_DA_ARTE`, ele tem
    // de valer para as duas perguntas -- e este teste e o que garante que a
    // porta dos paineis nao ganhe uma lista propria escondida.
    const daLista = recortarConst('SINAIS_SAIU_DA_ARTE');
    daLista.replace(/'([^']+)'/g, (_, st) => {
        ok(pedidosJaNaGrafica([{ id_int: 9, status_interno: st }]).has('9'),
           'o status "' + st + '" da lista oficial abre a porta');
        return _;
    });

    ok(recortar('pedidosJaNaGrafica').indexOf('pedidoSaiuDaArte') !== -1,
       'e ela pergunta ao `pedidoSaiuDaArte`, em vez de repetir a lista');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes da entrada do pedido no painel passaram.');
