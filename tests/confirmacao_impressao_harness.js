// Popup real no navegador; persistencia simulada, sem rede ou impressora.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless: true});
    try {
        const page = await browser.newPage();
        await page.setOfflineMode(true);
        await page.setContent('<html><body></body></html>');
        await page.evaluate(() => {
            window.state = {osItens: {os: [{id:'1', modelo:'Pulseira <sintética>'}]}};
            window.writes = [];
            window.toast = () => {};
            window.updateItemImpressao = async (...args) => {writes.push(args); return true;};
        });
        await page.addScriptTag({content: ['escHtmlSimples','confirmarPopup','confirmarImpressaoModelos'].map(extract).join('\n')});
        for (const origem of ['pdf', 'print']) for (const confirmar of [false, true]) {
            await page.evaluate(origem => {
                writes.length = 0;
                window.resultado = confirmarImpressaoModelos([{itemId:'1',osId:'os'}], {origem});
            }, origem);
            await page.waitForSelector('[role="dialog"]', {visible:true});
            assert.equal(await page.$eval('[role="dialog"]', el => el.checkVisibility()), true);
            assert.equal(await page.evaluate(() => writes.length), 0, 'abrir nao grava');
            const texto = await page.$eval('[role="dialog"]', el => el.innerText);
            assert(texto.includes('Pulseira <sintética>'));
            assert.equal(texto.includes('PDF gerado'), origem === 'pdf');
            await page.click(confirmar ? '[data-role="ok"]' : '[data-role="cancel"]');
            assert.equal(await page.evaluate(() => resultado), confirmar);
            assert.deepEqual(await page.evaluate(() => writes), confirmar ? [['1','os','IMPRESSO']] : []);
            assert.equal(await page.$('[role="dialog"]'), null);
        }
        console.log('OK: popup visivel apos PDF/envio; Sim grava e Ainda nao preserva status.');
    } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
