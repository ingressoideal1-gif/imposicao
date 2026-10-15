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
            const inicio = html.indexOf('<section id="view-dashboard-producao"');
            const trecho = html.slice(inicio, html.indexOf('</section>', inicio) + 10);
            const fila = html.slice(html.indexOf('<section id="view-lista-impressao"'));
            assert(!fila.slice(0, fila.indexOf('</section>')).includes('id="dashboard-producao"'));
            const menu = html.match(/<button class="nav-btn" data-view="view-dashboard-producao"[\s\S]*?<\/button>/)[0];
            await page.setContent(`<html><body>${menu}<section id="view-lista-impressao" class="view-section active"></section>${trecho}</body></html>`);
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
            const fonte = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
            const extrair = nome => {
                const i = fonte.indexOf(`function ${nome}(`);
                return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
            };
            const mostrarInicio = fonte.indexOf('window.showView = function(viewId)');
            const mostrar = fonte.slice(mostrarInicio, fonte.indexOf('\n};', mostrarInicio) + 3);
            const mapa = fonte.match(/const PERM_VIEW_MAP = \{[\s\S]*?\n\};/)[0];
            assert.match(fonte, /perm_producao_view:\s*\['nav-lista-impressao', 'nav-dashboard-producao'/);
            await page.addScriptTag({ content: `(function(){
                ${mapa}
                const VIEW_PERM_REQUERIDA = {};
                for (const [perm, views] of Object.entries(PERM_VIEW_MAP)) for (const view of views) VIEW_PERM_REQUERIDA[view] = perm;
                ${extrair('podeAbrirView')}
                function avisarFaltaPermissao() { window.negado = true; }
                function ativarBotaoDoMenu(viewId) { document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === viewId)); }
                ${extrair('renderOrdens')}
                ${extrair('recorteDaCargaDeOrdens')}
                ${extrair('mostrarEstadoCargaLista')}
                window.renderOrdens = renderOrdens;
                window.loadOrdens = function() { window.recorteTeste = recorteDaCargaDeOrdens(); window.cargas = (window.cargas || 0) + 1; mostrarEstadoCargaLista('Carregando pedidos…'); };
                ${mostrar}
                document.getElementById('nav-dashboard-producao').onclick = () => showView('view-dashboard-producao');
            })();` });
            await page.evaluate(() => { window.negado = false; window.cargas = 0; window._currentPerms = { perm_producao_view: false }; });
            await page.click('#nav-dashboard-producao');
            assert(await page.evaluate(() => window.negado === true && !window.cargas));
            assert(!await page.$eval('#dashboard-producao', e => e.checkVisibility()));
            await page.evaluate(() => { window._currentPerms.perm_producao_view = true; });
            await page.click('#nav-dashboard-producao');
            assert.equal(await page.evaluate(() => window.recorteTeste), 'completo');
            assert(await page.$eval('#dashboard-producao-estado-carga', e => e.checkVisibility()));
            assert(await page.$eval('#nav-dashboard-producao', e => e.classList.contains('active')));
            await page.evaluate(() => {
                state.ordensDashboardProducao = state.ordens.map(os => ({ ...os, status_interno: 'EXPEDICAO' }));
                state.ordens = [];
                renderOrdens();
            });
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
