// Nenhuma numeração é desenhada com o banco de OUTRA.
//
// Roda em node, sem navegador: `node tests/banco_de_amostra_harness.js`.
// Sai com código 1 se algum caso falhar.
//
// Por que isto existe: na proposta 2320 (24/08/2026) o operador escolheu a
// numeração de uma proposta anterior, mandou editá-la para criar a exclusiva do
// modelo novo, e excluiu o banco de dados e o link da planilha para carregar um
// banco menor. O banco e o link saíram do registro — está no Supabase —, mas o
// canvas do editor continuou pintando os nomes do banco ANTERIOR.
//
// A causa: `state.csvData` é a fatia da numeração que o operador estava olhando
// no pedido, e ela tinha PRIORIDADE sobre o banco da numeração aberta no editor.
// Excluir o banco desta não adiantava — a fonte que o canvas lia era a da outra.
//
// É a mesma regra que `linhasDaAmostra()` já aplica ao card do modelo desde
// 22/08/2026 (o caso "Expointer 2026"). As janelas de desenho nunca a receberam.

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

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const script = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

// ─── A regra ──────────────────────────────────────────────────────────────────

(function aRegra() {
    const fonte = ['bancoDeAmostra', 'linhaDeAmostra']
        .map(n => extrairFuncao(script, n)).join('\n');

    const state = {};
    const api = new Function('state', 'window',
        fonte + '\nreturn { bancoDeAmostra, linhaDeAmostra };')(state, {});

    const daAnterior = [{ nome: 'MARIA DA SILVA', cargo: 'DIRETORA', __id: 1 }];
    const daAberta = [{ nome: 'JOAO NOVO', cargo: 'ESTAGIARIO', __id: 1 }];
    const solto = [{ Fila: 'A', Numero: '22' }];

    // O caso da proposta 2320: o operador excluiu o banco da numeração aberta,
    // e o que sobrou em state.csvData é a fatia da numeração ANTERIOR.
    state.csvData = daAnterior;
    state.csvDataDerivado = true;
    state.numCsvData = null;

    ok(api.bancoDeAmostra() === null,
        'banco excluído: a fatia da numeração anterior NÃO é emprestada',
        api.bancoDeAmostra());
    ok(api.linhaDeAmostra() === null,
        'banco excluído: não há linha de amostra para pintar',
        api.linhaDeAmostra());

    // O arquivo solto que o operador subiu na caixa da Imposição continua
    // servindo à amostra avulsa — ele não é fatia de numeração nenhuma.
    state.csvData = solto;
    state.csvDataDerivado = false;
    ok(api.bancoDeAmostra() === solto,
        'o CSV solto da Imposição continua servindo de amostra');

    // Com banco próprio carregado, é ele que vale — mesmo com outro em csvData.
    state.csvData = daAnterior;
    state.csvDataDerivado = true;
    state.numCsvData = daAberta;
    ok(api.bancoDeAmostra() === daAberta,
        'o banco da numeração ABERTA vence o que estiver em csvData');
    ok(api.linhaDeAmostra().nome === 'JOAO NOVO',
        'a linha de amostra é a do banco da numeração aberta',
        api.linhaDeAmostra());

    // Quem sabe qual numeração está desenhando manda: nem o editor a atropela.
    const outra = { id: 'n-9', csv_data: [{ nome: 'ANA TERCEIRA' }] };
    ok(api.bancoDeAmostra(outra) === outra.csv_data,
        'desenhar uma numeração conhecida usa o banco DELA');
    ok(api.linhaDeAmostra(outra).nome === 'ANA TERCEIRA',
        'a linha de amostra de uma numeração conhecida é a dela');

    // Numeração sem banco, com fatia derivada de outra pendurada no state:
    // continua sem nada — não se pega emprestado.
    const semBanco = { id: 'n-8', csv_data: null };
    state.numCsvData = null;
    ok(api.bancoDeAmostra(semBanco) === null,
        'numeração sem banco não pega emprestada a fatia da vizinha',
        api.bancoDeAmostra(semBanco));
})();

// ─── Nenhuma janela de desenho pode ler csvData por fora da regra ─────────────
//
// A regra só vale se todo mundo passar por ela. O `state.csvData ||
// state.numCsvData` era exatamente a linha que pintava o banco da numeração
// anterior; se alguém a reintroduzir, o bug volta em silêncio.

(function ninguemPulaARegra() {
    const sobras = script.split('\n')
        .map((l, i) => ({ n: i + 1, l }))
        .filter(x => /state\.csvData\s*\|\|\s*state\.numCsvData/.test(x.l)
                  || /state\.numCsvData\s*\|\|\s*state\.csvData/.test(x.l));
    ok(sobras.length === 0,
        'nenhuma janela lê `state.csvData || state.numCsvData` direto — todas passam por bancoDeAmostra()',
        sobras.map(x => x.n + ': ' + x.l.trim()));
})();

// ─── O gabarito de produção desenha com o banco da numeração dele ─────────────

(function gabaritoUsaOBancoDaNumeracao() {
    const i = script.indexOf('async function criarCanvasNumeracaoRasterizada(');
    ok(i > 0, 'achei criarCanvasNumeracaoRasterizada no script.js');
    const trecho = script.slice(i, i + 20000);
    const nus = (trecho.match(/linhaDeAmostra\(\s*\)/g) || []).length;
    ok(nus === 0,
        'o gabarito rasterizado passa a numeração para linhaDeAmostra(num) — '
        + 'ele desenha uma vez e vai para a produção, não pode herdar banco alheio',
        nus);
})();

// ─── Fim ──────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' caso(s) falharam.');
    process.exit(1);
}
console.log(total + ' caso(s) passaram.');
