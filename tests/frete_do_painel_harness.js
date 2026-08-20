// A logomarca do frete no Painel de Producao.
//
// A coluna "Frete" mostra a marca da transportadora em vez do texto cru. O nome
// vem do parceiro, escrito a mao no campo `propostas.frete_escolhido`, e por
// isso chega em varias grafias -- foi assim que o Veppo apareceu no banco:
// VEPPO, veppo, Veppo e VEPPO-RS, nos 27 pedidos que o citam.
//
// Este harness NAO copia a regra: ele recorta do script.js o trecho que decide
// a imagem e roda esse mesmo trecho. Se alguem mexer no mapa ou na busca
// parcial, e o codigo de producao que responde aqui.
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

// ─── O trecho real, recortado do script.js ───────────────────────────────────

const INICIO = "const freteRaw = (os.frete_escolhido || '').trim() || 'Retirada Local';";
const FIM = 'font-size:0.75rem;">${escapeHtml(freteRaw)}</span>`;';

const i = SCRIPT.indexOf(INICIO);
if (i < 0) throw new Error('o trecho do frete mudou de forma -- o harness precisa ser reapontado');
const j = SCRIPT.indexOf(FIM, i);
if (j < 0) throw new Error('nao achei o fim do trecho do frete no script.js');

const TRECHO = SCRIPT.slice(i, j + FIM.length);

// `escapeHtml` de mentira: aqui interessa QUAL imagem foi escolhida, nao como o
// painel escapa aspas -- essa parte tem teste proprio.
const decidirFrete = new Function('os', 'escapeHtml',
    TRECHO + '\nreturn { freteRaw, freteImgUrl, freteHtml };');
const passar = s => String(s === undefined || s === null ? '' : s);

function frete(valor) {
    return decidirFrete({ frete_escolhido: valor }, passar);
}

// ─── O endereco que o usuario mandou usar ────────────────────────────────────

const VEPPO = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678294009_Veppo.png';

(function oVeppoUsaExatamenteOEnderecoPedido() {
    ok(SCRIPT.indexOf(VEPPO) > 0, 'o endereco da marca do Veppo esta no script.js');

    // Um caractere trocado devolve 400 do Storage e a coluna cai no texto: o
    // `onerror` da <img> esconde a figura e mostra o nome. Passaria despercebido.
    const quantas = (SCRIPT.match(/1785678294009_Veppo\.png/g) || []).length;
    ok(quantas === 1, 'e aparece uma vez so, sem copia para divergir', quantas);
})();

// ─── As quatro grafias que existem no banco ──────────────────────────────────
//
// Levantadas no banco de producao em 19/08/2026, nos 27 pedidos cujo
// `frete_escolhido` cita o Veppo. `VEPPO-RS` e a grafia antiga, dos pedidos
// 13824 a 17537; `VEPPO` e a de hoje, do 19008 ao 20951.

['VEPPO', 'veppo', 'Veppo', 'VEPPO-RS', 'vEpPo'].forEach(grafia => {
    const r = frete(grafia);
    ok(r.freteImgUrl === VEPPO, 'a grafia ' + JSON.stringify(grafia) + ' mostra a marca do Veppo', r.freteImgUrl);
    ok(r.freteHtml.indexOf('<img') === 0, 'e sai como imagem, nao como texto', r.freteHtml.slice(0, 60));

    // O `alt` e o `title` guardam o que o parceiro escreveu: e o que aparece se
    // a figura nao carregar, e o que o operador le ao passar o mouse.
    ok(r.freteHtml.indexOf('alt="' + grafia + '"') > 0,
        'preservando a grafia original no alt', r.freteHtml.slice(0, 120));
});

// ─── O Veppo nao roubou os outros fretes ─────────────────────────────────────
//
// A busca parcial casa por pedaco de texto, entao chave nova pode sequestrar
// frete alheio. Estes sao os valores reais do banco, com a contagem de hoje.

[
    ['SEDEX', '1785678293785_Sedex.png', 53],
    ['Transportadora São Miguel', '1785678293565_Sao-Miguel.png', 1],
    ['SÃO MIGUEL', '1785678293565_Sao-Miguel.png', 1],
    ['Motoboy', '1785678293109_Motoboy.png', 6],
    ['MOTOBOY', '1785678293109_Motoboy.png', 2],
    ['RETIRADA', '1785678293377_Retira.png', 13],
].forEach(([valor, arquivo, quantos]) => {
    const r = frete(valor);
    ok(String(r.freteImgUrl).indexOf(arquivo) > 0,
        'o frete ' + JSON.stringify(valor) + ' (' + quantos + ' pedido(s)) continua na marca dele',
        r.freteImgUrl);
    ok(r.freteImgUrl !== VEPPO, 'e nao foi parar no Veppo');
});

// ─── Quem nao tem marca continua saindo como texto ───────────────────────────

// `RETIRA BALCÃO` esta nesta lista de proposito, e nao entre os que tem marca:
// ele NAO casa com nenhuma chave de retirada hoje ("RETIRA " com espaco nao esta
// contido em "RETIRADA"), entao sai escrito. E assim que o painel se comporta
// desde antes do Veppo; anotado aqui para a mudanca aparecer no dia em que
// alguem resolver cobri-lo.
['AZUL EXPRESSO', 'Frete Incluso', 'Sem custo', 'A definir', 'RETIRA BALCÃO'].forEach(valor => {
    const r = frete(valor);
    ok(!r.freteImgUrl, 'o frete ' + JSON.stringify(valor) + ' nao inventa marca', r.freteImgUrl);
    ok(r.freteHtml.indexOf('<span class="badge"') === 0 && r.freteHtml.indexOf(valor) > 0,
        'e aparece escrito por extenso', r.freteHtml.slice(0, 80));
});

// ─── Pedido sem frete nenhum ─────────────────────────────────────────────────
//
// 814 das 1000 propostas lidas tinham o campo nulo: e o caso comum, nao a borda.

[null, undefined, '', '   '].forEach(valor => {
    const r = frete(valor);
    ok(r.freteRaw === 'Retirada Local', 'sem frete escrito, vale Retirada Local', JSON.stringify(r.freteRaw));
    ok(String(r.freteImgUrl).indexOf('1785678293377_Retira.png') > 0,
        'com a marca da retirada', r.freteImgUrl);
});

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
