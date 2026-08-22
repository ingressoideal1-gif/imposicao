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

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
