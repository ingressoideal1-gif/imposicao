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

// ─── O codigo real, recortado de onde ele mora ──────────────────────────────
//
// Em 20/08/2026 o mapa saiu de dentro da funcao de desenho do `script.js` para
// `frontend/logo-do-frete.js`, porque a aba de Entrega do Portal do Pedido
// passou a mostrar as mesmas logos. Este harness continua rodando o codigo de
// producao -- so mudou o arquivo de onde ele e recortado.

const LOGO = fs.readFileSync(path.join(RAIZ, 'frontend', 'logo-do-frete.js'), 'utf8');

function recortar(fonte, nome) {
    const k = fonte.indexOf('\nfunction ' + nome + '(');
    if (k < 0) throw new Error('nao achei a funcao ' + nome + ' -- o harness precisa ser reapontado');
    return fonte.slice(k, fonte.indexOf('\n}', k) + 2);
}

function extrairTabela(fonte, nome) {
    const k = fonte.indexOf('\nconst ' + nome + ' = ');
    if (k < 0) throw new Error('nao achei a tabela ' + nome);
    let p = 0;
    for (let m = fonte.indexOf('=', k); m < fonte.length; m++) {
        const c = fonte[m];
        if (c === '[' || c === '{') p++;
        else if (c === ']' || c === '}') p--;
        else if (c === ';' && p === 0) return fonte.slice(k, m + 1);
    }
    throw new Error('nao achei o fim da tabela ' + nome);
}

// `escapeHtml` de mentira: aqui interessa QUAL imagem foi escolhida, nao como o
// painel escapa aspas -- essa parte tem teste proprio.
const passar = s => String(s === undefined || s === null ? '' : s);

const MOTOR = extrairTabela(LOGO, 'LOGO_DO_FRETE') + '\n'
    // `normalizarFrete` entra junto porque o `logoDoFrete` o chama desde
    // 03/09/2026 -- e o que faz `EXPRESSO SAO MIGUEL S/A`, sem til, achar a
    // chave `SAO MIGUEL`.
    + recortar(LOGO, 'normalizarFrete') + '\n'
    + recortar(LOGO, 'logoDoFrete') + '\n'
    + recortar(LOGO, 'logoDoFreteHtml');

const decidirFrete = new Function('valor', 'escapeHtml',
    MOTOR + "\nconst freteRaw = (valor || '').trim() || 'Retirada Local';"
    + '\nreturn { freteRaw, freteImgUrl: logoDoFrete(freteRaw), freteHtml: logoDoFreteHtml(freteRaw) };');

function frete(valor) {
    return decidirFrete(valor, passar);
}

// O painel continua chamando a funcao compartilhada, com o mesmo padrao de
// "sem frete escrito vale Retirada Local".
(function oPainelContinuaLigadoNestaFuncao() {
    ok(/const freteRaw = \(os\.frete_escolhido \|\| ''\)\.trim\(\) \|\| 'Retirada Local';/.test(SCRIPT),
        'o painel ainda decide o nome do frete do mesmo jeito');
    ok(/logoDoFreteHtml\(freteRaw\)/.test(SCRIPT), 'e pede a logo a funcao compartilhada');
    ok(SCRIPT.indexOf('FRETE_IMGS') < 0, 'sem copia do mapa sobrando no painel');
})();

// ─── O endereco que o usuario mandou usar ────────────────────────────────────

const VEPPO = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/app-imagens/1785678294009_Veppo.png';

(function oVeppoUsaExatamenteOEnderecoPedido() {
    ok(LOGO.indexOf(VEPPO) > 0, 'o endereco da marca do Veppo esta no logo-do-frete.js');

    // Um caractere trocado devolve 400 do Storage e a coluna cai no texto: o
    // `onerror` da <img> esconde a figura e mostra o nome. Passaria despercebido.
    const quantas = ((LOGO + SCRIPT).match(/1785678294009_Veppo\.png/g) || []).length;
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

// A contagem foi remedida no banco em 03/09/2026, e o arquivo da Sao Miguel
// mudou nesse dia: o anterior (`1785678293565_Sao-Miguel.png`) tinha saido do
// bucket e respondia 400 -- a coluna vinha mostrando o texto de reserva no lugar
// da imagem, sem ninguem notar, porque a tela nao quebra quando isso acontece.
[
    ['SEDEX', '1785678293785_Sedex.png', 588],
    ['Transportadora São Miguel', '1788452516270_Sao-Miguel.png', 17],
    ['SÃO MIGUEL', '1788452516270_Sao-Miguel.png', 12],
    ['EXPRESSO SAO MIGUEL S/A', '1788452516270_Sao-Miguel.png', 3],
    ['BRASPRESS', '1788452527708_Braspress.png', 3],
    ['Braspress', '1788452527708_Braspress.png', 2],
    ['Motoboy', '1785678293109_Motoboy.png', 53],
    ['MOTOBOY', '1785678293109_Motoboy.png', 29],
    ['RETIRADA', '1785678293377_Retira.png', 105],
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
