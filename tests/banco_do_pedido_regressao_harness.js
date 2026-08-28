// Congela o comportamento de HOJE dos modelos que não têm banco próprio.
//
// Existe por causa da ordem do usuário em 27/08/2026: as numerações em uso não
// podem sofrer alteração nenhuma quando o caminho novo (banco do pedido) entrar.
// Este harness é o que quebra o build se alguém encostar no ramo antigo.
//
// A comparação que carrega a garantia é a do primeiro caso, e ela é por
// IDENTIDADE (`===`), não por conteúdo. Ver o comentário lá embaixo.
//
// Roda em node: `node tests/banco_do_pedido_regressao_harness.js`.

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

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

function sandboxDoScript(state, nomes, devolve) {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const fonte = nomes.map(n => extrairFuncao(script, n)).join('\n');
    return new Function('state', 'window', fonte + '\nreturn { ' + devolve + ' };')(state, global.window);
}

/** Uma numeração à moda antiga: o banco mora dentro dela. */
function numeracaoAntiga() {
    return {
        id: 'num-1',
        csv_headers: ['NOME', 'CODIGO'],
        csv_data: [
            { __id: 1, NOME: 'ANA',   CODIGO: 'A01' },
            { __id: 2, NOME: 'BRUNO', CODIGO: 'A02' },
            { __id: 3, NOME: 'CARLA', CODIGO: 'A03' }
        ],
        elements: [
            { id: 'el_1', type: 'TEXT', source: 'database', csv_column: 'NOME' },
            { id: 'el_2', type: 'QR',   source: 'database', csv_column: 'CODIGO' }
        ]
    };
}

// ── 1. A garantia mecânica: mesma referência, sem cópia ──────────────────────

(function modeloAntigoRecebeAMesmaNumeracao() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['numeracaoIdDoItem', 'numeracaoDoModelo'], 'numeracaoDoModelo');
    const num = numeracaoAntiga();
    state.numeracoes.push(num);

    const item = { id: 'm-1', amostra_num_id: 'num-1' };

    // `===` e não deepEqual: uma cópia com o mesmo conteúdo já seria uma mudança
    // de comportamento — quem guardava a referência para escrever nela (o
    // `garantirCsvDaNumeracao` faz isso) passaria a escrever no lugar errado, e
    // o trabalho sairia com número sequencial no lugar do nome da pessoa.
    ok(api.numeracaoDoModelo(item) === num,
        'modelo sem banco proprio recebe a MESMA numeracao, sem copia');
})();

// ── 2. A fatia de linhas não muda ────────────────────────────────────────────

(function fatiaDeHojeContinuaIgual() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['linhasAtivasCsv', 'numeracaoIdDoItem', 'colunasDoBancoDaNumeracao',
         'linhasComDadoDaNumeracao', 'fatiaCsvDoItem'], 'fatiaCsvDoItem');
    const num = numeracaoAntiga();
    state.numeracoes.push(num);

    const inteiro = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num);
    ok(inteiro.length === 3, 'sem distribuicao, o modelo leva o banco inteiro', inteiro.length);
    ok(inteiro.every((r, i) => r.__id === i + 1), 'e na ordem do banco');

    const num2 = numeracaoAntiga();
    num2.csv_data[1].__ativo = false;
    state.numeracoes.length = 0; state.numeracoes.push(num2);
    const semDesmarcada = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num2);
    ok(semDesmarcada.length === 2, 'linha desmarcada continua fora', semDesmarcada.length);

    const num3 = numeracaoAntiga();
    num3.csv_data[2].NOME = ''; num3.csv_data[2].CODIGO = '';
    state.numeracoes.length = 0; state.numeracoes.push(num3);
    const semVazia = api.fatiaCsvDoItem({ id: 'm', amostra_num_id: 'num-1', csv_selecao: null }, num3);
    ok(semVazia.length === 2, 'linha sem nada nas colunas lidas continua fora', semVazia.length);
})();

// ── 3. As colunas conferidas saem as mesmas ──────────────────────────────────

(function colunasConferidasNaoMudam() {
    const state = { numeracoes: [] };
    const api = sandboxDoScript(state,
        ['colunasConferidasDaNumeracao'], 'colunasConferidasDaNumeracao');
    const num = numeracaoAntiga();
    const cols = api.colunasConferidasDaNumeracao(num);
    ok(cols.length === 2 && cols[0] === 'NOME' && cols[1] === 'CODIGO',
        'a numeracao antiga confere as duas colunas dela', cols);
})();

// ── 4. As duas telas continuam com a mesma regra ─────────────────────────────

(function aGemeaTemODesvioTambem() {
    const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
    const pedido = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
    const marca = 'banco_id';
    ok(script.includes(marca) === pedido.includes(marca),
        'script.js e pedido.js estao na MESMA versao da regra do banco do pedido',
        { script: script.includes(marca), pedido: pedido.includes(marca) });
})();

console.log((falhas ? 'FALHAS: ' + falhas + ' de ' : 'OK: ') + total + ' casos');
process.exit(falhas ? 1 : 0);
