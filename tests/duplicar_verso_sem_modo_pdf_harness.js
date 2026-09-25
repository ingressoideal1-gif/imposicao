// Código real; DOM/canvas reais; arte, rede e persistência sintéticas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const puppeteer = require('puppeteer');
const ler = nome => fs.readFileSync(path.join(__dirname, '../frontend', nome), 'utf8');
const painel = ler('script.js'), pedido = ler('pedido.js'), cliente = ler('cliente.js');
function extrair(src, nome) {
    const inicio = src.search(new RegExp('^(?:async )?function ' + nome + '\\(', 'm'));
    assert.ok(inicio >= 0, nome);
    return src.slice(inicio, src.indexOf('\n}', inicio) + 2);
}

(async () => {
    const num = { id: 'n', print_mode: 'pdf_duplicate_back', elements: [] };
    const item = { id: 'm', amostra_num_id: 'n', modo_pdf: false, qtd: 10 };
    const box = { state: { numeracoes: [num], printMode: num.print_mode,
        pedArtPdfDoc: { numPages: 1 }, pedArtVersoPdfDoc: { numPages: 2 } } };
    vm.createContext(box);
    vm.runInContext(['pdfDuplicarParaVersoDoModelo', 'validarPdfDuplicarParaVerso', 'versoUnico']
        .map(n => extrair(painel, n)).join('\n') + extrair(pedido, 'pdfDaFaceNaPreviaPedido'), box);
    for (const schema of ['sequential', 'cut_stack', 'step_repeat']) {
        assert.equal(box.validarPdfDuplicarParaVerso(item, schema, 'n', { numPages: 1 }), null);
        const face = box.pdfDaFaceNaPreviaPedido(true, schema, 9);
        assert.equal(face.documento, box.state.pedArtPdfDoc);
        assert.equal(face.pagina, 1);
    }
    assert.match(box.validarPdfDuplicarParaVerso(item, 'sequential', 'outra', null), /numeração selecionada/);
    assert.match(box.validarPdfDuplicarParaVerso(item, 'pdf_multiple', 'n', null), /Modo PDF/);
    assert.match(box.validarPdfDuplicarParaVerso({ ...item, modo_pdf: true }, 'pdf_multiple', 'n', { numPages: 1 }), /exatamente 10/);
    assert.equal(box.validarPdfDuplicarParaVerso({ ...item, modo_pdf: true }, 'pdf_multiple', 'n', { numPages: 10 }), null);
    assert.equal(box.pdfDaFaceNaPreviaPedido(true, 'pdf_multiple', 3).pagina, 4);

    const browser = await puppeteer.launch({ headless: true });
    try {
        for (const [src, portal] of [[painel, false], [cliente, true]]) {
            const page = await browser.newPage();
            page.on("console", msg => { if (["warn", "error"].includes(msg.type())) console.error(msg.text()); });
            await page.setContent('<div id="amostras-itens-container"></div><canvas id="frente"></canvas><canvas id="verso"></canvas>');
            const helpers = portal ? ['pdfCopiaNoPortal', 'arteDaFaceParaComposicao']
                : ['pdfDuplicarParaVersoDoModelo', 'escalaDaArteDoModelo'];
            await page.addScriptTag({ content: [...helpers, 'drawAmostraFace'].map(n => extrair(src, n)).join('\n') });
            const resultado = await page.evaluate(async () => {
                const item = { id: 'm', modo_pdf: false, amostra_num_id: 'n', _dbLoaded: true,
                    arte_url: '/frente.pdf', verso_arte_url: '/verso-antigo.pdf' };
                const num = { id: 'n', print_mode: 'pdf_duplicate_back', elements: [] };
                window.state = { osItens: { os: [item] }, numeracoes: [num] };
                window.ESCALA_ARTE_MIN = 1; window.ESCALA_ARTE_MAX = 400;
                window.rasterDaAmostra = async (_, pintar) => pintar();
                const downloads = [];
                window.fetchPdfBytes = async url => { downloads.push(url); return new Uint8Array([url === '/frente.pdf' ? 1 : 2]).buffer; };
                window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument({ data }) {
                    return { destroy: async () => {}, promise: Promise.resolve({ getPage: async () => ({
                        getViewport: ({ scale }) => ({ width: 100 * 2.8346 * scale, height: 50 * 2.8346 * scale }),
                        render: ({ canvasContext, viewport }) => {
                            canvasContext.fillStyle = data[0] === 1 ? '#ff0000' : '#0000ff';
                            canvasContext.fillRect(0, 0, viewport.width, viewport.height);
                            return { promise: Promise.resolve() };
                        },
                    }) }) };
                } };
                const fmt = { width_mm: 100, height_mm: 50 };
                const frente = document.getElementById('frente'), verso = document.getElementById('verso');
                await drawAmostraFace(item, 'front', frente, null, fmt, null, num, 0, 'os', 2);
                await drawAmostraFace(item, 'back', verso, null, fmt, null, num, 0, 'os', 2);
                const pixel = c => Array.from(c.getContext('2d').getImageData(100, 50, 1, 1).data);
                return { frente: pixel(frente), verso: pixel(verso), downloads,
                    originalVerso: item.verso_arte_url };
            });
            assert.deepEqual(resultado.frente, [255, 0, 0, 255]);
            assert.deepEqual(resultado.verso, resultado.frente, portal ? 'portal' : 'painel');
            assert.deepEqual(resultado.downloads, ['/frente.pdf', '/frente.pdf']);
            assert.equal(resultado.originalVerso, '/verso-antigo.pdf');
            await page.close();
        }
    } finally { await browser.close(); }
    console.log('OK: validação, prévia do Pedido e arte das duas faces no painel/portal sem Modo PDF');
})().catch(e => { console.error(e); process.exitCode = 1; });
