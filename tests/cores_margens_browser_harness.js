'use strict';
// HTML, formulário e composição reais. Transporte/PDF.js simulados, sem rede.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'frontend', name), 'utf8').replace(/\r\n/g, '\n');
const main = read('script.js'), portal = read('cliente.js');
function extract(source, name) {
    const m = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    assert(m, name);
    return source.slice(m.index, source.indexOf('\n}', m.index) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => r.abort());
        await page.setViewport({ width: 1280, height: 1100 });
        const html = read('index.html');
        const start = html.indexOf('<section id="view-cores"');
        const section = html.slice(start, html.indexOf('</section>', start) + 10).replace('class="view-section"', 'class="view-section active"');
        await page.setContent(`<style>${read('style.css')} body{padding:24px}.view-section{max-width:1160px;margin:auto}</style>${section}`);
        await page.addScriptTag({ content: read('cor-margens.js') });
        await page.evaluate(() => {
            window.state = { formatos: [{ id: 'f1', name: 'Ingresso', width_mm: 100, height_mm: 50 },
                { id: 'f2', name: 'Outro formato', width_mm: 80, height_mm: 40 }], cores: [], osItens: {} };
            document.getElementById('cor-formato').innerHTML = '<option value="">Selecione</option><option value="f1">Ingresso — 100 × 50 mm</option><option value="f2">Outro — 80 × 40 mm</option>';
            window.messages = [];
            window.toast = (message, type) => messages.push({ message, type });
            window.podeAbrirView = () => true;
            window.showView = () => {};
            window.loadAll = async () => {};
            window.saveLocalCorReferencia = () => {};
            window.toggleCorVersoFields = () => {};
            window.renderPdfPreview = () => {};
            window.renderPdfVersoPreview = () => {};
            window.clearCorPdfFile = () => { corPdfBase64 = ''; corPdfFilename = ''; };
            window.clearCorPdfVersoFile = () => { corPdfVersoBase64 = ''; corPdfVersoFilename = ''; };
            window.corPdfBase64 = ''; window.corPdfFilename = '';
            window.corPdfVersoBase64 = ''; window.corPdfVersoFilename = '';
            window.writes = 0; window.writeError = null; window.emptyWrite = false;
            window.supabaseClient = { from(table) {
                let action = 'read', payload, id;
                const query = {
                    select() { return this; }, eq(_field, value) { id = value; return this; },
                    insert(rows) { action = 'insert'; payload = rows[0]; return this; },
                    update(data) { action = 'update'; payload = data; return this; },
                    async single() {
                        if (action !== 'read') {
                            writes++;
                            if (writeError) return { data: null, error: { message: writeError } };
                            if (emptyWrite) return { data: null, error: null };
                            if (action === 'insert') { id = payload.id; state.cores.push({ ...payload }); }
                            else Object.assign(state.cores.find(c => c.id === id), payload);
                        }
                        return { data: state.cores.find(c => c.id === id), error: null };
                    },
                    async maybeSingle() {
                        if (window.failRead) return { error: Error('Falha sintética de download') };
                        return { data: state.cores.find(c => c.id === id), error: null };
                    },
                };
                return query;
            } };
        });
        const funcs = ['api', 'apiSemConfirmacao', 'valorDoFormatoConfere', 'garantirPdfDaCor',
            'atualizarFormatoDaCor', 'onCorFormatoSelect', 'saveCor', 'editCor', 'cancelCorEdit', 'duplicateCor'];
        await page.addScriptTag({ content: 'const _pdfDeCorEmVoo = new Map();\n' + funcs.map(n => extract(main, n)).join('\n') });
        const formResult = await page.evaluate(async () => {
            let tests = 0;
            const ok = (value, message) => { tests++; if (!value) throw Error(message); };
            const set = (id, value) => { document.getElementById(id).value = value; };
            set('cor-formato', 'f1'); set('cor-name', 'Cor de referência');
            set('cor-margem-esquerda', '3,5'); set('cor-margem-direita', '7');
            set('cor-margem-superior', '2'); set('cor-margem-inferior', '9');
            onCorFormatoSelect();
            ok(document.getElementById('cor-w').value === '110.5', 'largura com vírgula');
            ok(document.getElementById('cor-h').value === '61', 'altura independente');
            ok(document.getElementById('cor-w').readOnly && document.getElementById('cor-h').readOnly, 'resultado não editável');
            set('cor-formato', 'f2'); onCorFormatoSelect();
            ok(document.getElementById('cor-w').value === '90.5', 'troca recalcula');
            ok(document.getElementById('cor-margem-esquerda').value === '3,5', 'troca não apaga margem');
            set('cor-formato', 'f1'); onCorFormatoSelect();
            const before = JSON.stringify(state.formatos);
            await saveCor();
            const saved = state.cores[0];
            ok(saved.width_mm === 110.5 && saved.height_mm === 61, 'dimensões persistidas');
            ok(saved.margem_esquerda_mm === 3.5 && saved.margem_inferior_mm === 9, 'lados persistidos');
            ok(JSON.stringify(state.formatos) === before, 'nenhuma alteração no Formato');
            await editCor(saved.id);
            ok(document.getElementById('cor-margem-esquerda').value === '3.5', 'reabertura');
            ok(document.getElementById('cor-h').value === '61', 'reabertura calcula');
            const count = writes;
            set('cor-margem-esquerda', '-1'); atualizarFormatoDaCor(); await saveCor();
            ok(writes === count && document.getElementById('btn-cor-save').disabled, 'negativo bloqueia escrita');
            for (const invalid of ['', 'abc', '1,2,3', 'Infinity']) {
                set('cor-margem-esquerda', invalid); atualizarFormatoDaCor(); await saveCor();
                ok(writes === count, 'inválido não grava: ' + invalid);
            }
            set('cor-margem-esquerda', '0'); atualizarFormatoDaCor();
            ok(document.getElementById('cor-w').value === '107', 'zero permitido');
            writeError = "Could not find the 'margem_esquerda_mm' column";
            await saveCor();
            ok(writes === count + 1 && document.getElementById('cor-id').value === saved.id, 'sem coluna: não descarta margem nem fecha formulário');
            writeError = null; emptyWrite = true; await saveCor();
            ok(document.getElementById('cor-id').value === saved.id, 'resposta vazia não confirma');
            emptyWrite = false;
            await duplicateCor(saved.id);
            ok(state.cores[1].margem_esquerda_mm === 3.5 && state.cores[1].width_mm === 110.5, 'duplicar preserva quatro margens');
            failRead = true; await editCor(saved.id);
            const beforeFailure = writes;
            set('cor-margem-esquerda', '1'); atualizarFormatoDaCor(); await saveCor();
            ok(writes === beforeFailure && document.getElementById('btn-cor-save').disabled, 'falha de PDF mantém salvamento bloqueado');
            failRead = false; await editCor(saved.id);
            ok(!document.getElementById('btn-cor-save').disabled, 'reabrir recupera');
            return tests;
        });
        const output = path.join(root, 'tmp-cores-margens');
        fs.mkdirSync(output, { recursive: true });
        await page.screenshot({ path: path.join(output, 'cadastro.png'), fullPage: true });

        await page.addScriptTag({ content: extract(main, 'pdfDuplicarParaVersoDoModelo') + '\n' + extract(main, 'drawAmostraFace').replace('function drawAmostraFace(', 'function desenharPainel(') });
        await page.addScriptTag({ content: extract(portal, 'pdfCopiaNoPortal') + '\n' + extract(portal, 'arteDaFaceParaComposicao') + '\n'
            + extract(portal, 'drawAmostraFace').replace('function drawAmostraFace(', 'function desenharPortal(') });
        const visualResult = await page.evaluate(async () => {
            let tests = 0;
            const ok = (value, message) => { tests++; if (!value) throw Error(message); };
            window.garantirFontesCarregadas = async () => {};
            window.fontesDosElementos = () => [];
            window.garantirPdfDaCor = async () => {};
            window.rasterDaAmostra = async (_key, create) => create();
            window.escalaDaArteDoModelo = () => ({ h: 100, v: 100 });
            window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() { return {
                destroy: async () => {}, promise: Promise.resolve({ numPages: 1, getPage: async () => ({
                    getViewport: ({ scale }) => ({ width: 110.5 * 2.8346 * scale, height: 61 * 2.8346 * scale }),
                    render: ({ canvasContext, viewport }) => { canvasContext.fillStyle = '#ffff00'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); return { promise: Promise.resolve() }; },
                }) }),
            }; } };
            const original = document.createElement('canvas'); original.width = 100; original.height = 50;
            const originalCtx = original.getContext('2d'); originalCtx.fillStyle = '#00ffff'; originalCtx.fillRect(0, 0, 100, 50);
            const item = { id: 'm1', _dbLoaded: true, arte_url: original.toDataURL(), verso_arte_url: original.toDataURL(), amostra_cor_id: 'c1' };
            const fmt = { width_mm: 100, height_mm: 50 };
            const cor = { id: 'c1', margem_esquerda_mm: 3.5, margem_direita_mm: 7, margem_superior_mm: 2, margem_inferior_mm: 9,
                width_mm: 999, height_mm: 999, pdf_base64: 'data:application/pdf;base64,QQ==' };
            state.osItens = { os1: [item] };
            for (const draw of [desenharPainel, desenharPortal]) for (const face of ['front', 'back']) {
                const canvas = document.createElement('canvas');
                await draw(item, face, canvas, null, fmt, cor, null, 0, 'os1', 2);
                ok(canvas.width === 221 && canvas.height === 122, 'Cor calculada tem 110,5 × 61 mm');
                const pixel = (x, y) => [...canvas.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
                ok(pixel(2, 2) === '255,255,0', 'margem externa mantém a Cor');
                ok(pixel(10, 7) === '0,255,0', 'arte está no início da peça após esquerda/superior');
                ok(pixel(209, 7) === '255,255,0', 'margem direita fora dos 100 mm da peça');
                ok(pixel(10, 108) === '255,255,0', 'margem inferior fora dos 50 mm da peça');
                ok(fmt.width_mm === 100 && fmt.height_mm === 50, 'Formato não alterado');
            }
            return tests;
        });
        assert.deepEqual(errors, []);
        console.log(`OK: ${formResult} verificações do cadastro; ${visualResult} verificações de pixels no painel/portal, frente/verso.`);
        console.log('Preview local: ' + path.join(output, 'cadastro.png'));
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
