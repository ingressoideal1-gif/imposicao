// DOM/canvas reais; rede bloqueada e API simulada.
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const script = read('frontend/script.js');
const extract = name => {
    let start = script.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    if (script.slice(start - 6, start) === 'async ') start -= 6;
    return script.slice(start, script.indexOf('\n}', start) + 2);
};
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        for (const html of ['index.html', 'producao.html']) {
            const page = await browser.newPage();
            const errors = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.setRequestInterception(true);
            page.on('request', req => req.abort());
            await page.setViewport({ width: 1280, height: 900 });
            await page.setContent(read('frontend/' + html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ''));
            await page.addStyleTag({ content: read('frontend/capa-layout.css') });
            await page.addStyleTag({ content: read('frontend/style.css').replace(/^@import[^\r\n]*\r?\n/gm, '') });
            await page.addScriptTag({ content: read('frontend/texto-ajuste.js') });
            await page.addScriptTag({ content: read('frontend/capa-layout.js') });
            await page.addScriptTag({ content: `
                const state = { formatos: [], fmtRotations: {} }; window.state = state;
                window.calls = [];
                function toast() {} function podeAbrirView() { return true; }
                function updateRotationButtons() {} function drawFormatPreview() {}
                function validateOffsetField(el) { return Number(el.value); }
                async function loadAll() {} window.showView = () => {};
                async function api(method, url, data) { calls.push({method, url, data}); return data; }
                ${['saveFmt', 'editFmt', 'cancelFmtEdit', 'duplicateFmt'].map(extract).join('\n')}
            ` });
            await page.evaluate(() => {
                cancelFmtEdit();
                document.getElementById('fmt-name').value = 'Formato sintético';
                document.getElementById('fmt-has-cover').checked = true;
                abrirLayoutDaCapa();
            });
            assert.equal(await page.$$eval('#fmt-cover-fields', els => els.length), 1);
            for (const modo of ['shrink', 'wrap', 'condense']) {
                for (const align of ['left', 'center', 'right']) {
                    await page.select('#fmt-cover-overflow', modo);
                    await page.select('#fmt-cover-text-align', align);
                    await page.$eval('#fmt-cover-max-width', el => { el.value = '35'; el.dispatchEvent(new Event('input', { bubbles: true })); });
                    await page.select('#capa-layout-exemplo', 'teatro');
                    assert.deepEqual(await page.evaluate(() => lerEstiloDaCapa()), {
                        cover_max_width_mm: 35, cover_overflow: modo, cover_text_align: align
                    });
                }
            }
            // Arraste da arte respeita o sentido dos offsets; texto usa X/Y em mm.
            const center = await page.$eval('canvas[aria-label]', el => {
                const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            await page.mouse.move(center.x, center.y); await page.mouse.down();
            await page.mouse.move(center.x + 25, center.y + 15); await page.mouse.up();
            assert(Number(await page.$eval('#fmt-cover-offx', el => el.value)) > 0);
            assert(Number(await page.$eval('#fmt-cover-offy', el => el.value)) < 0);
            await page.click('#capa-layout-cancelar');
            assert.equal(await page.$eval('#fmt-cover-offx', el => el.value), '0');
            assert.equal(await page.$eval('#fmt-cover-max-width', el => el.value), '');
            await page.evaluate(() => abrirLayoutDaCapa());
            const textPoint = await page.$eval('canvas[aria-label]', el => {
                const r = el.getBoundingClientRect();
                return { x: r.x + (24 + 15 * 7.2) * r.width / el.width,
                    y: r.y + (24 + 9 * 7.2) * r.height / el.height };
            });
            await page.mouse.move(textPoint.x, textPoint.y); await page.mouse.down();
            await page.mouse.move(textPoint.x + 12, textPoint.y + 12); await page.mouse.up();
            assert(Number(await page.$eval('#fmt-cover-font-x', el => el.value)) > 10);
            assert(Number(await page.$eval('#fmt-cover-font-y', el => el.value)) > 10);
            await page.$eval('#fmt-cover-max-width', el => { el.value = '40'; });
            await page.select('#fmt-cover-overflow', 'wrap');
            await page.select('#fmt-cover-text-align', 'center');
            await page.$eval('#fmt-cover-font-x', el => { el.value = '0'; });
            await page.click('#capa-layout-aplicar');
            assert.equal(await page.$$eval('#capa-layout-dialog', els => els.length), 0);
            await page.evaluate(() => saveFmt());
            const saved = await page.evaluate(() => calls.at(-1).data);
            assert.equal(saved.cover_font_x, 0);
            assert.equal(saved.cover_max_width_mm, 40);
            assert.equal(saved.cover_overflow, 'wrap');
            assert.equal(saved.cover_text_align, 'center');
            await page.evaluate(saved => { state.formatos = [{...saved, id: 'teste'}]; editFmt('teste'); }, saved);
            assert.equal(await page.$eval('#fmt-cover-max-width', el => el.value), '40');
            await page.evaluate(() => duplicateFmt('teste'));
            assert.equal(await page.evaluate(() => calls.at(-1).data.cover_text_align), 'center');
            await page.evaluate(() => abrirLayoutDaCapa());
            if (process.argv[2] && html === 'index.html') await page.screenshot({path: process.argv[2]});
            await page.setViewport({width: 390, height: 844});
            const fits = await page.$eval('#capa-layout-dialog', el => el.scrollWidth <= el.clientWidth + 1);
            assert(fits, 'Janela não deve transbordar horizontalmente');
            await page.keyboard.press('Escape');
            assert.equal(await page.$$eval('#capa-layout-dialog', els => els.length), 0);
            assert.deepEqual(errors, []);
            await page.close();
        }
        console.log('OK: duas telas, nove combinações, arraste, cancelar/aplicar, salvar/reabrir/duplicar, zero, mobile e Escape.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
