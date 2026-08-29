// Quanto custa varrer o banco de uma numeracao, com os tamanhos REAIS do
// pedido 21202 (150 a 14.000 linhas, colunas __id/Arquivo/Codigo/Data/
// Origem/"Seq. no arquivo"). Roda as funcoes de verdade, lidas do script.js.
//
// Rodar da raiz do projeto:  node .\ferramentas\medir_varredura_csv.mjs
//
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// A raiz sai da posicao deste arquivo, para o script funcionar em qualquer maquina.
const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = fs.readFileSync(RAIZ + '/frontend/script.js', 'utf8');
const P = fs.readFileSync(RAIZ + '/frontend/pedido.js', 'utf8');

function extrair(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei ' + nome);
    return src.slice(i, src.indexOf('\n}', i) + 2);
}

const NOMES = ['linhasAtivasCsv', 'colunasDoBancoDaNumeracao', 'linhasComDadoDaNumeracao',
               'numeracaoIdDoItem', 'fatiaCsvDoItem'];
const api = new Function('window', 'state',
    NOMES.map(n => extrair(S, n)).join('\n') + '\nreturn {' + NOMES.join(',') + '};'
)({ CsvEditor: null }, { numeracoes: [] });

// Um banco como os deste pedido.
function banco(n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
        rows.push({
            __id: 'r' + i,
            'Arquivo': 'STAFF RECINTO 12.csv',
            'Codigo': 'ID' + String(100000 + i),
            'Data': '11/set',
            'Origem': 'lote-3',
            'Seq. no arquivo': String(i + 1),
        });
    }
    return rows;
}

// A numeracao le duas colunas do banco (o caso normal: um codigo e um texto).
function numeracao(rows) {
    return {
        id: 'n1',
        csv_data: rows,
        elements: [
            { source: 'database', csv_column: 'Codigo' },
            { source: 'database', csv_column: 'Seq. no arquivo' },
        ],
    };
}

const item = { id: 'm1', amostra_num_id: 'n1' };

console.log('\n  UMA VARREDURA DO BANCO (fatiaCsvDoItem)');
console.log('  linhas no banco     tempo      por clique (x8)');
for (const n of [150, 700, 1920, 3500, 12806, 14000]) {
    const num = numeracao(banco(n));
    // aquecimento
    for (let i = 0; i < 3; i++) api.fatiaCsvDoItem(item, num);
    const t = [];
    for (let r = 0; r < 9; r++) {
        const a = process.hrtime.bigint();
        api.fatiaCsvDoItem(item, num);
        t.push(Number(process.hrtime.bigint() - a) / 1e6);
    }
    t.sort((x, y) => x - y);
    const ms = t[4];
    console.log('  ' + String(n).padStart(11) + String(ms.toFixed(2) + ' ms').padStart(12)
        + String((ms * 8).toFixed(1) + ' ms').padStart(18));
}

// E o pedido INTEIRO: 51 modelos, cada um com o seu banco.
const doPedido = [150, 700, 1920, 3500, 12806, 14000, 3000, 2800, 200, 400, 1500,
                  150, 3500, 1920, 150, 3000, 2800, 12000, 200, 700, 1500, 200, 400,
                  150, 3500, 1920, 150, 3000, 2800, 14000, 200, 700, 1500, 200, 400,
                  150, 3500, 1920, 150, 3000, 2800, 14000, 200, 700, 1500, 200, 400,
                  150, 800, 800, 2000];
const nums = doPedido.map((n, i) => Object.assign(numeracao(banco(n)), { id: 'n' + i }));
const itens = doPedido.map((n, i) => ({ id: 'm' + i, amostra_num_id: 'n' + i }));

for (let i = 0; i < 3; i++) itens.forEach((it, k) => api.fatiaCsvDoItem(it, nums[k]));
const a = process.hrtime.bigint();
itens.forEach((it, k) => api.fatiaCsvDoItem(it, nums[k]));
const total = Number(process.hrtime.bigint() - a) / 1e6;
console.log('\n  VARRER OS 51 MODELOS DE UMA VEZ: ' + total.toFixed(1) + ' ms');
console.log('  (soma dos bancos: ' + doPedido.reduce((s, x) => s + x, 0).toLocaleString('pt-BR') + ' linhas)\n');
