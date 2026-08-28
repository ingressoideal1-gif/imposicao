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
               'modelosComBancoNaoBaixado', 'fonteDoModelo', 'fontePelaChave', 'gruposDeCsvDoPedido', 'modelosDoBanco'];

function sandbox(state) {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const fonte = NOMES.map(n => extrairFuncao(script, n)).join('\n');
    return new Function('state', 'window', fonte
        + '\nreturn { numeracaoDoModelo, fatiaCsvDoItem, celulasRepetidasDoPedido,'
        + ' colunasConferidasDaNumeracao, modelosComBancoNaoBaixado, fonteDoModelo,'
        + ' fontePelaChave, gruposDeCsvDoPedido, modelosDoBanco };')(state, global.window);
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

// ── A porta para editar o banco do pedido ───────────────────────────────────

(function quemLeDoMesmoBanco() {
    const { state, api } = cenario([{ CODIGO: '05/09' }, { CODIGO: '06/09' }]);
    state.osItens['os-1'].push({ id: 'm-solto', id_int: 21202, nome_modelo: 'SOLTO', amostra_num_id: 'num-vip' });
    const usuarios = api.modelosDoBanco('os-1', 'b-1');
    ok(usuarios.length === 2, 'so os modelos ligados ao banco contam', usuarios.length);
    ok(!usuarios.some(u => u.id === 'm-solto'), 'o modelo sem vinculo fica de fora');
})();

(function aPortaExisteESoParaOBancoDoPedido() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    // Desde o redesenho de 28/08/2026 a porta mora no BOX do pedido, ao lado
    // do banco — e o card do modelo nao tem mais botao de editar conteudo:
    // no card fica so o que e do modelo (Vem de, Linhas, Colunas).
    ok(/window\.abrirBancoDoPedidoPorId/.test(script), 'existe uma porta para editar o banco do pedido');
    ok(/📊 Conferir/.test(script), 'e ela mora no box, ao lado do banco');
    ok(!/btn-banco-editar-/.test(script), 'o card do modelo NAO tem mais botao de editar banco');

    // E o modal avisa o alcance antes de qualquer tecla.
    ok(/modelos deste pedido\. O que voc/.test(script),
        'e o modal diz quantos modelos leem dali antes de deixar mexer');

    // Renomear coluna do banco arrasta o MAPA, e nao os elementos da peca.
    ok(/aplicarRenomeacoesNoMapa/.test(script),
        'renomear coluna do banco leva o mapa de cada modelo junto');
    const trecho = script.slice(script.indexOf('async function aplicarRenomeacoesNoMapa'));
    ok(!/salvarCamposDaNumeracao/.test(trecho.slice(0, 1500)),
        'e NAO escreve nos elementos da numeracao');
})();

(function aPortaAparecePrecisamenteOndeServe() {
    // 28/08/2026: o "Vem de:" nao aparecia. Duas causas, e as duas ficam
    // presas aqui. O efeito na tela foi conferido no navegador de verdade;
    // estas verificacoes existem para que a correcao nao se desfaca sozinha.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    // (1) A caixa so aparecia onde JA havia banco. A peca reaproveitada — a que
    // pede colunas e nao traz CSV dentro — ficava sem a porta que lhe daria um.
    const caixa = script.slice(script.indexOf('function atualizarBotoesCsvDaAmostra'));
    const ateOTemCsv = caixa.slice(0, caixa.indexOf('linha.style.display'));
    // 28/08/2026, segunda rodada: a primeira versao usava colunasQueAPecaPede,
    // que ignora campo SEM coluna escolhida — e a peca criada sem CSV nasce
    // exatamente assim (a do pedido de teste 21346). A caixa aparece com
    // qualquer campo de banco, nomeado ou nao.
    const linhaAtiva = (ateOTemCsv.split('\n')
        .filter(l => !l.trim().startsWith('//'))
        .find(l => l.includes('pecaPedeColuna ='))) || '';
    ok(/source === 'database'/.test(ateOTemCsv) && !linhaAtiva.includes('colunasQueAPecaPede'),
        'a caixa aparece quando a peca TEM campo de banco, mesmo sem coluna escolhida', linhaAtiva.trim());

    // (2) A busca dos bancos do pedido ia junto com a das numeracoes, atras de
    // um portao que perguntava so por numeracao sem CSV baixado. Pedido cujas
    // numeracoes nao tem CSV nenhum — o caso do banco do pedido — nunca tinha
    // numeracao "faltando", e por isso abria sem os proprios bancos.
    const render = script.slice(script.indexOf('function renderAmostrasOSItens'));
    const portao = render.slice(render.indexOf('state._bancosEmVoo ='),
                                render.indexOf('state._coberturaEmVoo ='));
    ok(/trocouDePedido/.test(portao) && /numeracoesSemBancoBaixado/.test(portao),
        'abrir o pedido busca os bancos DELE, e nao so os CSV das numeracoes');
    ok(/state\.bancosDoPedido = \[\]/.test(portao),
        'e trocar de pedido descarta os bancos do anterior, para o card de um nao oferecer o banco do outro');
})();

(function renomearEExcluirTemPortaETrava() {
    // 28/08/2026: a porta de gerenciar os bancos do pedido. O comportamento
    // foi conferido no navegador de verdade (renomear grava, orfao sai, banco
    // em uso e barrado); aqui fica o que nao pode se desfazer sozinho.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    // Desde 28/08/2026 a porta e o BOX "Gerenciamento de Bancos de Dados", na
    // coluna do Briefing — o "Vem de:" do card so ESCOLHE, sem acoes dentro.
    ok(/Gerenciamento de Bancos de Dados/.test(script) && /desenharBoxDeBancos/.test(script),
        'existe o box do pedido para renomear/excluir os bancos');
    ok(!/__gerir/.test(script) && !/__novo/.test(script) && !/__url/.test(script),
        'o "Vem de:" nao carrega mais acoes disfarcadas de opcao');

    // A trava de excluir: o ON DELETE CASCADE apagaria os vinculos junto e o
    // modelo cairia CALADO na numeracao — dado errado impresso sem aviso. So
    // se exclui com zero leitores, e a conta olha TODOS os vinculos
    // carregados, nao so os itens do pedido aberto.
    const excluir = script.slice(script.indexOf('async function excluirBancoDoPedido'));
    const antesDoDelete = excluir.slice(0, excluir.indexOf(".delete()"));
    ok(/quantosLeemDoBanco/.test(antesDoDelete),
        'excluir confere quem le ANTES de apagar');
    ok(/escolha "a numera/.test(antesDoDelete),
        'e a trava diz a saida: desligar os modelos no "Vem de:"');
    ok(/confirm\(/.test(antesDoDelete),
        'apagar de verdade pede confirmacao, com nome e contagem de linhas');
    const conta = script.slice(script.indexOf('function quantosLeemDoBanco'),
                               script.indexOf('window.quantosLeemDoBanco'));
    ok(/state\.vinculosDeBanco/.test(conta) && !/osItens/.test(conta),
        'a conta de leitores vem dos vinculos carregados, nao dos itens do pedido aberto');
})();

(function bancoPorLinkCompartilhado() {
    // 28/08/2026: o banco do pedido pode nascer de um link compartilhado e ser
    // atualizado por ele. O comportamento foi conferido no navegador de
    // verdade (criar pelo link, herdar __id/__ativo por posicao, recusar banco
    // sem link); aqui fica o que nao pode se desfazer sozinho.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    ok(/abrirBancoDoPedidoPorLink/.test(script) && /🌐 Buscar de link/.test(script),
        'o box oferece buscar de um link compartilhado');
    ok(/buscarBancoDoPedidoDaWeb/.test(script) && /baixarCsvDaWeb\(link/.test(script),
        'a busca passa pelo MESMO baixarCsvDaWeb da numeracao — planilha Google e CSV solto iguais nas duas portas');

    // Redesenho de 28/08/2026: planilha de varias paginas vira UM BANCO POR
    // PAGINA, cada um com o link da SUA aba — e criar NAO vincula modelo
    // nenhum: a adocao e sempre uma escolha no card.
    const buscar = script.slice(script.indexOf('async function buscarBancoDoPedidoDaWeb'),
                                script.indexOf('window.buscarBancoDoPedidoDaWeb'));
    ok(/res\.partes/.test(buscar) && /#gid=/.test(buscar),
        'varias paginas criam um banco por pagina, cada um ligado a sua aba');
    ok(!/ligarModeloAoBanco/.test(buscar),
        'criar pelo link nao vincula modelo nenhum');
    const subir = script.slice(script.indexOf('async function subirBancoDoPedido'),
                               script.indexOf('window.subirBancoDoPedido'));
    ok(!/ligarModeloAoBanco/.test(subir),
        'subir CSV tambem nao vincula — a adocao e no "Vem de:" do modelo');

    // A atualizacao pela planilha herda a identidade POR POSICAO — a fatia dos
    // modelos aponta para o __id destas linhas, e id novo apontaria o vazio.
    const atualizar = script.slice(script.indexOf('async function atualizarBancoDaPlanilha'),
                                   script.indexOf('window.atualizarBancoDaPlanilha'));
    ok(/__id = id/.test(atualizar) && /__ativo = false/.test(atualizar),
        'atualizar pela planilha herda __id e __ativo por posicao');
    ok(/confirm\(/.test(atualizar) && /POSI/.test(atualizar),
        'e avisa antes que o reconhecimento e pela posicao');
    // O link fica gravado no banco: e ele que permite atualizar meses depois.
    const criar = script.slice(script.indexOf('async function criarBancoDoPedido'),
                               script.indexOf('window.criarBancoDoPedido'));
    ok(/csv_url/.test(criar), 'criar o banco grava o csv_url quando veio de um link');
})();

(function aColunaEDoModeloNaoDaPeca() {
    // 28/08/2026, terceira rodada — a decisao final do usuario: "a coluna deve
    // ser selecionada apenas no modelo; a numeracao guarda apenas a informacao
    // dos elementos". O checkbox de colunas-na-peca (da rodada anterior)
    // morreu junto. Comportamento conferido no navegador; aqui fica a forma.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    // O 🔤 tem uma linha POR ELEMENTO, com dropdown das colunas do banco e a
    // caixinha de conferencia — e nada de checkbox de vocabulario da peca.
    const abrir = script.slice(script.indexOf('function abrirColunasDoModelo'),
                               script.indexOf('window.abrirColunasDoModelo'));
    ok(/mapa-el/.test(abrir) && /conferir-el/.test(abrir) && !/col-do-banco/.test(abrir),
        'o 🔤 e por elemento: dropdown da coluna e caixinha de conferencia');
    ok(/colunaDoElemento/.test(abrir),
        'a coluna pre-selecionada vem da resolucao por elemento (com fallback legado)');

    const aplicar = script.slice(script.indexOf('async function aplicarColunasDoModelo'),
                                 script.indexOf('window.aplicarColunasDoModelo'));
    ok(/'el:' \+ elId/.test(aplicar) && /mapaLimpo\(mapa, \[\], elementos\)/.test(aplicar),
        'aplicar grava o apontamento com chave por elemento, no vinculo do modelo');
    ok(/sem_conferencia/.test(aplicar) && /salvarCamposDaNumeracao\(peca\.id, \{ elements/.test(aplicar),
        'a marca de conferencia grava nos elementos da peca, so quando mudou');
    ok(!/csv_headers/.test(aplicar),
        'aplicar NAO escreve mais csv_headers na peca — a peca nao escolhe coluna');

    // O editor: elemento de banco tem o campo "Exemplo:", e o controle de
    // coluna sobrevive SO para peca legada com headers.
    ok(/Exemplo:/.test(script) && /'exemplo',this\.value/.test(script),
        'o editor tem o campo Exemplo: para elemento de banco');
    ok(/textoDeExemploDoElemento/.test(script),
        'a previa mostra o exemplo quando nao ha dado');

    // A trava: elemento sem coluna apontada nao imprime, nas DUAS telas.
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
    ok(/modelosComElementoSemColuna/.test(script) && /modelosComElementoSemColuna/.test(pedido),
        'a trava do elemento sem coluna esta nas duas telas de imposicao');

    // O payload de UM modelo tambem resolve pelo banco do pedido — o
    // multi_artes ja resolvia; o caminho single ficava com a peca crua.
    ok(/itemAtivo/.test(script) && /itemAtivo/.test(pedido),
        'o payload de um modelo so resolve a peca pelo item ativo, nas duas telas');
})();

(function oCardEAPaginacaoVeemOBancoResolvido() {
    // 28/08/2026: o modelo ligado a um banco do pedido desenhava a peca CRUA —
    // sem linhas, a paginacao nao acendia e a previa saia com numero
    // sequencial no lugar do dado. Todo ponto que acha a peca para DESENHAR ou
    // CONTAR tem de resolve-la pelo banco. Conferido no navegador (nav
    // visivel, "Linha 1 / 5", resumo com o dado do banco, pager andando,
    // quantidade = linhas do banco, trava de fatia vazia acusando); aqui fica
    // a forma que nao pode se desfazer.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const corpo = (nome) => {
        const i = script.indexOf('function ' + nome + '(');
        return script.slice(i, script.indexOf('\n}', i));
    };
    ok(/numeracaoDoModelo\(item\)/.test(corpo('modeloSemLinhasDoBanco')),
        'a trava de fatia vazia olha a peca resolvida');
    ok(/numeracaoDoModelo\(item\)/.test(corpo('quantidadeDoModelo')),
        'a quantidade conta as linhas do banco resolvido');
    const pagina = script.slice(script.indexOf('window.amostraCsvPagina'));
    ok(/numeracaoDoModelo\(item\)/.test(pagina.slice(0, pagina.indexOf('renderItemAmostraCombinada'))),
        'o paginador anda pelas linhas resolvidas');
    const render = corpo('renderItemAmostraCombinada');
    ok(/resolverNumeracaoParaModelo\(num, item\)/.test(render),
        'o desenho do card resolve a peca pelo banco do pedido');
    const regen = corpo('regenerarAmostraDoModelo');
    ok(/resolverNumeracaoParaModelo\(num, item\)/.test(regen),
        'a amostra regenerada (a que o cliente ve) tambem');
})();

(function conferenciaMarcavelComBancoDoPedido() {
    // 28/08/2026: as caixas de "conferir repeticoes em" voltaram para o modal
    // de Linhas quando a fonte e o banco do pedido — listando as colunas das
    // PECAS (a marca mora nos elementos; o mapa de cada modelo a leva ate a
    // coluna do dia dele). Conferido no navegador: caixas com OR entre pecas,
    // gravacao so nas pecas que mudaram, e a peca resolvida entregando a
    // coluna do banco para a celulasRepetidasDoPedido.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    ok(/conferencia: conferenciaDasColunasDoGrupo\(fonte, grupo\.itens\)/.test(script),
        'o modal de Linhas mostra as caixas nos DOIS mundos, sem porta so para a numeracao');
    ok(/aplicarConferenciaNoGrupo\(fonte, grupo\.itens, conferencia\)/.test(script),
        'e aplicar grava pelo grupo');

    const doGrupo = script.slice(script.indexOf('function conferenciaDasColunasDoGrupo'),
                                 script.indexOf('window.conferenciaDasColunasDoGrupo'));
    ok(/pecaDoModelo/.test(doGrupo) && /conferenciaDasColunasDaNumeracao/.test(doGrupo),
        'as caixas vem das colunas das PECAS dos modelos, nao das do banco');

    const aplicar = script.slice(script.indexOf('async function aplicarConferenciaNoGrupo'),
                                 script.indexOf('window.aplicarConferenciaNoGrupo'));
    ok(/aplicarConferenciaNasColunas\(peca, escolha\)/.test(aplicar)
        && /salvarCamposDaNumeracao\(peca\.id, \{ elements: peca\.elements \}\)/.test(aplicar),
        'a escolha e gravada nos elementos de cada peca do grupo, so quando mudou');
})();

(function colunasDoModeloVisiveisNoCard() {
    // Consideracao do usuario em 28/08/2026: o card de cada modelo mostra as
    // colunas escolhidas para ele, sem precisar abrir o 🔤 — e SO os nomes:
    // a marca de conferencia de repeticoes fica no modal, nao no card.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    ok(/id="csv-colunas-modelo-\$\{idx\}"[^>]*onclick="abrirColunasDoModelo\(\$\{idx\}, '\$\{osId\}'\)"/.test(script),
        'o card tem a faixa de colunas, e clicar nela abre o 🔤');

    const atualizar = script.slice(script.indexOf('function atualizarBotoesCsvDaAmostra'),
                                   script.indexOf('function desenharEscolhaDeBanco'));
    ok(/desenharEscolhaDeBanco\(idx, item, container, vinculoDaqui\);\s*\n\s*desenharColunasDoModeloNoCard\(idx, item, container, vinculoDaqui\);/.test(atualizar),
        'a faixa e redesenhada junto com o "Vem de:", em todo redesenho do card');

    const corpo = script.slice(script.indexOf('function desenharColunasDoModeloNoCard'),
                               script.indexOf('window.desenharColunasDoModeloNoCard'));
    ok(/colunaDoElemento\(mapa, el\)/.test(corpo),
        'cada ficha le a coluna do ELEMENTO — chave el:<id> primeiro, csv_column legado depois');
    ok(/if \(!banco \|\| !elementos\.length\)/.test(corpo) && /display = 'none'/.test(corpo),
        'sem banco do pedido (ou sem elemento de banco) a faixa fica escondida');
    ok(/sem coluna/.test(corpo) && /var\(--red,#ef4444\)/.test(corpo),
        'elemento sem coluna no banco vira ficha vermelha, a historia da trava');
    ok(!/sem_conferencia/.test(corpo) && !/conferencia/i.test(corpo.replace(/marca de conferencia[^\n]*/g, '')),
        'a faixa NAO mostra a marca de repeticoes — decisao do usuario, ela mora no 🔤');
})();

(function resumoDoPaginadorMostraAsColunasDoModelo() {
    // 28/08/2026, pedido 21346: os modelos COMPARTILHAM as linhas e dividem as
    // colunas — o resumo do paginador mostrava as 3 primeiras colunas do BANCO
    // e punha no card do VIP 1 a coluna do VIP 2. O resumo agora sai das
    // colunas que a peca RESOLVIDA le (colunasQueAPecaPede), com o resumo
    // antigo de reserva para peca sem coluna apontada.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const nav = script.slice(script.indexOf('function atualizarNavCsvDaAmostra'),
                             script.indexOf('function atualizarBotoesCsvDaAmostra'));
    ok(/colunasQueAPecaPede\(num\)/.test(nav),
        'o resumo do operador lista as colunas que ESTE modelo imprime');
    ok(/doModelo\.length \? doModelo/.test(nav) && /num\.csv_headers/.test(nav),
        'peca sem coluna apontada cai no resumo antigo (primeiras do banco)');

    // A pagina do cliente tem a copia dela — mesma regra, derivada dos
    // elementos (la nao ha BancoDoModelo carregado).
    const cliente = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
    const navCli = cliente.slice(cliente.indexOf('function atualizarNavCsvDaAmostra'));
    const resumoCli = navCli.slice(0, navCli.indexOf('const goto'));
    ok(/source !== 'database'/.test(resumoCli) && /el\.csv_column/.test(resumoCli)
        && /doModelo\.length \? doModelo/.test(resumoCli),
        'o resumo do cliente tambem mostra so o que o modelo imprime');
})();

(function fotosDoBancoDoPedido() {
    // 28/08/2026: a porta das fotos no box — o Gerenciador de Fotos abre sobre
    // as linhas do BANCO DO PEDIDO e grava na hora, em vez de exigir o CSV
    // dentro da peça. Conferido no navegador (prova_fotos_do_banco.js).
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    ok(/abrirFotosDoBanco\('\$\{esc\(String\(b\.id\)\)\}', '\$\{escapeJsAttr\(osId\)\}'\)/.test(script),
        'o box tem o botão 🖼️ Fotos por banco');
    ok(/const temFotos = Object\.keys\(colunasDeFotoDoBanco\(osId, b\.id\)/.test(script),
        'e o botão só aparece quando algum modelo aponta janela de foto para o banco');

    const colunas = script.slice(script.indexOf('function colunasDeFotoDoBanco'),
                                 script.indexOf('window.colunasDeFotoDoBanco'));
    ok(/el\.type !== 'FOTO'/.test(colunas) && /colunaDoElemento\(mapa, el\)/.test(colunas),
        'as colunas de foto resolvem por ELEMENTO — peça nova (el:<id>) e legada');

    const porta = script.slice(script.indexOf("window.abrirFotosDoBanco"),
                               script.indexOf('function desenharBoxDeBancos'));
    ok(/chave: 'banco:' \+ banco\.id/.test(porta),
        'a sessão de fotos sobrando é do banco, não da numeração');
    ok(/rows: banco\.csv_data/.test(porta),
        'o gerenciador recebe as linhas VIVAS do banco — o __fotos entra nelas');
    ok(/fotos\/banco-\$\{banco\.id\}/.test(porta),
        'o upload vai para o prefixo do banco no Storage');
    ok(/salvarLinhasDaFonte\(\{ tipo: 'banco', id: banco\.id \}, banco\.csv_data\)/.test(porta),
        'aplicar grava o banco NA HORA — não há passo "Salvar a numeração" aqui');
    ok(/janelas\[coluna\]/.test(porta) && /diferentes/.test(porta),
        'o enquadramento usa a janela do elemento que lê a coluna, avisando se diferem');

    // O editor do banco (📊) marca célula sem foto e conta uso de coluna
    // também para peça nova: resolução por elemento, não só csv_column legado.
    const editor = script.slice(script.indexOf('window.abrirBancoDoPedidoPorId'),
                                script.indexOf('function aplicarRenomeacoesNoMapa'));
    ok(!/colunaNoBanco/.test(editor) && /colunaDoElemento\(mapa, el\)/.test(editor),
        'colunasDeFoto e colunasEmUso do 📊 resolvem por elemento');

    ok(/use o 🖼️ Fotos do box Gerenciamento de Bancos de Dados/.test(script),
        'a porta antiga (na peça) ensina o caminho novo quando a peça não tem CSV');
})();

(function linhaEmMaisDeUmModelo() {
    // 28/08/2026, pedido 21346: os modelos compartilham as linhas e dividem as
    // colunas — e a atribuição exclusiva impedia dar as MESMAS linhas a dois
    // modelos. A caixa "🔁 Linha em mais de um modelo" desliga a exclusividade
    // à vista; desligada, tudo segue como sempre. Conferido no navegador
    // (prova_linha_compartilhada.js): exclusivo, soma, remoção e reabertura.
    const editor = fs.readFileSync(path.join(RAIZ, 'frontend', 'csv-editor.js'), 'utf8');

    ok(/function donosDaLinha\(row\)/.test(editor) && /Array\.isArray\(d\) \? d : \[d\]/.test(editor),
        'a posse virou LISTA de donos por linha');
    ok(/copiaDonos\(ed\.dono\)/.test(editor) && !/dono: new Map\(ed\.dono\)/.test(editor),
        'o desfazer copia as listas em profundidade — cópia rasa corromperia a história');
    ok(/id="csv-ed-compartilhar"|cComp\.id = 'csv-ed-compartilhar'/.test(editor)
        && /Linha em mais de um modelo/.test(editor),
        'o interruptor existe e se explica');
    ok(/if \(ed\.compartilhar\)/.test(editor) && /todasDele/.test(editor),
        'ligado, atribuir SOMA — e clicar no dono de todas as selecionadas o remove');
    ok(/ed\.dono\.set\(id, \[modeloId\]\)/.test(editor),
        'desligado, atribuir segue exclusivo (lista de um dono)');
    ok(/atual\.concat\(\[m\.id\]\)/.test(editor),
        'fatias que se cruzam voltam SOMADAS quando o modal reabre');
    ok(/donosDaLinha\(r\)\.forEach\(d => \{\s*\n?\s*if \(dist\[d\]\)/.test(editor),
        'no Aplicar, a linha compartilhada entra na fatia de CADA dono');

    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    ok(/new Set\(grupo\.itens\.flatMap/.test(script) && /new Set\(g\.itens\.flatMap/.test(script),
        'as sobras (toast e selo do grupo) contam linha única, não a soma das fatias');

    // O relato de 28/08 ("continua o mesmo erro"): a caixa existia mas era
    // invisível no momento da remoção e voltava desligada a cada abertura.
    // Reproduzido e corrigido no navegador (repro_gesto_do_usuario.js).
    ok(/Era para sair nos DOIS modelos\? Ligue a caixa/.test(editor),
        'a remoção exclusiva ENSINA a caixa — a trava tem saída na própria tela');
    ok(/let compartilharPreferido = false/.test(editor)
        && /compartilharPreferido = cComp\.checked/.test(editor),
        'a escolha da caixa vale para as próximas aberturas da página');
    ok(/if \(cruzou \|\| compartilharPreferido\) ed\.compartilhar = true/.test(editor),
        'fatias gravadas que se cruzam reabrem o modal com a caixa LIGADA');
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
