const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'frontend/montagem.js'), 'utf8').replace(/\r/g, '');
const html = fs.readFileSync(path.join(root, 'frontend/index.html'), 'utf8');
function extract(name) {
    const start = code.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return code.slice(start, code.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        const page = await browser.newPage();
        const start = html.indexOf('<select id="mtg-formato"');
        assert(start >= 0);
        await page.setContent(html.slice(start, html.indexOf('</select>', start) + 9) + '<select id="mtg-pedido"></select>');
        await page.evaluate(() => {
            window.state = {montagem: {celulas: [], modelos: []}, formatos: [{id:'F1',name:'Ingresso'}], ordens:[], osItens:{}, modelosGlobais:{}};
            window.loadOrdens = () => new Promise(() => {});
            window.escapeHtml = String;
            window.onMontagemPedidoChange = async () => {};
            window.onMontagemPosicoesChange = () => {};
            window.renderMontagem = () => {};
        });
        await page.addScriptTag({content: ['pedidoEmProducaoNaMontagem','produtoDoModeloNaMontagem','formatoDoModeloNaMontagem','modelosDoPedidoNaMontagem','modeloDisponivelNaMontagem','pedidoDisponivelNaMontagem','pedidosParaMontagem','encherFormatosDaMontagem','encherPedidosDaMontagem','onMontagemFormatoChange','abrirMontagem'].map(extract).join('\n')});
        await page.evaluate(() => { abrirMontagem(); });
        assert.equal(await page.$eval('#mtg-formato', el => el.disabled), false);
        await page.click('#mtg-formato');
        await page.keyboard.press('Escape');
        await page.select('#mtg-formato', 'F1');
        assert.equal(await page.evaluate(() => state.montagem.formatoSel), 'F1');
        console.log('OK: seletor real aceita formato enquanto consulta de pedidos permanece pendente.');
    } finally { await browser.close(); }
})().catch(e => {console.error(e); process.exitCode=1;});
