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

(function selecaoNulaLevaOBancoInteiro() {
    const rows = caderno(10);
    ok(CsvEditor.fatiaDoModelo(rows, null).length === 10,
        'sem seleção, o modelo leva o banco inteiro (pedidos anteriores à v525)');
    ok(CsvEditor.fatiaDoModelo(rows, { tipo: 'linhas', ids: [] }).length === 10,
        'seleção vazia também leva o banco inteiro');
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
})();

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
