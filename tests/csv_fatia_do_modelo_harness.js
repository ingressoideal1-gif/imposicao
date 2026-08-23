// Testes da fatia do CSV por modelo — quantas células cada modelo do pedido
// impõe quando vários dividem o mesmo banco de dados.
//
// Roda em node, sem navegador: `node tests/csv_fatia_do_modelo_harness.js`.
// Sai com código 1 se algum caso falhar.
//
// Por que isto existe: em 17/08/2026 o pedido 20495 (caderno de credenciais de
// 8 países, 238 linhas) foi imposto pela tela **Pedido** e saiu com as 238
// células em vez das 37 da Bulgária. A regra da fatia estava certa e testada no
// `script.js`; o `pedido.js` é um CLONE dele e nunca recebeu a mudança. Por isso
// há dois blocos aqui: um testa a regra, o outro testa que as duas telas usam a
// mesma regra.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra ? '\n         ' + JSON.stringify(extra) : ''));
}

// ─── Carregar o csv-editor.js num navegador de mentira ────────────────────────

global.window = global.window || {};
global.document = {
    getElementById: () => null,
    createElement: () => ({ style: {}, classList: { add() {}, remove() {} } }),
    head: { appendChild() {} },
    body: { appendChild() {} }
};
require(path.join(RAIZ, 'frontend', 'csv-editor.js'));
const CsvEditor = global.window.CsvEditor;

// ─── A regra: fatiaDoModelo ───────────────────────────────────────────────────

/** Um caderno com N linhas, __id de 1 a N, como o que vem da Planilha Google. */
function caderno(n) {
    const linhas = [];
    for (let i = 1; i <= n; i++) linhas.push({ __id: i, Nome: 'Pessoa ' + i, 'Página': 'p' + i });
    return linhas;
}

(function fatiaDeUmModelo() {
    ok(!!CsvEditor, 'o csv-editor.js carregou fora do navegador');

    const rows = caderno(238);

    // As faixas reais do pedido 20495.
    const bulgaria = CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: ['1-37'] });
    const chile = CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: ['38-66'] });
    const paraguay = CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: ['203-238'] });

    ok(bulgaria.length === 37, 'Bulgária impõe 37 células, não o caderno inteiro', bulgaria.length);
    ok(chile.length === 29, 'Chile impõe 29 células', chile.length);
    ok(paraguay.length === 36, 'Paraguay impõe 36 células', paraguay.length);

    ok(bulgaria[0].__id === 1 && bulgaria[36].__id === 37, 'a fatia da Bulgária são as linhas 1 a 37');
    ok(chile[0].__id === 38, 'a fatia do Chile começa na linha 38, não na 1');

    // A ordem do banco é a ordem de impressão: a fatia não pode reordenar.
    ok(chile.every((r, i) => r.__id === 38 + i), 'a fatia preserva a ordem do banco');
})();

(function ausenteLevaOBancoInteiroVaziaNaoLevaNada() {
    const rows = caderno(10);

    // Ausente = nunca distribuído. É o que mantém todo pedido anterior à v525
    // funcionando sem migração de dado.
    ok(CsvEditor.fatiaDoModelo(rows, null).length === 10,
        'sem seleção, o modelo leva o banco inteiro');
    ok(CsvEditor.fatiaDoModelo(rows, undefined).length === 10,
        'seleção indefinida também leva o banco inteiro');
    ok(CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas' }).length === 10,
        'seleção sem a lista de ids leva o banco inteiro');

    // Lista vazia = houve distribuição e este modelo não ficou com nenhuma linha.
    // Ler isso como "o banco inteiro" fazia o modelo esquecido imprimir tudo.
    ok(CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: [] }).length === 0,
        'lista de ids vazia significa ZERO linhas, não o banco inteiro');
})();

(function linhaDesmarcadaNaoEntra() {
    const rows = caderno(10);
    rows[2].__ativo = false;   // a linha de __id 3 não imprime
    const fatia = CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: ['1-5'] });
    ok(fatia.length === 4, 'linha desmarcada sai da fatia', fatia.map(r => r.__id));
    ok(!fatia.some(r => r.__id === 3), 'a linha desmarcada não é a que ficou');
})();

(function asFatiasFecham() {
    const rows = caderno(238);
    const faixas = ['1-37', '38-66', '67-90', '91-120', '121-149', '150-174', '175-202', '203-238'];
    const vistos = new Set();
    let soma = 0;
    faixas.forEach(f => {
        const fatia = CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: [f] });
        soma += fatia.length;
        fatia.forEach(r => vistos.add(r.__id));
    });
    ok(soma === 238, 'as oito fatias somam o caderno inteiro', soma);
    ok(vistos.size === 238, 'nenhuma linha sai em dois modelos', vistos.size);
})();

// ─── A trava do modelo sem linhas ─────────────────────────────────────────────
//
// As funções são lidas do `script.js` e avaliadas aqui, com um `state` de
// mentira. Testar a função de verdade, e não uma cópia, é o que faz este bloco
// valer alguma coisa: uma cópia continuaria passando depois de o original mudar.

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

(function travaDoModeloSemLinhas() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

    const nomes = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'fatiaCsvDoItem',
                   'rotuloDoModelo', 'modeloSemLinhasDoBanco', 'recadoDeFatiaVazia'];
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');

    const state = { numeracoes: [] };
    const sandbox = new Function('state', 'window', fonte + '\nreturn { modeloSemLinhasDoBanco, recadoDeFatiaVazia };');
    const api = sandbox(state, global.window);

    const num = {
        id: 'num-1',
        csv_filename: 'caderno.csv',
        csv_data: caderno(238)
    };
    state.numeracoes.push(num);

    const modelo = (nome, selecao) => ({
        id: 'm-' + nome, nome_modelo: nome, amostra_num_id: 'num-1', csv_selecao: selecao
    });

    const bulgaria = modelo('Bulgaria', { tipo: 'linhas', ids: ['1-37'] });
    const esquecido = modelo('Esquecido', { tipo: 'linhas', ids: [] });
    const semDistribuir = modelo('Sem distribuir', null);

    ok(api.modeloSemLinhasDoBanco(bulgaria) === null,
        'modelo com fatia passa pela trava');
    ok(api.modeloSemLinhasDoBanco(semDistribuir) === null,
        'modelo nunca distribuido passa pela trava (leva o banco inteiro)');
    ok(api.modeloSemLinhasDoBanco(esquecido) === 'Esquecido',
        'modelo com lista vazia e barrado', api.modeloSemLinhasDoBanco(esquecido));

    ok(api.recadoDeFatiaVazia([bulgaria, semDistribuir]) === null,
        'imposicao com todos os modelos servidos nao trava');

    const recado = api.recadoDeFatiaVazia([bulgaria, esquecido]);
    ok(typeof recado === 'string' && recado.includes('Esquecido'),
        'a trava nomeia o modelo que esta sem linhas', recado);
    ok(recado && /Linhas no card do modelo/.test(recado),
        'a trava diz o que fazer para sair dela', recado);

    // Numeracao sem banco nenhum: a lista vazia nao significa nada ali, e travar
    // impediria de imprimir um modelo que nunca dependeu de CSV.
    const semBanco = { id: 'num-2', csv_data: null };
    state.numeracoes.push(semBanco);
    const avulso = { id: 'm-x', nome_modelo: 'Avulso', amostra_num_id: 'num-2', csv_selecao: { tipo: 'linhas', ids: [] } };
    ok(api.modeloSemLinhasDoBanco(avulso) === null,
        'modelo cuja numeracao nao tem banco nao e barrado');
})();

// ─── As duas telas usam a mesma regra ─────────────────────────────────────────
//
// `pedido.js` nasceu de uma clonagem do `script.js` (a primeira linha do arquivo
// diz isso). Quando uma regra de impressão muda em um, ela precisa mudar no
// outro — e foi justamente esse esquecimento que imprimiu o caderno inteiro.

(function asDuasTelasCortamOBanco() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

    // O ramo "a numeração tem banco embutido" das duas telas de resumo.
    const bancoEmbutido = /else if \(num && num\.csv_data && num\.csv_data\.length\) \{([\s\S]{0,900}?)state\.csvData = ([^\n;]+)/;

    const noScript = script.match(bancoEmbutido);
    const noPedido = pedido.match(bancoEmbutido);

    ok(!!noScript, 'achei o ramo do banco embutido no script.js (tela Imposição)');
    ok(!!noPedido, 'achei o ramo do banco embutido no pedido.js (tela Pedido)');

    ok(noScript && /fatiaCsvDoItem/.test(noScript[2]),
        'a tela Imposição corta o banco na fatia do modelo', noScript && noScript[2]);
    ok(noPedido && /fatiaCsvDoItem/.test(noPedido[2]),
        'a tela Pedido corta o banco na fatia do modelo', noPedido && noPedido[2]);

    // O caminho multi-artes (vários modelos numa folha só) das duas telas.
    ok(/numArte\.csv_data = fatiaCsvDoItem\(itArte, numArte\)/.test(script),
        'a tela Imposição reduz o csv_data de cada arte no multi-artes');
    ok(/numArte\.csv_data = fatiaCsvDoItem\(itArte, numArte\)/.test(pedido),
        'a tela Pedido reduz o csv_data de cada arte no multi-artes');

    // Sem `_itemId`/`_osId` na arte não há como achar o modelo dono da fatia.
    ok(/_itemId: s\.itemId/.test(pedido) && /_osId: s\.osId/.test(pedido),
        'a tela Pedido leva o modelo de cada arte adiante (_itemId/_osId)');

    // A trava da fatia vazia: fatia zerada não pode virar folha impressa, porque
    // o motor cai na numeração sequencial e sai número no lugar do nome.
    ok(/recadoDeFatiaVazia\(itensDaImposicao\(isMultiSelected\)\)/.test(script),
        'a tela Imposição trava quando o modelo está sem linhas');
    ok(/recadoDeFatiaVazia\(itensDaImposicao\(isMultiSelected\)\)/.test(pedido),
        'a tela Pedido trava quando o modelo está sem linhas');

    // A trava precisa dizer a saída, e não só o problema.
    const recado = script.match(/function recadoDeFatiaVazia\(itens\)[\s\S]{0,900}?\n\}/);
    ok(!!recado, 'achei o recado da trava no script.js');
    ok(recado && /Linhas no card do modelo/.test(recado[0]),
        'o recado ensina como sair da trava', recado && recado[0].slice(-200));
})();

// ─── O banco solto nao e emprestado a numeracao sem CSV ──────────────────────
//
// 22/08/2026: a numeracao "Expointer 2026", sem CSV, mostrava "1 de 19.500" no
// card do modelo. Eram as linhas da 1000475, que tinham ficado em
// `state.csvData` (a fatia montada ao olhar um modelo dela) e em
// `state.numCsvData` (o editor). A funcao e lida do script.js, nao copiada.

(function oBancoSoltoNaoEEmprestado() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const nomes = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'fatiaCsvDoItem', 'linhasDaAmostra'];
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    const state = { numeracoes: [], csvData: null, csvDataDerivado: false, numCsvData: null };
    const api = new Function('state', 'window', fonte + '\nreturn { linhasDaAmostra };')(state, global.window);

    const comCsv = { id: 'num-a', csv_data: caderno(19500) };
    const semCsv = { id: 'num-b', csv_data: null, elements: [{ type: 'QR', source: 'database', csv_column: '' }] };
    state.numeracoes.push(comCsv, semCsv);
    const modelo = { id: 'm-1', amostra_num_id: 'num-b', csv_selecao: null };

    // A fatia da numeracao A ficou na memoria, como acontece ao olhar um modelo dela.
    state.csvData = comCsv.csv_data.slice();
    state.csvDataDerivado = true;
    ok(api.linhasDaAmostra(modelo, semCsv).length === 0,
        'numeracao sem CSV nao pega emprestada a fatia que ficou na memoria',
        api.linhasDaAmostra(modelo, semCsv).length);

    // O editor aberto com um CSV tambem nao conta.
    state.csvData = null; state.csvDataDerivado = false;
    state.numCsvData = caderno(50);
    ok(api.linhasDaAmostra(modelo, semCsv).length === 0,
        'o CSV do editor de numeracao nunca vira banco do modelo');

    // O que continua valendo: arquivo subido na caixa da Imposicao (nao derivado).
    state.numCsvData = null;
    state.csvData = caderno(12); state.csvDataDerivado = false;
    ok(api.linhasDaAmostra(modelo, semCsv).length === 12,
        'CSV subido na Imposicao continua servindo a amostra avulsa');

    // E a numeracao com CSV continua entregando a fatia do modelo.
    const dono = { id: 'm-2', amostra_num_id: 'num-a', csv_selecao: { tipo: 'linhas', ids: ['1-37'] } };
    ok(api.linhasDaAmostra(dono, comCsv).length === 37,
        'numeracao com CSV segue entregando a fatia do modelo',
        api.linhasDaAmostra(dono, comCsv).length);

    // E as duas telas marcam a fatia como derivada: sem isto a marca nao existe.
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
    ok((script.match(/state\.csvDataDerivado = true/g) || []).length >= 1,
        'a tela Imposicao marca a fatia como derivada da numeracao');
    ok((pedido.match(/state\.csvDataDerivado = true/g) || []).length >= 1,
        'a tela Pedido marca a fatia como derivada da numeracao');
    ok(!/state\.numCsvData/.test(extrairFuncao(script, 'linhasDaAmostra')),
        'linhasDaAmostra nao le mais o estado do editor');
})();

// ─── Celulas do banco repetidas entre modelos do pedido ─────────────────────
//
// Regra do usuario, 22/08/2026: avisar no card quando uma celula de banco de
// dados que este modelo imprime tambem esta no banco de outro modelo do pedido.
// Nasceu do 21085: tres modelos "Veiculo" herdaram a numeracao do SIMERS e
// imprimiriam os mesmos 4.000 codigos. As funcoes sao LIDAS do script.js.

(function celulasRepetidasEntreModelos() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const nomes = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'numeracaoDoModelo', 'fatiaCsvDoItem',
                   'rotuloDoModelo', 'celulasRepetidasDoPedido', 'textoDasCelulasRepetidas'];
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    const state = { numeracoes: [], osItens: {} };
    const api = new Function('state', 'window', fonte + '\nreturn { celulasRepetidasDoPedido, textoDasCelulasRepetidas };')(state, global.window);

    const qr = { id: 'el_1', type: 'QR', source: 'database', csv_column: 'CODIGO' };
    const linhas = (codigos) => codigos.map((c, i) => ({ __id: i + 1, CODIGO: c }));
    state.numeracoes.push(
        { id: 'num-a', elements: [qr], csv_headers: ['CODIGO'], csv_data: linhas(['1001', '1002', '1003', '1004']) },
        { id: 'num-b', elements: [qr], csv_headers: ['CODIGO'], csv_data: linhas(['1004', '9009']) },
        { id: 'num-c', elements: [{ id: 'el_2', type: 'TEXT' }], csv_headers: ['CODIGO'], csv_data: linhas(['1001']) },
    );
    const modelo = (id, nome, numId, sel) => ({ id, nome_modelo: nome, amostra_num_id: numId, csv_selecao: sel || null });

    // 1. Dois modelos com a MESMA numeracao e sem distribuicao: tudo repete.
    state.osItens['os-1'] = [modelo('m1', 'SIMERS', 'num-a'), modelo('m2', 'Veiculo P16', 'num-a')];
    let r = api.celulasRepetidasDoPedido('os-1');
    ok(r.m1 && r.m1.total === 4 && r.m2 && r.m2.total === 4, 'mesma numeracao sem fatia: as 4 celulas repetem nos dois', r);
    ok(r.m1.outros.length === 1 && r.m1.outros[0].nome === 'Veiculo P16' && r.m1.outros[0].n === 4,
        'o aviso diz com quem e quantas', r.m1.outros);
    ok(/4 células do banco deste modelo também estão no banco de: Veiculo P16 \(4\)/.test(api.textoDasCelulasRepetidas(r.m1)),
        'a frase do aviso', api.textoDasCelulasRepetidas(r.m1));

    // 2. Com a distribuicao feita (fatias disjuntas), nada repete.
    state.osItens['os-2'] = [modelo('m1', 'SIMERS', 'num-a', { tipo: 'linhas', ids: ['1-2'] }),
                             modelo('m2', 'Veiculo P16', 'num-a', { tipo: 'linhas', ids: ['3-4'] })];
    r = api.celulasRepetidasDoPedido('os-2');
    ok(Object.keys(r).length === 0, 'fatias disjuntas da mesma numeracao: sem aviso', r);

    // 3. Bancos DIFERENTES com um codigo em comum: os dois modelos sao avisados, de 1.
    state.osItens['os-3'] = [modelo('m1', 'SIMERS', 'num-a', { tipo: 'linhas', ids: ['3-4'] }),
                             modelo('m3', 'Jurados', 'num-b')];
    r = api.celulasRepetidasDoPedido('os-3');
    ok(r.m1 && r.m1.total === 1 && r.m1.exemplos[0] === '1004', 'um codigo em comum entre bancos diferentes e apontado', r);
    ok(r.m3 && r.m3.total === 1 && r.m3.outros[0].nome === 'SIMERS', 'e o outro lado tambem', r.m3);

    // 4. Numeracao sem elemento de banco nao entra na conta, mesmo com o mesmo valor.
    state.osItens['os-4'] = [modelo('m1', 'SIMERS', 'num-a'), modelo('m4', 'Texto fixo', 'num-c')];
    r = api.celulasRepetidasDoPedido('os-4');
    ok(Object.keys(r).length === 0, 'sem elemento de banco, a celula nao vai para o papel: sem aviso', r);

    // 5. O card desenha a faixa, e o link do cliente nao.
    ok(/\$\{faixaCelulasRepetidas\}/.test(script), 'o card tem a faixa das celulas repetidas');
    ok(/cliente-amostras-itens-container'\)\s*\?\s*\{\}\s*:\s*celulasRepetidasDoPedido\(osId\)/.test(script),
        'no link do cliente o aviso nao e calculado');
})();

// ─── A Conferencia de dados do pedido ───────────────────────────────────────
//
// Regra do usuario, 22/08/2026: um botao no pedido que faz, num clique, a
// revisao que foi feita a mao no 21085. O relatorio e um objeto simples, LIDO
// do script.js, e e isso que se testa aqui.

(function aConferenciaDeDadosDoPedido() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const nomes = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'numeracaoDoModelo', 'fatiaCsvDoItem',
                   'rotuloDoModelo', 'celulasRepetidasDoPedido', 'textoDasCelulasRepetidas',
                   'bancoDeDadosIncompletoDoModelo', 'celulasEsperadasDoModelo', 'numeracaoEhDuplex',
                   'celulasGeradasDoModelo', 'divergenciaDeCelulasDoModelo', 'textoDaDivergenciaDeCelulas',
                   'primeiraLinhaDoModelo', 'conferenciaDeDadosDoPedido', 'textoDaConferencia'];
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    const state = { numeracoes: [], osItens: {} };
    const api = new Function('state', 'window', fonte + '\nreturn { primeiraLinhaDoModelo, conferenciaDeDadosDoPedido, textoDaConferencia };')(state, global.window);

    const qr = (col) => ({ id: 'el_1', type: 'QR', source: 'database', csv_column: col });
    const rows = (cods) => cods.map((c, i) => ({ __id: i + 1, CODIGO: c }));
    state.numeracoes.push(
        { id: 'n-ok',   name: 'OK',      csv_filename: 'ok.csv',   elements: [qr('CODIGO')], csv_headers: ['CODIGO'], csv_data: rows(['1001', '1002', '1003', '1004']) },
        { id: 'n-dup',  name: 'DUP',     csv_filename: 'dup.csv',  elements: [qr('CODIGO')], csv_headers: ['CODIGO'], csv_data: rows(['5', '5', '6']) },
        { id: 'n-vaz',  name: 'VAZ',     csv_filename: 'vaz.csv',  elements: [qr('CODIGO')], csv_headers: ['CODIGO'], csv_data: rows(['7', '']) },
        { id: 'n-sem',  name: 'SEMCSV',  csv_filename: '',         elements: [qr('CODIGO')], csv_headers: [], csv_data: null },
        { id: 'n-txt',  name: 'TEXTO',   csv_filename: '',         elements: [{ id: 'el_2', type: 'TEXT' }], csv_data: null },
        { id: 'n-jur',  name: 'JUR',     csv_filename: 'jur.csv',  elements: [qr('CODIGO')], csv_headers: ['CODIGO'], csv_data: rows(['1004', '9009']) },
    );
    const modelo = (id, nome, numId, qtd) => ({ id, nome_modelo: nome, amostra_num_id: numId, quantidade: qtd });

    // O pedido com de tudo um pouco.
    state.osItens['os-x'] = [
        modelo('m1', 'SIMERS', 'n-ok', 4),
        modelo('m2', 'Dup', 'n-dup', 3),
        modelo('m3', 'Vazio', 'n-vaz', 2),
        modelo('m4', 'SemCsv', 'n-sem', 2),
        modelo('m5', 'Texto', 'n-txt', 1),
        modelo('m6', 'Jur', 'n-jur', 2),
    ];
    const rel = api.conferenciaDeDadosDoPedido('os-x');
    const por = {}; rel.modelos.forEach(m => por[m.id] = m);
    ok(rel.ok === false && rel.problemas.length >= 5, 'o pedido misto nao passa, e lista os pontos', rel.problemas);
    ok(por.m1.usaBanco && por.m1.linhas === 4 && por.m1.codigos === 4 && por.m1.repetidosDentro === 0 && por.m1.vazios === 0,
        'o modelo limpo conta 4 linhas, 4 codigos, zero repetido, zero vazio', por.m1);
    ok(por.m1.numeracao === 'OK' && por.m1.arquivo === 'ok.csv', 'o relatorio diz a numeracao e o arquivo');
    ok(por.m2.repetidosDentro === 1 && por.m2.avisos.some(a => /repetido\(s\) dentro/.test(a)), 'codigo repetido dentro do CSV e apontado', por.m2);
    ok(por.m3.vazios === 1 && por.m3.avisos.some(a => /vazia/.test(a)), 'celula vazia e apontada', por.m3);
    ok(por.m4.avisos.some(a => /nenhum CSV/.test(a)), 'elemento de banco sem CSV e apontado', por.m4);
    ok(por.m5.usaBanco === false && por.m5.avisos.length === 0, 'numeracao sem banco nao e cobrada por CSV', por.m5);
    ok(por.m1.avisos.some(a => /também está/.test(a)) && por.m6.avisos.some(a => /também está/.test(a)),
        'o codigo 1004, comum a SIMERS e Jur, aparece nos dois', [por.m1.avisos, por.m6.avisos]);
    ok(por.m2.avisos.some(a => /Qtd 3/.test(a)) === false, 'qtd 3 com 3 linhas: sem divergencia de celulas', por.m2.avisos);

    const txt = api.textoDaConferencia(rel, 21085);
    ok(/CONFERÊNCIA DE DADOS — Pedido 21085/.test(txt) && /ponto\(s\) de atenção/.test(txt) && /SIMERS \| qtd 4/.test(txt),
        'o texto para copiar tem cabecalho, resumo e uma linha por modelo', txt.slice(0, 200));

    // E o pedido limpo passa.
    state.osItens['os-limpo'] = [modelo('a', 'A', 'n-ok', 4), modelo('b', 'B', 'n-txt', 1)];
    const limpo = api.conferenciaDeDadosDoPedido('os-limpo');
    ok(limpo.ok === true && limpo.problemas.length === 0, 'pedido limpo: ok, sem problemas', limpo.problemas);
    ok(/Nenhum problema encontrado/.test(api.textoDaConferencia(limpo, 1)), 'e o texto diz isso');

    // O botao existe no cabecalho do pedido e chama a janela.
    const index = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    ok(/id="btn-conferencia-dados"[^>]*onclick="abrirConferenciaDeDados\(\)"/.test(index), 'o botao Conferencia de dados esta no pedido');
    ok(/async function abrirConferenciaDeDados\([\s\S]{0,600}await recarregarNumeracoesDoPedido\(osId\)/.test(script),
        'a janela rele as numeracoes do banco antes de conferir');

    // ─── A 1a LINHA de cada modelo (pedido do usuario, 23/08/2026) ────────────
    //
    // Numa numeracao dividida entre varios modelos, ler por onde a fatia de cada
    // um COMECA e o jeito mais rapido de ver que a distribuicao saiu certa --
    // sem abrir o CSV modelo a modelo. Por isso a 1a linha tem de vir da FATIA
    // daquele modelo, e nunca do topo do banco inteiro.

    const p1 = api.primeiraLinhaDoModelo;

    (function aPrimeiraLinhaSaiDaFatiaDoModelo() {
        const rows = [];
        for (let i = 1; i <= 100; i++) rows.push({ __id: i, CODIGO: String(1000 + i), NOME: 'Pessoa ' + i });
        state.numeracoes.push({
            id: 'n-fatia', name: 'FATIA', csv_filename: 'fatia.csv',
            elements: [qr('CODIGO')], csv_headers: ['CODIGO', 'NOME'], csv_data: rows,
        });
        const comFatia = (id, faixa, qtd) => ({
            id, nome_modelo: id, amostra_num_id: 'n-fatia', quantidade: qtd,
            csv_selecao: { tipo: 'linhas', ids: [faixa] },
        });
        state.osItens['os-fatia'] = [comFatia('a', '1-50', 50), comFatia('b', '51-100', 50)];
        const r = {}; api.conferenciaDeDadosDoPedido('os-fatia').modelos.forEach(m => r[m.id] = m);

        ok(/CODIGO: 1001/.test(r.a.primeira), 'o 1o modelo comeca na linha 1 da fatia dele', r.a.primeira);
        ok(/CODIGO: 1051/.test(r.b.primeira), 'o 2o comeca na fatia DELE, e nao no topo do banco', r.b.primeira);
    })();

    (function aColunaDoBancoVemPrimeiroEMarcada() {
        // No CSV o NOME vem antes; no relatorio a coluna que vai para o PAPEL e
        // que abre a linha.
        const r = p1([{ __id: 1, NOME: 'Maria', CODIGO: 'X9' }], ['CODIGO']);
        ok(r.pares[0].coluna === 'CODIGO' && r.pares[0].doBanco === true,
            'a coluna do banco abre a linha e vem marcada', r.pares);
        ok(r.pares[1].coluna === 'NOME' && r.pares[1].doBanco === false, 'as outras vem depois', r.pares);
        ok(r.texto === 'CODIGO: X9 · NOME: Maria', 'o texto sai na mesma ordem', r.texto);
    })();

    (function colunaDoBancoVaziaApareceAsOutrasNao() {
        // Uma coluna do banco em branco na 1a linha e exatamente o que este
        // relatorio existe para mostrar; uma coluna comum vazia e so ruido.
        const r = p1([{ __id: 1, CODIGO: '   ', NOME: '', EMPRESA: 'Acme' }], ['CODIGO']);
        ok(r.texto === 'CODIGO: (vazio) · EMPRESA: Acme', 'coluna do banco vazia aparece; coluna comum vazia, nao', r.texto);
    })();

    (function colunaApontadaQueNaoExisteNoCsvAparece() {
        const r = p1([{ __id: 1, NOME: 'Maria' }], ['CPF']);
        ok(/^CPF: \(vazio\)/.test(r.texto), 'coluna apontada que nao existe no CSV fica visivel', r.texto);
    })();

    (function asChavesDeControleFicamDeFora() {
        const r = p1([{ __id: 7, __ativo: false, __fotos: { a: 1 }, CODIGO: 'Z1' }], ['CODIGO']);
        ok(r.texto === 'CODIGO: Z1', '__id, __ativo e __fotos nao sao dado do cliente', r.texto);
    })();

    (function semLinhaNaoDaTexto() {
        ok(p1([], ['CODIGO']).texto === '' && p1(null, ['CODIGO']).texto === '', 'fatia vazia nao inventa linha');
        ok(p1([{ __id: 1, CODIGO: 'A' }], null).texto === 'CODIGO: A', 'sem colunas de banco, vale o que a linha tem');
    })();

    (function numeracaoSemBancoAindaMostraOComeco() {
        // O CSV existe; so nao ha elemento lendo dele. O operador continua
        // querendo ver por onde a lista comeca.
        state.numeracoes.push({
            id: 'n-txt-csv', name: 'TXTCSV', csv_filename: 't.csv',
            elements: [{ id: 'el_9', type: 'TEXT' }], csv_headers: ['NOME'],
            csv_data: [{ __id: 1, NOME: 'Ana' }],
        });
        state.osItens['os-txt'] = [modelo('só-texto', 'SóTexto', 'n-txt-csv', 1)];
        const m = api.conferenciaDeDadosDoPedido('os-txt').modelos[0];
        ok(m.usaBanco === false && m.primeira === 'NOME: Ana',
            'numeracao sem banco tambem mostra a 1a linha do CSV', m);
        ok(m.codigos === 0 && m.linhas === 0, 'e continua sem ser cobrada por codigos', m);
    })();

    (function aPrimeiraLinhaVaiNoTextoCopiadoENaTabela() {
        ok(/1ª linha: CODIGO: 1001/.test(api.textoDaConferencia(api.conferenciaDeDadosDoPedido('os-fatia'), 1)),
            'o relatorio copiado leva a 1a linha COM os nomes das colunas');
        ok(/<th[^>]*>1ª linha<\/th>/.test(script), 'a tabela da janela tem a coluna 1a linha');
        ok(/primeiraPares/.test(script), 'e a celula desenha os pares dessa linha');
    })();

    // ─── O lugar e a forma da coluna (ajuste do usuario, 23/08/2026) ──────────
    //
    // "deve mostrar na coluna 1a linha apenas a informacao da linha, a coluna
    // deve vir apos a coluna Numeracao / arquivo".

    (function aColunaVemLogoDepoisDaNumeracao() {
        const i = script.indexOf('<th style="padding:6px 4px;">Modelo</th>');
        ok(i > 0, 'o cabecalho da tabela continua onde estava');
        const cabec = script.slice(i, script.indexOf('</tr></thead>', i));
        const ordem = (cabec.match(/<th[^>]*>([^<]+)<\/th>/g) || [])
            .map(t => t.replace(/<[^>]+>/g, '').trim());
        ok(ordem.join(' | ') === 'Modelo | Numeração / arquivo | 1ª linha | Linhas / Qtd | Códigos | Repet. dentro | Vazios | Situação',
            'a 1a linha vem logo depois da Numeracao / arquivo', ordem);
    })();

    (function aCelulaMostraSoOsValores() {
        // O nome da coluna repetido em cada celula era a mesma palavra dezenas de
        // vezes na mesma tela, e empurrava Vazios e Situacao para fora da janela.
        const i = script.indexOf('const valor = p =>');
        ok(i > 0, 'a celula da 1a linha desenha um VALOR, nao um par');
        const corpo = script.slice(i, script.indexOf(';\n', script.indexOf('escapeHtml(p.valor', i)));
        ok(corpo.indexOf('p.coluna') === -1,
            'o nome da coluna NAO aparece na celula -- ele fica no title e no relatorio', corpo);
        ok(corpo.indexOf('p.doBanco') > 0, 'mas o valor do banco continua em destaque');
    })();

    (function asColunasDeContagemNaoQuebram() {
        // Numero quebrado em duas linhas nao se le, e era a quebra delas que
        // empurrava as ultimas colunas para fora.
        ok(/const NUM = 'text-align:center; white-space:nowrap;'/.test(script),
            'as quatro colunas de contagem nao quebram');
        ok(/overflow-x:auto/.test(script.slice(script.indexOf('const NUM ='))),
            'e a tabela rola na horizontal quando ainda assim nao couber');
    })();
})();

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
