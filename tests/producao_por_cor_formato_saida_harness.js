'use strict';
// Paridade real de abertura: render da fila, Pedido e Imposição; sem rede.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'frontend', name), 'utf8').replace(/\r\n/g, '\n');
const pedido = read('pedido.js'), main = read('script.js');
function extract(source, name) {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    assert(match, name);
    return source.slice(match.index, source.indexOf('\n}', match.index) + 2);
}
const queueFunctions = ['renderPedOSQueue', 'contaDoProduto', 'resolverCorDoModelo', 'modeloEhCamarote',
    'textoLegivelSobre', 'coresDoFormato', 'numeracoesDoFormato', 'modeloEstaLiberado', 'travaDaGerencia', 'portaDoSeletor'];
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        for (const savedFormat of [null, 'f2']) for (const savedOutput of [null, 's1']) {
            const results = [];
            for (const external of [false, true]) {
                const tab = await browser.newPage();
                const errors = [];
                tab.on('pageerror', error => errors.push(error.message));
                await tab.setRequestInterception(true);
                tab.on('request', request => request.abort());
                await tab.setContent(`<div id="ped-os-queue"><div id="ped-os-queue-body"></div></div>
                    ${['ped', 'imp'].map(prefix => `<select id="${prefix}-formato"><option value="">Selecione</option><option value="f1">Formato 1</option><option value="f2">Formato 2</option></select>
                    <select id="${prefix}-saida"><option value="">Selecione</option><option value="s1">Saída 1</option><option value="s2">Saída 2</option></select>`).join('')}`);
                await tab.evaluate(({ external, savedOutput, savedFormat }) => {
                    window.state = {
                        osItens: { 'vibe_1': [{ id: 11, _vibe_id_produto: 9, id_produto: 9, produto: 'Modelo',
                            status_impressao: 'Aguardando', formato_id: savedFormat, saida_id: savedOutput, quantidade: 100,
                            num_inicial: 1, num_final: 100, bloco: 50, verso_tipo: 'Frente' }] },
                        produtosGlobais: [{ id_produto: 9, nomeReal: 'Produto', id_formato: 77 }],
                        formatos: [{ id: 'f1', id_formato_num: 77, name: 'Formato 1', default_saida_id: 's1' },
                            { id: 'f2', id_formato_num: 88, name: 'Formato 2', default_saida_id: 's2' }],
                        saidas: [{ id: 's2' }, { id: 's1' }], cores: [], numeracoes: [], selectedOSItems: [],
                    };
                    window.calls = [];
                    window.getOSItens = id => state.osItens[id] || [];
                    window.showView = () => { renderPedOSQueue(); };
                    window.PedidoJanelaExterna = { manterViewAtual: () => external };
                    window.autoSaveOSItemField = (...args) => calls.push(args);
                    window.recarregarNumeracoesDoPedido = async () => {};
                    window.filtroDeCorDaFila = () => ({});
                    window.escHtmlSimples = value => String(value ?? '');
                    window.globalNormStr = value => String(value || '').trim().toLowerCase();
                    window.globalFuzzyMatch = () => false;
                    window.modoDeVersoDoModelo = () => 'single';
                    for (const name of ['recolherJanelaParaCasa', 'moverJanelaParaModelo', 'aplicarFiltrosDaFila',
                        'updatePedImprimirButtonsVisibility', 'atualizarBarraDeSoma', 'atualizarIndicadorModeloComVerso',
                        'pintarLinhaAberta', 'limparPreviaEnquantoCarrega', 'populatePedNumeracoes', 'updateImpSummary',
                        'renderImpOSQueue', 'updatePedSummary', 'aplicarTravaModoPdf',
                        'guardarPdfDoVersoDaPrevia', 'guardarPdfDoVersoDaImposicao']) window[name] = () => {};
                    window.STATUS_CORRIGIR_ARTE = 'Corrigir Arte';
                    window.toast = message => { throw new Error(message); };
                }, { external, savedOutput, savedFormat });
                await tab.addScriptTag({ content: queueFunctions.map(name => extract(pedido, name)).join('\n')
                    + '\n' + extract(main, 'normalizarStatusImpressao')
                    + '\n' + ['prepararFormatosDaFila', 'formatoDoProduto', 'formatoDoModelo',
                        'enviarParaImposicao', 'carregarModeloParaImposicao'].map(name => extract(main, name)).join('\n')
                    + '\n' + ['enviarParaPedido', 'carregarModeloParaPedido'].map(name => extract(pedido, name)).join('\n') });
                const result = await tab.evaluate(async external => {
                    await enviarParaPedido(11, 'vibe_1', external ? { aindaAtual: () => true } : {});
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    const first = { formato: document.getElementById('ped-formato').value,
                        saida: document.getElementById('ped-saida').value,
                        modeloFormato: state.osItens.vibe_1[0].formato_id,
                        modeloSaida: state.osItens.vibe_1[0].saida_id };
                    // Outro modelo/produto deve substituir os controles anteriores.
                    state.produtosGlobais.push({ id_produto: 10, nomeReal: 'Outro produto', id_formato: 88 });
                    state.osItens.vibe_1.push({ ...state.osItens.vibe_1[0], id: 12, _vibe_id_produto: 10,
                        id_produto: 10, formato_id: null, saida_id: null });
                    await enviarParaPedido(12, 'vibe_1', external ? { aindaAtual: () => true } : {});
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    return { ...first, next: { formato: document.getElementById('ped-formato').value,
                        saida: document.getElementById('ped-saida').value } };
                }, external);
                assert.deepEqual(errors, []);
                results.push(result);
                await tab.close();
            }
            const expectedFormat = savedFormat || 'f1';
            const expectedOutput = savedOutput || (expectedFormat === 'f2' ? 's2' : 's1');
            assert.deepEqual(results[0], { formato: expectedFormat, saida: expectedOutput, modeloFormato: expectedFormat, modeloSaida: expectedOutput, next: { formato: 'f2', saida: 's2' } });
            assert.deepEqual(results[1], results[0], 'Produção por Cor deve resolver formato ERP e saída como o Painel de Produção');
        }
        console.log('OK: mesma preparação de formato ERP e saída padrão/persistida nas duas aberturas.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
