// A regra "este pedido esta na grafica?", executada de verdade.
//
// Ela nasceu em 03/09/2026, com o pedido 21594 na mao do usuario: a expedicao
// do ERP devolveu o pedido com a acao Retorno, o `status_interno` virou
// EM ACABAMENTO, e o pedido sumiu dos dois paineis. Nenhum defeito nosso: os
// filtros de tela sempre aceitaram so EM PRODUCAO e EM IMPRESSAO, e EM
// ACABAMENTO estava apenas na porta de entrada (`SINAIS_SAIU_DA_ARTE`). O
// pedido entrava na memoria e nenhuma lista o desenhava.
//
// Decisao do usuario: "tratar" -- EM ACABAMENTO e trabalho da grafica.
//
// Este arquivo LE a regra e o filtro da Fila de Producao do `script.js`, e nao
// uma copia: uma copia continuaria passando depois de o original mudar. E
// executa os dois, porque um teste que so procura a palavra no texto nao pega
// uma comparacao escrita errada.
//
// Roda com: node tests/na_grafica_harness.js
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const NL = String.fromCharCode(10);

function trecho(inicio, fim) {
    const i = SCRIPT.indexOf(inicio);
    if (i < 0) throw new Error('nao achei no script.js: ' + inicio);
    const j = SCRIPT.indexOf(fim, i);
    if (j < 0) throw new Error('nao achei o fim de: ' + inicio);
    return SCRIPT.slice(i, j + fim.length);
}

const LISTA_NA = trecho('const SINAIS_NA_GRAFICA = [', '];');
const FN_NA = trecho(NL + 'function pedidoNaGrafica(', NL + '}');
const LISTA_DEPOIS = trecho('const SINAIS_DEPOIS_DA_GRAFICA = [', '];');
const FN_DEPOIS = trecho(NL + 'function pedidoJaPassouDaGrafica(', NL + '}');
// O filtro da Fila 1 do Painel de Producao, como esta dentro do renderOrdens.
const FILTRO = trecho('let ordensImpressao = state.ordens.filter(', NL + '    });');

const regras = new Function(
    LISTA_NA + NL + FN_NA + NL + LISTA_DEPOIS + NL + FN_DEPOIS + NL
    + 'return { pedidoNaGrafica, pedidoJaPassouDaGrafica, SINAIS_NA_GRAFICA, SINAIS_DEPOIS_DA_GRAFICA };'
)();

const filaDeProducao = new Function('state',
    LISTA_NA + NL + FN_NA + NL + LISTA_DEPOIS + NL + FN_DEPOIS + NL
    + FILTRO + NL + 'return ordensImpressao;'
);

let total = 0, falhas = 0;
function ok(cond, msg, extra) {
    total++;
    if (!cond) {
        falhas++;
        console.log('  FALHOU: ' + msg + (extra ? '  [' + extra + ']' : ''));
    }
}

// -- 1. A regra --------------------------------------------------------------
(function osTresEstagiosDaGraficaEntram() {
    const f = regras.pedidoNaGrafica;
    ['EM PRODUCAO', 'EM PRODUÇÃO', 'EM IMPRESSAO', 'EM IMPRESSÃO', 'EM ACABAMENTO'].forEach(st => {
        ok(f({ status_interno: st }) === true, st + ' esta na grafica');
    });
    ok(f({ status_interno: 'em acabamento' }) === true, 'a comparacao ignora a caixa');
    ok(f({ status_interno: '  EM ACABAMENTO  ' }) === true, 'e o espaco em volta');
})();

(function oQueNaoEChaoDeFabricaFicaFora() {
    const f = regras.pedidoNaGrafica;
    // Antes da grafica: estagios comerciais e de arte.
    ['NOVO', 'AGUARDANDO', 'APROVADO', 'LIBERADO', 'REVISAO ATENDENTE', 'REVISAO PRODUCAO', 'CANCELADO']
        .forEach(st => ok(f({ status_interno: st }) === false, st + ' nao e chao de fabrica'));
    // Depois da grafica: a regra de 27/08/2026.
    ['EXPEDICAO', 'EM TRANSITO', 'ENTREGUE', 'A RETIRAR', 'RETIRADO']
        .forEach(st => ok(f({ status_interno: st }) === false, st + ' ja passou (ou esta fora) da grafica'));
    ok(f({}) === false, 'pedido sem status nao esta na grafica');
    ok(f(null) === false, 'sem pedido, false');
    ok(f({ status_interno: null, status_pedido: 'EM_IMPRESSAO' }) === false,
       'status_pedido nao conta: e campo morto no ERP');
})();

(function asDuasListasNaoSeCruzam() {
    const na = regras.SINAIS_NA_GRAFICA.map(s => s.toUpperCase());
    const depois = regras.SINAIS_DEPOIS_DA_GRAFICA.map(s => s.toUpperCase());
    const cruzam = na.filter(s => depois.includes(s));
    ok(cruzam.length === 0, 'nenhum status esta "na grafica" e "depois da grafica" ao mesmo tempo', cruzam.join(','));
})();

// -- 2. A Fila de Producao, com o filtro de verdade --------------------------
(function aFilaDeProducaoListaODevolvido() {
    const state = { ordens: [
        { numero: 1, status_interno: 'EM PRODUCAO' },
        { numero: 2, status_interno: 'EM IMPRESSAO' },
        { numero: 21594, status_interno: 'EM ACABAMENTO' },   // o devolvido pela expedicao
        { numero: 4, status_interno: 'EXPEDICAO' },
        { numero: 5, status_interno: 'EM TRANSITO' },
        { numero: 6, status_interno: 'ENTREGUE' },
        { numero: 7, status_interno: 'LIBERADO' },
        { numero: 8, status_interno: 'REVISAO PRODUCAO' },
        { numero: 9, status_interno: null },
    ] };
    const fila = filaDeProducao(state).map(os => os.numero);
    ok(fila.includes(21594), 'o pedido EM ACABAMENTO esta na Fila de Producao', fila.join(','));
    ok(fila.includes(1) && fila.includes(2), 'EM PRODUCAO e EM IMPRESSAO continuam la');
    ok(fila.length === 3, 'e mais ninguem: ' + fila.join(','));
})();

if (falhas) {
    console.log('FALHOU: ' + falhas + ' de ' + total + ' verificacoes.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes da regra "na grafica" passaram.');
