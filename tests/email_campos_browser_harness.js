// Regressao com DOM/teclado reais, sem rede ou credenciais.
const fs = require('fs');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extrair(nome) {
    const inicio = source.indexOf('function ' + nome + '(');
    return source.slice(inicio, source.indexOf('\n}', inicio) + 2);
}
(async () => {
    const browser = await puppeteer.launch({headless:true});
    try {
        const page = await browser.newPage();
        const erros = [];
        page.on('pageerror', e => erros.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => req.abort());
        await page.setContent('<!doctype html><body></body>');
        await page.addScriptTag({content: extrair('ensureModalEmailElement')});
        await page.evaluate(() => {
            ensureModalEmailElement().style.display = 'flex';
            document.getElementById('modal-email-subject').value = 'Aprovação — Pedido #11';
        });
        await page.type('#modal-email-to', 'primeiro@example.com');
        await page.click('#modal-email-to');
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyA');
        await page.keyboard.up('Control');
        await page.type('#modal-email-to', 'segundo@example.com');
        assert.equal(await page.$eval('#modal-email-subject', e => e.value), 'Aprovação — Pedido #11');
        await page.click('#modal-email-subject');
        await page.keyboard.press('End');
        await page.type('#modal-email-subject', '\nRevisão final');
        assert.equal(await page.$eval('#modal-email-to', e => e.value), 'segundo@example.com');
        assert.doesNotMatch(await page.$eval('#modal-email-subject', e => e.value), /[\r\n]/);
        assert.equal(await page.$eval('#modal-email-subject', e => e.autocomplete), 'off');
        assert.deepEqual(erros, []);
        console.log('OK: destinatario e assunto independentes; assunto editavel sem quebras de cabecalho');
    } finally { await browser.close(); }
})().catch(e => {console.error(e);process.exitCode=1;});
