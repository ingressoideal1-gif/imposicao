'use strict';
// SDK real e formulário real, HTTP inteiramente interceptado; sem banco remoto.
const assert = require('node:assert/strict');
const puppeteer = require('puppeteer');
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = [], writes = [];
        let row = null;
        const format = { id: 'f-real-teste', name: 'Formato sintético', width_mm: 100, height_mm: 50 };
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', async request => {
            const url = new URL(request.url());
            if (url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)) return request.continue();
            const headers = { 'access-control-allow-origin': 'http://127.0.0.1:8766',
                'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
            if (request.method() === 'OPTIONS') return request.respond({ status: 200, headers });
            let data;
            if (url.pathname === '/auth/v1/token') {
                data = { access_token: 'teste.' + Buffer.from(JSON.stringify({ exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url') + '.teste',
                    refresh_token: 'sintetico', token_type: 'bearer', expires_in: 3600,
                    user: { id: 'usuario-sintetico', aud: 'authenticated', email: 'teste@example.invalid' } };
            } else if (url.pathname === '/rest/v1/producao_formatos') {
                assert.equal(request.method(), 'GET', 'Formato nunca recebe escrita');
                data = url.searchParams.has('id') ? format : [format];
            } else if (url.pathname === '/rest/v1/producao_cores') {
                if (request.method() === 'POST') {
                    assert.equal(row, null, 'apenas uma criação');
                    const payload = JSON.parse(request.postData()); row = { ...payload[0] }; writes.push('POST'); data = row;
                } else if (request.method() === 'PATCH') {
                    assert.equal(url.searchParams.get('id'), 'eq.' + row.id);
                    Object.assign(row, JSON.parse(request.postData())); writes.push('PATCH'); data = row;
                } else {
                    data = url.searchParams.get('limit') === '0' ? [] : (request.headers().accept?.includes('vnd.pgrst.object') ? row : (row ? [row] : []));
                }
            } else { errors.push('Requisição inesperada: ' + url.pathname); return request.abort(); }
            return request.respond({ status: 200, contentType: 'application/json', headers, body: JSON.stringify(data) });
        });
        await page.goto('http://127.0.0.1:8766/integrado.html');
        await page.type('#email-integrado', 'teste@example.invalid');
        await page.type('#senha-integrada', 'senha-sintetica');
        await page.click('#login-integrado button');
        await page.waitForFunction(() => conectado);
        await page.select('#cor-formato', format.id);
        await page.click('#btn-cor-save');
        await page.waitForFunction(() => document.getElementById('evidencia-integrada').textContent.includes('"width_mm": 110.5'));
        await page.click('#reabrir');
        await page.waitForFunction(() => document.getElementById('cor-id').value !== '' && !document.getElementById('btn-cor-save').disabled);
        await page.$eval('#cor-margem-esquerda', input => { input.value = '10'; input.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('#btn-cor-save');
        await page.waitForFunction(() => document.getElementById('evidencia-integrada').textContent.includes('"width_mm": 117'));
        assert.deepEqual(writes, ['POST', 'PATCH']);
        assert.equal(row.margem_esquerda_mm, 10);
        assert.equal(row.height_mm, 61);
        assert.deepEqual(errors, []);
        assert.equal(await page.$eval('#senha-integrada', e => e.value), '');
        console.log('OK: formulário → SDK → HTTP simulado → releitura; criação, reabertura e edição do mesmo ID; Formato preservado.');
    } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
