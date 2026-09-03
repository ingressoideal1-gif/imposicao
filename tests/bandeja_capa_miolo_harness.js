// A bandeja dupla (capa/miolo) some da tela de Pedido, 03/09/2026.
//
// O usuario relatou: "em layouts anteriores ao carregar o drive da impressora
// habilitava a opcao de escolha de 2 ou mais bandejas... analisar pq perdemos
// as bandejas". A causa nao era o dado: `formatos.has_cover` continuava certo.
// Era A HORA em que a pergunta era feita.
//
// `enviarParaPedido` (pedido.js) dispara `initPedPrintPanel()` SEM esperar, e
// so DEPOIS aguarda `enviarParaImposicao()`, que e' quem de fato poe o valor
// certo em `#ped-formato`. `initPedPrintPanel` faz duas idas a rede antes de
// chegar em `onPedPrinterChange`, que e' onde a bandeja dupla era decidida —
// e por isso, na maioria das vezes, ele perguntava pelo formato ANTES de
// `enviarParaImposicao` responder, lendo o formato do MODELO ANTERIOR (ou
// nenhum). A bandeja dupla so aparecia quando a rede estava lenta o bastante
// para a corrida virar a favor do lado certo.
//
// Este arquivo executa a funcao de verdade (`atualizarBandejaCapaMiolo`, em
// script.js) e o `applyPedFormatoDefaults` de verdade (pedido.js) contra um
// DOM fake, e prova que o segundo corrige a corrida sozinho: e' ele quem o
// `enviarParaImposicao` aciona, via `dispatchEvent('change')` em
// `#ped-formato`, no exato momento em que o formato do modelo aberto fica
// definitivo.
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
const NL = String.fromCharCode(10);

let total = 0, falhas = 0;
function ok(cond, msg, extra) {
    total++;
    if (!cond) {
        falhas++;
        console.log('  FALHOU: ' + msg + (extra !== undefined ? '  [' + JSON.stringify(extra) + ']' : ''));
    }
}

// -- Um DOM minusculo: so o que estas duas funcoes tocam --------------------
function elementoFalso(tag) {
    return { tagName: tag || 'DIV', style: {}, value: '', options: [],
        addEventListener() {}, dispatchEvent() { return true; } };
}

function montarDom() {
    const elementos = {
        'ped-formato': elementoFalso('SELECT'),
        'ped-tray-single': elementoFalso('DIV'),
        'ped-tray-dual': elementoFalso('DIV'),
        'ped-schema': elementoFalso('SELECT'),
        'ped-saida': elementoFalso('SELECT'),
        'ped-cutstack-mode': elementoFalso('SELECT'),
        'ped-sheets-per-block': elementoFalso('INPUT'),
        'ped-block-depth': elementoFalso('INPUT'),
        'ped-rotate-page': elementoFalso('SELECT'),
    };
    const documento = {
        getElementById: id => elementos[id] || null,
    };
    return { documento, elementos };
}

// -- Extrai `atualizarBandejaCapaMiolo` de script.js, executando de verdade --
function extrairAtualizarBandeja() {
    const NEEDLE = NL + 'function atualizarBandejaCapaMiolo() {';
    const i = SCRIPT.indexOf(NEEDLE);
    if (i < 0) throw new Error('nao achei atualizarBandejaCapaMiolo no script.js');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf(NL + '}', i) + 2);
    return corpo;
}
const CORPO_ATUALIZAR_BANDEJA = extrairAtualizarBandeja();

function montarAtualizarBandeja(documento, state) {
    return new Function('document', 'state', CORPO_ATUALIZAR_BANDEJA + NL + 'return atualizarBandejaCapaMiolo;')(documento, state);
}

// -- Extrai `applyPedFormatoDefaults` de pedido.js, executando de verdade ----
function extrairApplyPedFormatoDefaults() {
    const i = PEDIDO.indexOf('function applyPedFormatoDefaults() {');
    if (i < 0) throw new Error('nao achei applyPedFormatoDefaults no pedido.js');
    const corpo = PEDIDO.slice(i, PEDIDO.indexOf(NL + '}' + NL + 'window.applyPedFormatoDefaults', i) + 2);
    return corpo;
}
const CORPO_APPLY_DEFAULTS = extrairApplyPedFormatoDefaults();

function montarApplyPedFormatoDefaults(documento, state, atualizarBandejaCapaMiolo) {
    // rotacaoDaFolhaDoFormato e' de outro incidente (a Montagem, 03/09/2026);
    // aqui basta um coto que nao derruba a funcao.
    const rotacaoDaFolhaDoFormato = () => 0;
    return new Function(
        'document', 'state', 'atualizarBandejaCapaMiolo', 'rotacaoDaFolhaDoFormato',
        CORPO_APPLY_DEFAULTS + NL + 'return applyPedFormatoDefaults;'
    )(documento, state, atualizarBandejaCapaMiolo, rotacaoDaFolhaDoFormato);
}

// -- 1. atualizarBandejaCapaMiolo, isolada -----------------------------------

(function comHasCoverAparecemDuasBandejas() {
    const { documento, elementos } = montarDom();
    elementos['ped-formato'].value = 'f1';
    const state = { formatos: [{ id: 'f1', has_cover: true }] };
    const f = montarAtualizarBandeja(documento, state);

    const hasCover = f();
    ok(hasCover === true, 'devolve true para o formato com has_cover');
    ok(elementos['ped-tray-single'].style.display === 'none', 'a bandeja simples some');
    ok(elementos['ped-tray-dual'].style.display === 'block', 'as duas bandejas aparecem');
})();

(function semHasCoverSoUmaBandeja() {
    const { documento, elementos } = montarDom();
    elementos['ped-formato'].value = 'f1';
    const state = { formatos: [{ id: 'f1', has_cover: false }] };
    const f = montarAtualizarBandeja(documento, state);

    ok(f() === false, 'devolve false sem has_cover');
    ok(elementos['ped-tray-single'].style.display === 'block', 'a bandeja simples aparece');
    ok(elementos['ped-tray-dual'].style.display === 'none', 'as duas bandejas somem');
})();

(function semFormatoSelecionadoNaoQuebra() {
    const { documento } = montarDom();
    const state = { formatos: [] };
    const f = montarAtualizarBandeja(documento, state);
    ok(f() === false, 'sem formato nenhum, devolve false e nao lanca');
})();

// -- 2. applyPedFormatoDefaults chama a funcao com o formato JA resolvido ----
//
// Isto e' o proprio conserto da corrida: e' este dispatchEvent('change') que
// o enviarParaImposicao dispara em #ped-formato, e e' aqui que a pergunta e'
// refeita com o valor DEFINITIVO.

(function trocarDeFormatoAtualizaABandejaNaHora() {
    const { documento, elementos } = montarDom();
    elementos['ped-formato'].value = 'capa1';
    const state = { formatos: [
        { id: 'miolo1', has_cover: false },
        { id: 'capa1', has_cover: true },
    ] };

    let chamouComHasCover = null;
    const atualizarBandejaCapaMiolo = () => { chamouComHasCover = true; return true; };
    const applyPedFormatoDefaults = montarApplyPedFormatoDefaults(documento, state, atualizarBandejaCapaMiolo);

    applyPedFormatoDefaults();
    ok(chamouComHasCover === true,
       'applyPedFormatoDefaults chama atualizarBandejaCapaMiolo -- e e\' isto que conserta a corrida com initPedPrintPanel');
})();

(function integradoDeVerdadeSemFormatoFalsoDaCorrida() {
    // As duas funcoes de verdade, uma chamando a outra, sem stub no meio --
    // simulando exatamente o dispatchEvent('change') que o enviarParaImposicao
    // da em #ped-formato depois de escolher o formato do modelo.
    const { documento, elementos } = montarDom();
    // O painel de impressao "ganhou a corrida" e leu o formato ERRADO antes:
    elementos['ped-tray-single'].style.display = 'block';
    elementos['ped-tray-dual'].style.display = 'none';

    // Agora o enviarParaImposicao poe o formato CERTO (com capa) e dispara o change:
    elementos['ped-formato'].value = 'capa1';
    const state = { formatos: [{ id: 'capa1', has_cover: true }] };
    const atualizarBandejaCapaMiolo = montarAtualizarBandeja(documento, state);
    const applyPedFormatoDefaults = montarApplyPedFormatoDefaults(documento, state, atualizarBandejaCapaMiolo);

    applyPedFormatoDefaults();

    ok(elementos['ped-tray-dual'].style.display === 'block',
       'depois do change do formato certo, as duas bandejas aparecem -- a corrida nao decide mais');
    ok(elementos['ped-tray-single'].style.display === 'none', 'e a bandeja simples some');
})();

// -- 3. Os tres pontos de chamada continuam ligados --------------------------

(function osTresLugaresChamamAFuncao() {
    ok(/window\.atualizarBandejaCapaMiolo = atualizarBandejaCapaMiolo;/.test(SCRIPT),
       'a funcao continua exportada para o pedido.js poder chama-la');

    const dentroDoOnPedPrinterChange = SCRIPT.slice(
        SCRIPT.indexOf('async function onPedPrinterChange('),
        SCRIPT.indexOf('\n}', SCRIPT.indexOf('async function onPedPrinterChange(')));
    ok(/atualizarBandejaCapaMiolo\(\)/.test(dentroDoOnPedPrinterChange),
       'onPedPrinterChange continua chamando a funcao ao trocar de impressora');
    ok(!/const hasCover = fmtObj\?\.has_cover/.test(dentroDoOnPedPrinterChange),
       'e nao voltou a ter a conta duplicada ali dentro');

    ok(/atualizarBandejaCapaMiolo\(\);\s*\}\s*\nwindow\.applyPedFormatoDefaults/.test(PEDIDO),
       'applyPedFormatoDefaults chama a funcao no fim, antes de exportar');

    const iEnviar = PEDIDO.indexOf('await enviarParaImposicao(item.id, osId, false);');
    ok(iEnviar > 0, 'achei o await enviarParaImposicao dentro de enviarParaPedido');
    const depois = PEDIDO.slice(iEnviar, iEnviar + 900);
    ok(/atualizarBandejaCapaMiolo\(\)/.test(depois),
       'e logo depois desse await, enviarParaPedido reforca a chamada');
})();

if (falhas) {
    console.log('FALHOU: ' + falhas + ' de ' + total + ' verificacoes.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes da bandeja capa/miolo passaram.');
