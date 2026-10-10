// Navegador real, todos os HTTP interceptados; nenhum agente ou driver real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');

(async () => {
    const browser = await puppeteer.launch({headless: true});
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'newprod-exp-test-'));
    const pdf = path.join(folder, 'sintetico.pdf');
    fs.writeFileSync(pdf, '%PDF-1.4\n% Sintetico: backend simulado neste teste de UI.');
    let count = 0;
    try {
        for (const scenario of ['experimental_gdi', 'gdi_atual', 'pdf_raw', 'raw-no-caps', 'unsupported', 'lost-response']) {
            const mode = scenario === 'raw-no-caps' ? 'pdf_raw' : ['gdi_atual', 'pdf_raw'].includes(scenario) ? scenario : 'experimental_gdi';
            const page = await browser.newPage();
            await page.evaluateOnNewDocument(() => sessionStorage.setItem('newprod_acesso_local', JSON.stringify({token: 'sessao-sintetica'})));
            const submissions = [];
            const errors = [];
            page.on('pageerror', error => errors.push(error.message));
            await page.setRequestInterception(true);
            page.on('request', async request => {
                const url = new URL(request.url());
                if (url.pathname.startsWith('/api/')) assert.equal(request.headers()['x-newprod-sessao'], 'sessao-sintetica');
                const reply = (data, status = 200) => request.respond({status, contentType: 'application/json', body: JSON.stringify(data)});
                if (url.pathname.endsWith('/impressao-experimental.html')) {
                    return request.respond({status: 200, contentType: 'text/html', body: fs.readFileSync(path.join(root, 'frontend/impressao-experimental.html'), 'utf8')});
                }
                if (url.pathname.endsWith('/impressao-experimental.js')) {
                    return request.respond({status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(root, 'frontend/impressao-experimental.js'), 'utf8')});
                }
                if (url.pathname === '/api/print/experimental/capabilities') {
                    return scenario === 'unsupported' ? reply({}, 404) : reply({schema: 2, modos: ['gdi_atual', 'experimental_gdi', 'pdf_raw']});
                }
                if (url.pathname === '/api/printers') return reply({printers: ['Sintetica']});
                if (url.pathname === '/api/printers/Sintetica/capabilities') return scenario === 'raw-no-caps' ? reply({}, 500) : reply({
                    papers: [{id: 9, name: 'A4'}], trays: [{id: 7, name: 'Bandeja teste'}], defaults: {paper_size: 9, tray: 7, duplex: 2, color: 2}
                });
                if (url.pathname === '/api/print/experimental/submit') {
                    const payload = await request.fetchPostData();
                    const selected = JSON.parse(payload.split('name="options"\r\n\r\n')[1].split('\r\n--')[0]);
                    submissions.push(selected);
                    assert.equal(selected.modo, mode);
                    if (mode === 'pdf_raw') {
                        assert.equal(selected.raw_confirmado, true);
                        for (const key of ['paper_size', 'tray', 'duplex', 'color', 'orientation', 'dpi']) assert.equal(key in selected, false);
                    }
                    if (scenario === 'lost-response') return request.abort('connectionfailed');
                    return reply({modo: mode, raw_bytes: 8000, spool_id: 42, paginas: 2, dpi: mode === 'gdi_atual' ? 1200 : 600, driver_dpi: [1200,1200], pdf_bytes: 8000, raster_rgb_bytes: 4000000, render_seconds: .1, envio_seconds: .2});
                }
                if (url.pathname.startsWith('/api/')) errors.push('API inesperada: ' + url.pathname);
                return request.abort();
            });
            await page.goto('http://127.0.0.1:9000/app/impressao-experimental.html');
            if (scenario === 'unsupported') {
                await page.waitForFunction(() => document.getElementById('exp-status').textContent.includes('HTTP 404'));
                assert.equal(await page.$eval('#exp-fields', el => el.disabled), true);
                assert.equal(submissions.length, 0);
            } else {
                await page.waitForFunction(() => !document.getElementById('exp-fields').disabled);
                assert.equal(submissions.length, 0, 'abrir pagina nao imprime');
                await page.select('#exp-mode', mode);
                await page.select('#exp-printer', 'Sintetica');
                await page.waitForFunction(() => !document.getElementById('exp-send').disabled);
                await (await page.$('#exp-file')).uploadFile(pdf);
                // Sem aceite, o formulario nao pode enviar nada.
                await page.click('#exp-send');
                assert.equal(submissions.length, 0);
                await page.click('#exp-confirm');
                if (mode === 'pdf_raw') {
                    await page.click('#exp-send');
                    assert.equal(submissions.length, 0, 'RAW requer suporte PDF e preset confirmados');
                    assert.equal(await page.$eval('#exp-tray', el => el.disabled), true);
                    await page.click('#exp-raw');
                }
                await page.click('#exp-send');
                await page.waitForFunction(() => !document.getElementById('exp-new').hidden);
                assert.equal(submissions.length, 1);
                assert.equal(await page.$eval('#exp-fields', el => el.disabled), true);
                assert.equal(await page.$eval('#exp-confirm', el => el.checked), false);
                const text = await page.$eval('#exp-status', el => el.textContent);
                assert(text.includes(scenario === 'lost-response' ? 'Nenhum reenvio automático' : 'não comprova impressão física'));
                await page.click('#exp-new');
                assert.equal(submissions.length, 1, 'preparar outro teste nao envia');
                assert.equal(await page.$eval('#exp-confirm', el => el.checked), false);
                assert.equal(await page.$eval('#exp-raw', el => el.checked), false);
            }
            assert.deepEqual(errors, []);
            // Conferir o link nos DOIS HTML reais, sem executar seus scripts de producao.
            for (const name of ['index.html', 'producao.html']) {
                const html = fs.readFileSync(path.join(root, 'frontend', name), 'utf8');
                assert(await page.evaluate(source => {
                    const doc = new DOMParser().parseFromString(source, 'text/html');
                    const link = doc.querySelector('#modal-print-direct a[href="impressao-experimental.html"]');
                    return !!link && !link.hasAttribute('target');
                }, html));
            }
            count++;
            await page.close();
        }
        console.log(`${count} cenarios de navegador aprovados; nenhuma API normal ou remota acionada.`);
    } finally {
        await browser.close();
        fs.unlinkSync(pdf);
        fs.rmdirSync(folder);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
