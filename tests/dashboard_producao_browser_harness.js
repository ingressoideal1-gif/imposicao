const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => request.abort());
        for (const arquivo of ['index.html', 'producao.html']) {
            const html = fs.readFileSync(path.join(__dirname, '../frontend', arquivo), 'utf8');
            const inicio = html.indexOf('<section id="view-lista-impressao"');
            const trecho = html.slice(inicio, html.indexOf('</section>', inicio) + 10).replace(/class="view-section[^\"]*"/, 'class="view-section prod-panel-section active"');
            await page.setContent(`<html><body>${trecho}</body></html>`);
            // Fontes remotas não participam da verificação offline de layout.
            await page.addStyleTag({ content: fs.readFileSync(path.join(__dirname, '../frontend/style.css'), 'utf8').replace(/@import[^;]+;/g, '') });
            await page.evaluate(() => {
                const dia = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
                window.state = { ordens: [{ id: 'a', numero: 1, prazo_entrega: dia }], modelosGlobais: { 1: [{ id: 1, id_produto: 7, quantidade: 2000, impressao: 'Impresso' }] }, produtosGlobais: [{ id_produto: 7, nome_produto: '<img src=x onerror=alert(1)>' }] };
                window.pedidoIgnoradoNosPaineis = () => false;
                window.pedidoNaGrafica = () => true;
                window.normalizarStatusImpressao = s => s;
            });
            await page.addScriptTag({ content: fs.readFileSync(path.join(__dirname, '../frontend/dashboard-arte.js'), 'utf8').split('// DASHBOARD_PRODUCAO_INICIO')[1] });
            await page.evaluate(() => renderDashboardProducao());
            for (const width of [1366, 390]) {
                await page.setViewport({ width, height: 768 });
                assert(await page.$eval('#dashboard-producao', e => e.checkVisibility()));
                assert(await page.$eval('#dp-hoje', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.height > 0; }));
                await page.click('#dp-hoje');
            }
            assert.equal(await page.$$eval('#dp-resultado img', e => e.length), 0);
            assert((await page.$eval('#dp-resultado', e => e.textContent)).includes('2.000'));
            await page.$eval('#dp-inicio', e => { e.value = '2099-01-01'; e.dispatchEvent(new Event('change')); });
            assert((await page.$eval('#dp-resultado', e => e.textContent)).includes('período válido'));
            await page.click('#dp-hoje');
            assert((await page.$eval('#dp-resultado', e => e.textContent)).includes('2.000'));
        }
        console.log('Browser: ambas as páginas, desktop/celular, calendário, Hoje e escape HTML OK.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
