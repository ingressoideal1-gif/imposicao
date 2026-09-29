// DOM e canvas reais; apenas dados sinteticos, sem rede.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
function extract(src, name) {
    const start = src.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    return src.slice(src.slice(start - 6, start) === 'async ' ? start - 6 : start,
        src.indexOf('\n}', start) + 2);
}

(async () => {
    const browser = await puppeteer.launch({ headless: true });
    let checks = 0;
    try {
        const page = await browser.newPage();
        await page.setRequestInterception(true);
        page.on('request', request => request.abort());
        await page.setContent('<div id="elements-list"></div><canvas id="saida"></canvas>');
        const script = read('frontend/script.js');
        const updateStart = script.indexOf('window.updateEl = function');
        await page.addScriptTag({ content: `
            const state = { numElements: [], selectedElIds: [], csvData: [], osItens: {} };
            function saveNumHistory() {}
            function drawCanvas() {}
            function fontPickerHTML() { return ''; }
            function mountFontPickers() {}
            function renderBoxArquivos() {}
            function escapeHtml(s) { return s; }
            function isElSelected() { return false; }
            ${extract(script, 'renderElementsList')}
            ${script.slice(updateStart, script.indexOf('\n};', updateStart) + 3)}
        ` });
        const controls = await page.evaluate(() => {
            state.numElements = ['CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL']
                .map((type, i) => ({ id: 'cam' + i, type, x_mm: 10, y_mm: 10, font_size: 12 }));
            renderElementsList();
            const input = id => document.querySelector(`#elcard-${id} input[oninput]`);
            const defaults = state.numElements.map(el => input(el.id).value);
            const hints = [];
            state.numElements.forEach(el => {
                input(el.id).value = '6';
                input(el.id).dispatchEvent(new Event('input', { bubbles: true }));
                hints.push(document.getElementById('pad-hint-' + el.id).textContent);
            });
            // Reabre os elementos serializados como no registro da numeracao.
            state.numElements = JSON.parse(JSON.stringify(state.numElements));
            renderElementsList();
            const restored = state.numElements.map(el => input(el.id).value);
            const boundaries = [];
            for (const value of ['-1', '11', '2.7', '']) {
                input('cam0').value = value;
                input('cam0').dispatchEvent(new Event('input', { bubbles: true }));
                input('cam0').dispatchEvent(new Event('change', { bubbles: true }));
                boundaries.push([state.numElements[0].pad, input('cam0').value]);
            }
            return { defaults, hints, restored, boundaries, others: state.numElements.slice(1).map(el => el.pad) };
        });
        assert.deepEqual(controls, {
            defaults: ['0', '0', '0'], hints: Array(3).fill('(6 dígitos = 000001)'),
            restored: ['6', '6', '6'], boundaries: [[0, '0'], [10, '10'], [2, '2'], [0, '0']], others: [6, 6]
        });
        checks++;

        for (const file of ['frontend/script.js', 'frontend/cliente.js']) {
            const src = read(file);
            await page.addScriptTag({ content: `
                function pdfDuplicarParaVersoDoModelo() { return false; }
                function pdfCopiaNoPortal() { return false; }
                function escalaDaArteDoModelo() { return {h:100,v:100}; }
                function linhaDaAmostra() { return {}; }
                function linhasDaAmostra() { return [{}]; }
                function paginaDaAmostra() { return 0; }
                async function garantirPdfDaCor() {}
                async function garantirFontesCarregadas() {}
                function fontesDosElementos() { return []; }
                function buildCanvasFont(size) { return size + 'px Arial'; }
                async function rasterDaAmostra(chave, desenhar) { return desenhar(); }
                ${read('frontend/numero-da-pagina.js')}
                ${read('frontend/texto-ajuste.js')}
                ${file.endsWith('cliente.js') ? extract(src, 'arteDaFaceParaComposicao') : extract(src, 'aguardarRecursoDaPrevia')}
                ${['elementoMesclaComArte', 'elementosNaOrdemDeComposicao', 'opacidadeDoElemento',
                    'drawImageContain', 'drawArteDoElemento', 'drawAmostraFace',
                    'drawNumeracaoElementsOverCanvas'].map(name => extract(src, name)).join('\n')}
            ` });
            const rendered = await page.evaluate(async () => {
                const canvas = document.getElementById('saida');
                const ctx = canvas.getContext('2d');
                const original = CanvasRenderingContext2D.prototype.fillText;
                let texts = [];
                CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
                    texts.push(text); return original.call(this, text, ...args);
                };
                const result = [];
                const fmt = { width_mm: 100, height_mm: 50 };
                const item = { id: 'synthetic', _dbLoaded: true, c_ini: 7, l_cam: 5, amostra_num_id: 'cam' };
                for (const pad of [undefined, 0, 2, 6]) {
                    const num = { id: 'cam', tipo: 'CAMAROTE', elements:
                        ['CAMAROTE_LOCAL', 'CAMAROTE_PESSOA', 'CAMAROTE_PESSOA_TOTAL'].map((type, i) => ({
                            id: 'cam' + i, type, pad, prefix: 'X ', x_mm: 20, y_mm: 10 + i * 10,
                            font_size: 12, font_name: 'helv', face: 'front'
                        })) };
                    texts = [];
                    await drawAmostraFace(item, 'front', canvas, null, fmt, null, num, 0, 'os', 1);
                    result.push([...texts]);
                    texts = [];
                    drawNumeracaoElementsOverCanvas(ctx, num, item, 1, canvas.width, canvas.height, 'front');
                    result.push([...texts]);
                }
                CanvasRenderingContext2D.prototype.fillText = original;
                return result;
            });
            const expected = [];
            for (const pad of [0, 0, 2, 6]) {
                const format = v => String(v).padStart(pad, '0');
                const labels = ['X ' + format(7), 'X ' + format(1), 'X ' + format(1) + '/' + format(5)];
                expected.push(labels, labels);
            }
            assert.deepEqual(rendered, expected, file);
            checks += rendered.length;
        }
        console.log(`${checks} verificacoes de controles e canvas passaram.`);
    } finally {
        await browser.close();
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
