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

    ok(/window\.abrirBancoDoPedido/.test(script), 'existe uma porta para editar o banco do pedido');
    ok(/btn-banco-editar-/.test(script), 'e ela tem botao no card');

    // A licao de 26/08/2026: o botao que saiu daqui editava o banco da
    // NUMERACAO sem dizer. O rotulo deste diz de quem e o banco.
    ok(/Editar banco do pedido/.test(script),
        'o rotulo diz que o banco e do PEDIDO, e nao so "ver / editar"');

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

    ok(/window\.abrirBancosDoPedido/.test(script) && /__gerir/.test(script),
        'existe a porta de renomear/excluir, oferecida no proprio "Vem de:"');

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

    ok(/__url/.test(script) && /abrirBancoDoPedidoPorLink/.test(script),
        'o "Vem de:" oferece buscar de um link compartilhado');
    ok(/buscarBancoDoPedidoDaWeb/.test(script) && /baixarCsvDaWeb\(link/.test(script),
        'a busca passa pelo MESMO baixarCsvDaWeb da numeracao — planilha Google e CSV solto iguais nas duas portas');

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

(function colunasPorCheckboxAlimentamOEditor() {
    // 28/08/2026: no 🔤 Colunas, a peca SEM dado escolhe por checkbox quais
    // colunas do banco ela conhece; as marcadas viram o csv_headers dela, e e
    // dai que o editor da numeracao tira o dropdown "Coluna do CSV" (e a barra
    // de colunas que cria campo no clique). Conferido no navegador; aqui fica
    // o que nao pode se desfazer sozinho.
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    const abrir = script.slice(script.indexOf('function abrirColunasDoModelo'),
                               script.indexOf('window.abrirColunasDoModelo'));
    ok(/col-do-banco/.test(abrir) && /pecaSemDado/.test(abrir),
        'o modal tem os checkboxes das colunas do banco, so para peca sem dado proprio');
    ok(/csv_data && peca\.csv_data\.length/.test(abrir),
        'peca COM dado nao ganha checkbox — o dropdown dela vem do proprio CSV');

    // A linha do de-para identifica o ELEMENTO — pelo mesmo selo da lista do
    // editor, mais o nome que o operador deu — e nao so "1 campo": e pelo
    // elemento que se escolhe a coluna certa (pedido do usuario, 28/08/2026).
    ok(/nomeDoElemento/.test(abrir) && /Elemento</.test(abrir),
        'o de-para mostra o nome do elemento, nao a contagem de campos');

    const aplicar = script.slice(script.indexOf('async function aplicarColunasDoModelo'),
                                 script.indexOf('window.aplicarColunasDoModelo'));
    ok(/salvarCamposDaNumeracao\(peca\.id, \{ csv_headers/.test(aplicar),
        'aplicar grava as marcadas no csv_headers da peca — nomes, nenhuma linha de dado');
    ok(/emUso/.test(aplicar),
        'coluna que um elemento ja usa nao sai por desmarcacao');
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

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
