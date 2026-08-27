// A TELA DA ENTREGA POR BLOCO (27/08/2026).
//
// Duas coisas que so existem no frontend e que o teste em Python nao alcanca:
//
//   1. O aviso de cancelamento. Desde a entrega por bloco, cancelar NAO desfaz
//      o que ja saiu -- cada lote foi para o hotfolder ou para a impressora
//      assim que ficou pronto, e papel entregue nao volta. Um aviso que diz so
//      "cancelado" deixa o operador sem saber se conferir a bandeja.
//
//   2. A leitura da escolha salva no modelo. A coluna `entregar_por_bloco`
//      aceita NULO, e nulo significa "ninguem escolheu neste modelo" -- vale o
//      padrao da tela, que hoje e marcado. Ler com `!!` transformaria o nulo em
//      desmarcado e desligaria o recurso em todo modelo que nunca foi tocado.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

// ─── 1. O texto do cancelamento ────────────────────────────────────────────

const texto = (function () {
    const i = SCRIPT.indexOf('function textoDoCancelamento()');
    if (i < 0) throw new Error('nao achei textoDoCancelamento no script.js');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
    return new Function('window', corpo + '\nreturn textoDoCancelamento;');
})();

(function semEntregaOAvisoEOdeSempre() {
    for (const estado of [null, undefined, {}, { folhas: 0 }]) {
        const t = texto({ _entregaEmCurso: estado })();
        ok(/cancelada imediatamente/.test(t),
           'sem lote entregue, o aviso continua o de sempre', t);
        ok(!/JÁ FORAM ENTREGUES/.test(t), 'e nao inventa papel entregue', t);
    }
})();

(function comEntregaOAvisoDizOnumero() {
    const t = texto({ _entregaEmCurso: {
        folhas: 150, total: 1400, lotes: 3, ultimo: 'front_stage_05_lote003.pdf' } })();
    ok(/150/.test(t), 'diz quantas folhas ja sairam', t);
    ok(/1\.400/.test(t), 'e de quantas -- o numero em portugues, com ponto de milhar', t);
    ok(/3 lotes/.test(t), 'diz em quantos lotes', t);
    ok(/lote003\.pdf/.test(t), 'e qual foi o ultimo, que e por onde o operador retoma', t);
    ok(/JÁ FORAM ENTREGUES/.test(t),
       'e deixa claro que aquilo NAO foi desfeito -- papel entregue nao volta', t);
})();

(function umLoteSoNaoVIRAlotes() {
    const t = texto({ _entregaEmCurso: { folhas: 50, total: 1400, lotes: 1, ultimo: 'a.pdf' } })();
    ok(/1 lote\b/.test(t) && !/1 lotes/.test(t), 'um lote so nao vira "1 lotes"', t);
})();

(function semTotalOavisoAindaFunciona() {
    const t = texto({ _entregaEmCurso: { folhas: 50, lotes: 1, ultimo: 'a.pdf' } })();
    ok(/50/.test(t) && !/ de $/.test(t), 'sem o total, o aviso nao fica pela metade', t);
})();

// ─── 2. O nulo da coluna vale o padrao da tela ─────────────────────────────

(function nuloNaColunaNaoDesligaOrecurso() {
    const i = PEDIDO.indexOf("const cxEntrega = document.getElementById('ped-entregar-por-bloco')");
    ok(i > 0, 'a tela le a escolha salva ao abrir o modelo');
    const trecho = PEDIDO.slice(i, i + 260);
    ok(/item\.entregar_por_bloco !== false/.test(trecho),
       'a leitura e `!== false`: NULO significa "ninguem escolheu" e vale o padrao marcado. '
       + 'Um `!!` desligaria o recurso em todo modelo nunca tocado', trecho);

    // A regra, executada.
    const decidir = new Function('item', 'return (item.entregar_por_bloco !== false);');
    ok(decidir({}) === true, 'modelo que nunca foi tocado nasce marcado');
    ok(decidir({ entregar_por_bloco: null }) === true, 'nulo da coluna tambem');
    ok(decidir({ entregar_por_bloco: false }) === false, 'quem desmarcou continua desmarcado');
    ok(decidir({ entregar_por_bloco: true }) === true, 'e quem marcou, marcado');
})();

(function mexerNaCaixaGravaNoModelo() {
    ok(/window\.onPedEntregarPorBlocoToggle/.test(PEDIDO),
       'existe o handler que grava a escolha');
    const i = PEDIDO.indexOf('window.onPedEntregarPorBlocoToggle');
    const corpo = PEDIDO.slice(i, PEDIDO.indexOf('\n};', i));
    ok(/autoSaveOSItemField\([^)]*'entregar_por_bloco'/.test(corpo),
       'e ele grava na coluna do modelo, nao so na sessao', corpo.slice(-200));

    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    const j = html.indexOf('id="ped-entregar-por-bloco"');
    const tag = html.slice(j, html.indexOf('>', j));
    ok(/onchange="onPedEntregarPorBlocoToggle\(this\.checked\)"/.test(tag),
       'e a caixa chama o handler', tag);
})();

// ─── Fecho ────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes da tela da entrega por bloco passaram.');
