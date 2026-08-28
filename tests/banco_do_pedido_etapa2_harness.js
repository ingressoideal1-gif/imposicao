// Etapa 2: dois modelos no MESMO banco do pedido, lendo colunas diferentes.
//
// O caso e o formato largo — uma coluna por dia. Os quatro modelos levam as
// mesmas 150 linhas de proposito, e quem os separa e a coluna. Isso quebra a
// premissa antiga da conferencia de repetidos, que era "linha atribuida a um
// modelo nao vai para outro": aqui vai, e esta certo.
//
// O que este harness prova e que a conferencia continua olhando o VALOR que sai
// impresso — e por isso acerta nos dois sentidos: cala quando os dias sao
// diferentes, e acusa quando dois modelos imprimiriam o mesmo codigo.
//
// Roda em node: `node tests/banco_do_pedido_etapa2_harness.js`.

const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');

let falhas = 0, total = 0;
function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

global.window = global.window || {};
require(path.join(RAIZ, 'frontend', 'banco-do-modelo.js'));

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'numeracaoDoModelo',
               'resolverNumeracaoParaModelo', 'vinculoDeBancoDoModelo', 'pecaDoModelo',
               'colunasDoBancoDaNumeracao', 'linhasComDadoDaNumeracao', 'fatiaCsvDoItem',
               'rotuloDoModelo', 'colunasConferidasDaNumeracao', 'celulasRepetidasDoPedido',
               'modelosComBancoNaoBaixado', 'fonteDoModelo', 'fontePelaChave', 'gruposDeCsvDoPedido'];

function sandbox(state) {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const fonte = NOMES.map(n => extrairFuncao(script, n)).join('\n');
    return new Function('state', 'window', fonte
        + '\nreturn { numeracaoDoModelo, fatiaCsvDoItem, celulasRepetidasDoPedido,'
        + ' colunasConferidasDaNumeracao, modelosComBancoNaoBaixado, fonteDoModelo,'
        + ' fontePelaChave, gruposDeCsvDoPedido };')(state, global.window);
}

/** O CSV do BACKSTAGE: as mesmas pessoas, um codigo por dia. */
function bancoLargo(n) {
    const linhas = [];
    for (let i = 1; i <= n; i++) {
        linhas.push({
            __id: i, NOME: 'PESSOA ' + i,
            '05/09': 'A5C' + i, '06/09': 'B6C' + i, '11/09': 'C1C' + i
        });
    }
    return {
        id: 'b-1', id_int: 21202, nome: 'BACKSTAGE',
        csv_headers: ['NOME', '05/09', '06/09', '11/09'], csv_data: linhas
    };
}

/** Uma peca so, no catalogo, lendo NOME e CODIGO. */
const PECA = {
    id: 'num-vip', name: 'CAMAROTE VIP',
    csv_headers: ['NOME', 'CODIGO'], csv_data: null,
    elements: [
        { id: 'el_1', type: 'TEXT', source: 'database', csv_column: 'NOME' },
        { id: 'el_2', type: 'QR',   source: 'database', csv_column: 'CODIGO' }
    ]
};

function cenario(mapas) {
    const banco = bancoLargo(10);
    const state = {
        numeracoes: [JSON.parse(JSON.stringify(PECA))],
        bancosDoPedido: [banco],
        vinculosDeBanco: {},
        osItens: { 'os-1': [] }
    };
    mapas.forEach((mapa, i) => {
        const id = 'm-' + (i + 1);
        state.osItens['os-1'].push({ id, id_int: 21202, nome_modelo: 'DIA ' + (i + 1), amostra_num_id: 'num-vip' });
        state.vinculosDeBanco[id] = { modelo_id: id, banco_id: 'b-1', csv_mapa: mapa };
    });
    return { state, api: sandbox(state), banco };
}

// ── A mesma peca, quatro modelos, colunas diferentes ─────────────────────────

(function umaPecaQuatroModelos() {
    const { state, api } = cenario([
        { CODIGO: '05/09' }, { CODIGO: '06/09' }, { CODIGO: '11/09' }
    ]);
    const itens = state.osItens['os-1'];

    ok(state.numeracoes.length === 1, 'uma peca so no catalogo para os tres modelos');

    const n1 = api.numeracaoDoModelo(itens[0]);
    const n2 = api.numeracaoDoModelo(itens[1]);
    ok(n1 !== state.numeracoes[0], 'com vinculo, a peca do catalogo nao e entregue crua');
    ok(state.numeracoes[0].csv_data === null,
        'e a peca do catalogo continua sem banco — nada foi escrito nela');

    ok(n1.csv_data.length === 10 && n2.csv_data.length === 10,
        'os dois leem as MESMAS 10 linhas do banco do pedido');

    const col1 = n1.elements.find(e => e.id === 'el_2').csv_column;
    const col2 = n2.elements.find(e => e.id === 'el_2').csv_column;
    ok(col1 === '05/09' && col2 === '06/09', 'e cada um na coluna do seu dia', { col1, col2 });

    // O campo de NOME nao foi mapeado: a coluna existe no banco com o mesmo
    // nome, entao ele continua apontando para ela sem entrada no mapa.
    ok(n1.elements.find(e => e.id === 'el_1').csv_column === 'NOME',
        'coluna de mesmo nome nos dois lados dispensa entrada no mapa');
})();

// ── A conferencia de repetidos: cala no certo, acusa no errado ───────────────

(function diasDiferentesNaoSaoRepeticao() {
    const { state, api } = cenario([
        { CODIGO: '05/09' }, { CODIGO: '06/09' }, { CODIGO: '11/09' }
    ]);
    const rep = api.celulasRepetidasDoPedido('os-1');
    ok(Object.keys(rep).length === 0,
        'tres modelos nas mesmas linhas e em dias diferentes NAO sao repeticao', rep);
})();

(function mesmaColunaEMesmasLinhasEhRepeticao() {
    // O choque de verdade: dois modelos imprimindo o mesmo dia. A premissa
    // antiga (linhas exclusivas) nao pegaria isso, porque as linhas sao as
    // mesmas de proposito nos dois casos. O valor impresso pega.
    const { state, api } = cenario([
        { CODIGO: '05/09' }, { CODIGO: '05/09' }
    ]);
    const rep = api.celulasRepetidasDoPedido('os-1');
    ok(Object.keys(rep).length === 2,
        'dois modelos no MESMO dia sao acusados, os dois', Object.keys(rep));
    if (rep['m-1']) {
        // 20, e nao 10: no mesmo dia repetem o codigo E o nome. Sao duas
        // colunas conferidas batendo nas dez linhas.
        ok(rep['m-1'].total === 20, 'os 10 codigos e os 10 nomes batem', rep['m-1'].total);
    }
})();

(function pecaSemVinculoNaoEntraNaConta() {
    const { state, api } = cenario([{ CODIGO: '05/09' }]);
    // Um quarto modelo na mesma peca, sem banco do pedido: ele le o CSV da
    // peca, que aqui e nulo. Nao pode explodir nem inventar repeticao.
    state.osItens['os-1'].push({ id: 'm-solto', id_int: 21202, nome_modelo: 'SOLTO', amostra_num_id: 'num-vip' });
    const rep = api.celulasRepetidasDoPedido('os-1');
    ok(!rep['m-solto'], 'modelo sem banco do pedido nao aparece como repetido');
})();

// ── A trava, quando o banco do vinculo nao veio ──────────────────────────────

(function vinculoOrfaoBarraOTrabalho() {
    const { state, api } = cenario([{ CODIGO: '05/09' }]);
    state.bancosDoPedido = [];   // o banco nao desceu
    const presos = api.modelosComBancoNaoBaixado('os-1');
    ok(presos.length === 1, 'modelo com vinculo e sem banco fica preso', presos.length);

    // E o desenho nao pode cair no banco da peca por baixo do pano.
    const n = api.numeracaoDoModelo(state.osItens['os-1'][0]);
    ok(!n.csv_data || !n.csv_data.length,
        'sem o banco, a peca resolvida nao ganha linhas de lugar nenhum');
})();

// ── A peca do catalogo virou material compartilhado ─────────────────────────

(function oSaveAvisaQuandoAPecaEstaEmProducao() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    ok(/JA APROVADO\(S\)|JÁ APROVADO\(S\)/.test(script),
        'salvar uma peca do catalogo em uso por modelo aprovado avisa antes');

    // Trava sem saida prende o operador. A saida citada tem de existir de
    // verdade: o duplicar da Lista de Numeracoes.
    ok(/para duplicar/i.test(script) && /duplicateCatalogNumeracao/.test(script),
        'e o aviso aponta o duplicar, que existe na Lista de Numeracoes');

    // So os aprovados: peca de catalogo aparece em dezenas de modelos ao longo
    // do tempo, e avisar em todo save viraria ruido.
    const trecho = script.slice(script.indexOf('A peça genérica do catálogo virou material'));
    ok(/modeloEstaAprovado/.test(trecho.slice(0, 2000)),
        'o aviso filtra por modelo aprovado, para nao virar ruido');
})();

// ── A distribuicao de linhas bebe do poco certo ──────────────────────────────
//
// Este bloco existe por causa de um defeito encontrado em 28/08/2026, depois de
// a Etapa 2 estar escrita: o "Linhas" agrupava os modelos pelo id da NUMERACAO.
// Com o banco do pedido isso abriria as linhas da numeracao e gravaria em
// `csv_selecao` os `__id` de um banco que o modelo nao imprime — o modelo
// passaria a levar as linhas erradas, ou nenhuma, sem nada na tela dizendo por
// que. A `fonteDoModelo` e o conserto.

(function aFonteSeparaOsPocos() {
    const { state, api } = cenario([{ CODIGO: '05/09' }, { CODIGO: '06/09' }]);
    const itens = state.osItens['os-1'];

    const f1 = api.fonteDoModelo(itens[0]);
    const f2 = api.fonteDoModelo(itens[1]);
    ok(f1.tipo === 'banco' && f1.chave === 'banco:b-1', 'modelo com vinculo bebe do banco do pedido', f1.chave);
    ok(f1.chave === f2.chave, 'os dois dividem o MESMO poco, mesmo lendo colunas diferentes');
    ok(f1.rows.length === 10, 'e as linhas sao as do banco, nao as da peca', f1.rows.length);

    // Um terceiro modelo, sem vinculo, numa peca que TEM csv proprio.
    state.numeracoes.push({
        id: 'num-outra', name: 'OUTRA', csv_filename: 'outra.csv',
        csv_headers: ['CODIGO'], csv_data: [{ __id: 1, CODIGO: 'X1' }],
        elements: [{ id: 'e', type: 'QR', source: 'database', csv_column: 'CODIGO' }]
    });
    state.osItens['os-1'].push({ id: 'm-9', id_int: 21202, nome_modelo: 'AVULSO', amostra_num_id: 'num-outra' });
    const f3 = api.fonteDoModelo(state.osItens['os-1'][2]);
    ok(f3.tipo === 'numeracao' && f3.chave === 'num:num-outra',
        'modelo sem vinculo continua bebendo do CSV da numeracao', f3.chave);
    ok(f3.chave !== f1.chave, 'e nao cai no mesmo poco dos outros');
})();

(function osGruposNaoMisturam() {
    const { state, api } = cenario([{ CODIGO: '05/09' }, { CODIGO: '06/09' }]);
    state.numeracoes.push({
        id: 'num-outra', name: 'OUTRA', csv_filename: 'outra.csv',
        csv_headers: ['CODIGO'], csv_data: [{ __id: 1, CODIGO: 'X1' }, { __id: 2, CODIGO: 'X2' }],
        elements: [{ id: 'e', type: 'QR', source: 'database', csv_column: 'CODIGO' }]
    });
    state.osItens['os-1'].push(
        { id: 'm-8', id_int: 21202, nome_modelo: 'A1', amostra_num_id: 'num-outra' },
        { id: 'm-9', id_int: 21202, nome_modelo: 'A2', amostra_num_id: 'num-outra' });

    const grupos = api.gruposDeCsvDoPedido('os-1');
    ok(grupos.length === 2, 'dois grupos: o banco do pedido e a numeracao avulsa', grupos.length);
    const doBanco = grupos.find(g => g.fonte.chave === 'banco:b-1');
    const daNum = grupos.find(g => g.fonte.chave === 'num:num-outra');
    ok(doBanco && doBanco.itens.length === 2, 'o do banco tem os dois modelos do banco');
    ok(daNum && daNum.itens.length === 2, 'o da numeracao tem os dois de la');
    ok(doBanco.itens.every(i => i.id !== 'm-8' && i.id !== 'm-9'),
        'e nenhum modelo aparece no grupo do outro poco');
})();

(function vinculoSemBancoNaoCaiNaNumeracao() {
    const { state, api } = cenario([{ CODIGO: '05/09' }]);
    state.bancosDoPedido = [];   // o banco nao desceu
    ok(api.fonteDoModelo(state.osItens['os-1'][0]) === null,
        'vinculo sem banco na mao nao vira "a numeracao" — abriria o poco errado');
})();

(function aChaveAchaAFonteSemModelo() {
    const { state, api } = cenario([{ CODIGO: '05/09' }]);
    ok(api.fontePelaChave('banco:b-1').tipo === 'banco', 'a chave do banco resolve');
    ok(api.fontePelaChave('banco:b-99') === null, 'chave de banco que nao existe devolve null');
    ok(api.fontePelaChave('num:num-vip') === null,
        'peca sem csv proprio nao vira fonte, mesmo pedida pela chave');
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
