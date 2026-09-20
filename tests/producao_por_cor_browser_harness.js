'use strict';
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
const code = fs.readFileSync(path.join(root, 'frontend/producao-por-cor.js'), 'utf8');
const pedido = fs.readFileSync(path.join(root, 'frontend/pedido.js'), 'utf8').replace(/\r\n/g, '\n');
const extract = name => {
    const start = pedido.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    return pedido.slice(start, pedido.indexOf('\n}', start) + 2);
};
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const tab = await browser.newPage();
        const errors = [];
        tab.on('pageerror', error => errors.push(error.message));
        await tab.setRequestInterception(true);
        tab.on('request', request => request.abort());
        const section = html.slice(html.indexOf('<section id="view-producao-cor"'), html.indexOf('<!-- VIEW: PEDIDO'));
        await tab.setContent(`<html><body>${section}<div id="ped-preview-home">
          <div id="ped-preview-card-container"><canvas id="ped-preview-canvas" width="20" height="20"></canvas>
          <input id="ped-print-copies" value="7"></div></div></body></html>`);
        await tab.evaluate(() => {
            window.state = { ordens: [{ id: 'vibe_1', numero: 1 }], osItens: {}, cores: [{ id: 5, name: 'Azul' }],
                numeracoes: [{ id: 6 }], selectedOSItems: [{ itemId: 999, osId: 'vibe_1' }] };
            window.loadOrdens = async () => true;
            window.pedidoNaGrafica = () => true;
            window.pedidoJaPassouDaGrafica = () => false;
            window.supabaseClient = { from(table) { return { select() { return this; }, in() { return this; }, order() { return this; },
                range(offset) { return Promise.resolve({ data: offset ? [] : table === 'pedidos_modelos'
                    ? [11, 12].map(id => ({ id, id_int: 1, id_produto_proposta_origem: 99, nome_modelo: `Modelo ${id}`, status_impressao: 'Aguardando', amostra_cor_id: 5 }))
                    : [{ id: 99, id_int: 1, id_produto: 9, nome_produto: 'Produto A' }] }); } }; } };
            window.loadOSItens = async () => { state.osItens.vibe_1 = [11, 12].map(id => ({ id, _dbLoaded: true, status_impressao: 'Aguardando' })); };
            window.getOSItens = id => state.osItens[id] || [];
            window.enviarParaPedido = async (itemId, osId) => {
                state.activeOSItem = { itemId, osId }; window.moverJanelaParaModelo(itemId);
            };
            window.updateItemImpressao = async (itemId, osId, status) => {
                state.osItens[osId].find(item => String(item.id) === String(itemId)).status_impressao = status;
                window.dispatchEvent(new CustomEvent('pedidos-modelo-status-impressao', { detail: { itemId, osId, status } }));
                return true;
            };
            const preview = document.getElementById('ped-preview-card-container');
            window.originalPreview = preview;
            const canvas = document.getElementById('ped-preview-canvas');
            canvas.getContext('2d').fillRect(0, 0, 20, 20);
        });
        await tab.addScriptTag({ content: ['janelaDeVisualizacao', 'recolherJanelaParaCasa', 'moverJanelaParaModelo', 'pintarLinhaAberta', 'fecharJanelaDoModelo'].map(extract).join('\n') });
        await tab.addScriptTag({ content: code });
        await tab.evaluate(() => ProducaoPorCorPainel.abrir());
        assert.equal(await tab.$eval('#ppc-product-select', el => el.value), '');
        await tab.select('#ppc-product-select', 'id:9');
        await tab.click('[data-color-key="id:5"]');
        assert.equal(await tab.$$eval('.ppc-model-row', rows => rows.length), 2);
        await tab.click('.ppc-model-row[data-item-id="11"]');
        await tab.waitForSelector('.ppc-window-host #ped-preview-card-container');
        assert.equal(await tab.evaluate(() => document.getElementById('ped-preview-card-container') === originalPreview), true);
        assert.equal(await tab.$eval('#ped-print-copies', el => el.value), '7');
        await tab.click('.ppc-model-row[data-item-id="12"]');
        await tab.waitForSelector('.ppc-window-host[data-item-id="12"] #ped-preview-card-container');
        await tab.select('[data-status-item="12"]', 'Impresso');
        await tab.waitForFunction(() => !document.querySelector('.ppc-model-row[data-item-id="12"]'));
        assert.equal(await tab.evaluate(() => state.activeOSItem), null);
        assert.equal(await tab.evaluate(() => originalPreview.parentElement.id), 'ped-preview-home');
        assert.equal(await tab.$eval('#ped-print-copies', el => el.value), '7');
        await tab.evaluate(() => ProducaoPorCorPainel.sair());
        assert.equal(await tab.evaluate(() => state.selectedOSItems[0].itemId), 999);
        await tab.evaluate(() => ProducaoPorCorPainel.abrir());
        assert.equal(await tab.$eval('#ppc-product-select', el => el.value), '');
        assert.equal(await tab.evaluate(() => document.getElementById('ped-preview-card-container') === originalPreview), true);
        assert.deepEqual(errors, []);
        console.log('OK: navegador offline — filtros, janela real, troca de modelo, status, saída e reentrada.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
