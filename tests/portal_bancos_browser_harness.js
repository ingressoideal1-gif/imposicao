// Chromium: composição real e cliques reais; Supabase e recursos sintéticos.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        let fotoDisponivel = false;
        await page.setRequestInterception(true);
        page.on('request', r => {
            if (r.url() === 'https://sintetico.test/foto.svg' && fotoDisponivel) {
                return r.respond({ status: 200, contentType: 'image/svg+xml', headers: { 'Access-Control-Allow-Origin': '*' },
                    body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="#0000ff"/></svg>' });
            }
            return /^(data:|about:)/.test(r.url()) ? r.continue() : r.abort();
        });
        await page.setViewport({ width: 1100, height: 900 });
        await page.setContent('<html><body><div id="toast-container"></div><div class="cliente-page"><div class="cliente-container"><div id="cliente-amostras-itens-container"></div></div></div></body></html>');
        for (const name of ['style.css', 'cliente-modelo.css']) {
            // Fontes externas não participam deste teste isolado (usa Arial).
            const css = fs.readFileSync(path.join(root, 'frontend', name), 'utf8').replace(/^@import[^\r\n]*$/gm, '');
            await page.addStyleTag({ content: css });
        }
        for (const name of ['banco-do-modelo.js', 'cliente-bancos.js', 'cliente-dados.js',
            'numero-da-pagina.js', 'fonte-canvas.js', 'texto-ajuste.js', 'foto-lib.js', 'cliente.js']) {
            await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend', name), 'utf8') });
        }
        await page.evaluate(async () => {
            const svg = color => 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="240"><rect width="400" height="240" fill="' + color + '"/></svg>');
            const rows = Array.from({ length: 6 }, (_, i) => ({ __id: i + 1,
                nome: 'PESSOA_' + (i + 1), setor: i < 4 ? 'SETOR_' + (i + 1) : '', foto: 'imagem',
                __fotos: { foto: { url: svg(i === 0 ? '#ff0000' : i === 5 ? '#0000ff' : '#00ff00'), cx: 0.5, cy: 0.5, zoom: 1 } } }));
            const bank = { id: 'b1', csv_headers: ['nome', 'setor', 'foto'], csv_data: rows };
            window.__response = { versao: 1, numero_pedido: '123', modelos: [
                { modelo_id: '501', banco: bank, csv_mapa: { 'el:t': 'nome', 'el:f': 'foto' } },
                { modelo_id: '502', banco: bank, csv_mapa: { 'el:t': 'setor' } }
            ] };
            window.__writes = [];
            window.supabaseClient = {
                rpc: async name => {
                    if (name !== 'link_cliente_bancos_modelos') throw Error('RPC inesperada');
                    return window.__fail ? { error: { message: 'rede simulada' } } : { data: window.__response };
                },
                from: name => { window.__writes.push(name); throw Error('Escrita inesperada'); }
            };
            const text = { id: 't', type: 'TEXT', source: 'database', x_mm: 50, y_mm: 30,
                font_size: 12, font_name: 'system:Arial', color: '#000000', face: 'front' };
            const foto = { id: 'f', type: 'FOTO', source: 'database', x_mm: 20, y_mm: 25,
                width_mm: 20, height_mm: 25, face: 'front' };
            state.numeracoes = [
                { id: 'n1', name: 'Foto', formato_id: 'fmt', elements: [text, foto], csv_data: null },
                { id: 'n2', name: 'Setor', formato_id: 'fmt', elements: [{ ...text }], csv_data: null }
            ];
            state.formatos = [{ id: 'fmt', width_mm: 100, height_mm: 60 }];
            state.amostrasContainerId = 'cliente-amostras-itens-container';
            state.ordens = [{ id: 'vibe_123', numero: '123' }];
            state.osItens.vibe_123 = [501, 502].map((id, i) => ({ id, nome_modelo: i ? 'Setor' : 'Foto',
                amostra_num_id: i ? 'n2' : 'n1', amostra_status: 'PRONTO', verso: false,
                quantidade: i ? 4 : 6, arte_url: svg('#ffffff'), amostra_arte_base64: svg('#ffffff') }));
            clienteState.osId = 'vibe_123'; clienteState.numero = '123'; clienteState.token = 'sintetico';
            window.__labels = [];
            const original = CanvasRenderingContext2D.prototype.fillText;
            CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
                window.__labels.push(String(text)); return original.call(this, text, ...args);
            };
            await PortalBancos.carregar('123', 'sintetico', carregarBancosDoPortal);
            renderAmostrasOSItens('vibe_123');
        });
        async function pronto(idx, pagina, total) {
            await page.waitForFunction((i, p, n) => {
                const info = document.getElementById('amostra-csv-info-' + i);
                const aviso = document.querySelector('[data-aviso-banco="' + (501 + i) + '"]');
                return info && info.textContent === `Ingresso ${p} de ${n}` && aviso && aviso.style.display === 'none';
            }, { timeout: 8000 }, idx, pagina, total);
        }
        await pronto(0, 1, 6); await pronto(1, 1, 4);
        const pixel = () => page.$eval('#amostra-item-canvas-0', c => Array.from(c.getContext('2d').getImageData(118, 148, 1, 1).data));
        assert.deepEqual(await pixel(), [255, 0, 0, 255], 'foto vermelha da primeira linha');
        assert.ok(await page.evaluate(() => __labels.some(x => x.includes('PESSOA_1'))));
        await page.click('#amostra-csv-next-0'); await pronto(0, 2, 6);
        assert.deepEqual(await pixel(), [0, 255, 0, 255]);
        assert.ok(await page.evaluate(() => __labels.some(x => x.includes('PESSOA_2'))));
        await page.$eval('#amostra-csv-goto-0', el => { el.value = '6'; el.dispatchEvent(new Event('change')); });
        await pronto(0, 6, 6);
        assert.deepEqual(await pixel(), [0, 0, 255, 255], 'foto azul da última linha');
        assert.ok(await page.evaluate(() => __labels.some(x => x.includes('PESSOA_6'))));
        assert.equal(await page.$eval('#amostra-csv-next-0', b => b.disabled), true);
        await pronto(1, 1, 4); // outro modelo não mudou de página
        await page.$eval('#amostra-csv-goto-1', el => { el.value = '999'; el.dispatchEvent(new Event('change')); });
        await pronto(1, 4, 4);
        await page.click('#amostra-csv-prev-1'); await pronto(1, 3, 4);
        // A primeira solicitação atrasa; só a última pode chegar à tela.
        await page.evaluate(async () => {
            const preload = precarregarArtesDosElementos;
            precarregarArtesDosElementos = async (els, rows) => {
                if (rows?.[0]?.__id === 1) await new Promise(r => setTimeout(r, 200));
                return preload(els, rows);
            };
            const antiga = amostraCsvPagina(0, 0, 1);
            const nova = amostraCsvPagina(0, 0, 6);
            await Promise.all([antiga, nova]);
            precarregarArtesDosElementos = preload;
        });
        await pronto(0, 6, 6); assert.deepEqual(await pixel(), [0, 0, 255, 255]);
        const out = path.join(root, 'rascunhos', 'portal-bancos'); fs.mkdirSync(out, { recursive: true });
        await page.screenshot({ path: path.join(out, 'desktop.png'), fullPage: true });
        await page.setViewport({ width: 390, height: 844 });
        await page.screenshot({ path: path.join(out, 'mobile.png'), fullPage: true });
        await page.evaluate(async () => {
            __fail = true; await recarregarBancoCliente();
            await decisionAmostraItem('501', 'vibe_123', 'APROVADA');
            await clienteAprovarTudo();
        });
        assert.equal(await page.$eval('[data-aprovar-banco="501"]', b => b.disabled), true);
        assert.equal(await page.evaluate(() => __writes.length), 0, 'falha não aprova nem escreve');
        await page.evaluate(async () => { __fail = false; await recarregarBancoCliente(); });
        await pronto(0, 6, 6);
        await page.evaluate(async () => {
            __response.modelos[0].banco.csv_data[5].__fotos.foto.url = 'https://sintetico.test/foto.svg';
            await recarregarBancoCliente();
        });
        await page.waitForFunction(() => document.querySelector('[data-aviso-banco="501"]').textContent.includes('foto desta página'));
        assert.equal(await page.$eval('[data-aprovar-banco="501"]', b => b.disabled), true);
        fotoDisponivel = true;
        await page.evaluate(() => recarregarBancoCliente());
        await pronto(0, 6, 6);
        assert.deepEqual(await pixel(), [0, 0, 255, 255], 'retry recupera a mesma URL de foto após falha');
        await page.evaluate(() => { state.arteSomenteLeitura = true; renderAmostrasOSItens('vibe_123'); });
        await pronto(0, 6, 6);
        assert.equal((await page.$$('[data-aprovar-banco]')).length, 0, 'aprovado continua somente leitura');
        // Um PDF de seis páginas usa o mesmo banco e uma única navegação.
        await page.evaluate(async () => {
            state.arteSomenteLeitura = false;
            const item = state.osItens.vibe_123[0]; item.modo_pdf = true;
            document.getElementById('cliente-amostras-itens-container').innerHTML =
                '<canvas id="amostra-pdf-canvas-0"></canvas><div id="amostra-pdf-nav-0"><span id="amostra-pdf-page-info-0"></span></div>' +
                '<div data-aviso-banco="501"></div><button data-aprovar-banco="501"></button>';
            window.__pdfFail = false;
            pdfViewerState[0] = { osId: 'vibe_123', totalPages: 6, currentPage: 1, pdf: {
                getPage: async n => {
                    if (__pdfFail) throw Error('falha sintética');
                    if (n === 2) await new Promise(r => setTimeout(r, 150));
                    return { getViewport: () => ({ width: 600, height: 360 }),
                        render: ({ canvasContext: ctx }) => ({ promise: Promise.resolve().then(() => {
                            ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 600, 360);
                        }) }) };
                }
            } };
            __labels = [];
            await renderPdfViewerPage(0, 1);
        });
        const pdfPixel = () => page.$eval('#amostra-pdf-canvas-0', c => Array.from(c.getContext('2d').getImageData(120, 150, 1, 1).data));
        assert.deepEqual(await pdfPixel(), [255, 0, 0, 255]);
        assert.ok(await page.evaluate(() => __labels.some(x => x.includes('PESSOA_1'))));
        await page.evaluate(async () => {
            const lenta = renderPdfViewerPage(0, 2);
            await new Promise(r => setTimeout(r, 30));
            const ultima = renderPdfViewerPage(0, 6);
            await Promise.all([lenta, ultima]);
        });
        assert.deepEqual(await pdfPixel(), [0, 0, 255, 255]);
        assert.ok(await page.evaluate(() => __labels.some(x => x.includes('PESSOA_6'))));
        assert.equal(await page.$eval('#amostra-pdf-page-info-0', el => el.textContent), 'Página 6 / 6');
        assert.equal((await page.$$('[id^="amostra-csv-nav-"]')).length, 0);
        await page.evaluate(async () => { __pdfFail = true; await renderPdfViewerPage(0, 3); });
        assert.equal(await page.$eval('[data-aprovar-banco="501"]', b => b.disabled), true, 'falha getPage bloqueia aprovação anterior');
        assert.deepEqual(await pdfPixel(), [0, 0, 255, 255], 'falha preserva a última composição completa');
        await page.evaluate(async () => { __pdfFail = false; await renderPdfViewerPage(0, 3); });
        assert.equal(await page.$eval('[data-aprovar-banco="501"]', b => b.disabled), false);
        await page.evaluate(async () => { pdfViewerState[0].totalPages = 5; await renderPdfViewerPage(0, 1); });
        assert.equal(await page.$eval('[data-aprovar-banco="501"]', b => b.disabled), true, 'PDF e banco divergentes ficam explícitos');
        assert.deepEqual(errors, [], 'sem erro de execução');
        console.log('OK: Chromium, foto e texto por página, 6/4 linhas, limites, concorrência, PDF, erro, retry, leitura e zero escritas.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
