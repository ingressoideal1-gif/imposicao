import { createRequire } from 'node:module';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { launch } = require('puppeteer');
const html = await readFile(new URL('../frontend/index.html', import.meta.url), 'utf8');
const section = html.match(/<section id="view-idgen"[\s\S]*?<\/section>/)[0];
const script = await readFile(new URL('../frontend/idgen.js', import.meta.url), 'utf8');
const browser = await launch({ headless: true });
try {
    const page = await browser.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // No application/CDN/database connections are allowed in this test.
    await page.setRequestInterception(true);
    page.on('request', r => r.url() === 'https://idgen-test.invalid/'
        ? r.respond({ status: 200, contentType: 'text/html', body: section }) : r.abort());
    await page.goto('https://idgen-test.invalid/');
    await page.evaluate(() => {
        window.supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'synthetic' } } }) } };
        window.chamadasIdGen = []; window.pedidosIdGen = [];
        window.fetch = async (url, options) => {
            if (url !== 'https://vwbtitjlpelrcnsytzqw.supabase.co/functions/v1/idgen-interno') throw new Error('Destino inesperado');
            const { acao, dados } = JSON.parse(options.body); chamadasIdGen.push(acao);
            let body;
            if (acao === 'listar') body = pedidosIdGen;
            if (acao === 'clientes') {
                if (dados.busca !== '42') throw new Error('A busca deve enviar somente o número normalizado.');
                body = [{ id_cliente: 42, nome: 'Teste', fantasia: '<img src=x onerror=alert(1)>' }];
            }
            if (acao === 'criar') { body = { id: dados.id, cliente_id: dados.cliente_id, nome: dados.nome }; pedidosIdGen.push(body); }
            return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
    });
    await page.addScriptTag({ content: script });
    await page.evaluate(() => IdGen.iniciar());
    await page.type('#idgen-busca', 'Teste'); await page.click('#idgen-buscar');
    assert.deepEqual(await page.evaluate(() => chamadasIdGen), ['listar']);
    await page.$eval('#idgen-busca', e => { e.value = '0042'; }); await page.click('#idgen-buscar');
    await page.waitForSelector('#idgen-clientes button');
    assert.equal(await page.$('#idgen-clientes img'), null);
    await page.click('#idgen-clientes button');
    await page.type('#idgen-nome', 'Credenciais sintéticas'); await page.click('#idgen-criar');
    await page.waitForSelector('#idgen-pedidos button');
    assert.equal(await page.$eval('#idgen-pedidos h3', e => e.textContent), 'Credenciais sintéticas');
    const link = await page.$eval('#idgen-pedidos .card a', e => ({ href: e.href, target: e.target, rel: e.rel }));
    const ownId = await page.evaluate(() => pedidosIdGen[0].id);
    assert.equal(link.href, 'https://idgen-5kg.pages.dev/?template=' + ownId);
    assert.equal(link.target, '_blank'); assert.equal(link.rel, 'noopener noreferrer');
    await page.click('#idgen-pedidos button');
    await page.waitForFunction(() => document.querySelector('#idgen-mensagem').textContent.includes('ainda não está habilitada'));
    assert.deepEqual(await page.evaluate(() => chamadasIdGen), ['listar', 'clientes', 'criar', 'listar']);
    assert.deepEqual(errors, []);
    const dir = await mkdtemp(join(tmpdir(), 'idgen-menu-browser-'));
    await page.screenshot({ path: join(dir, 'menu-local.png'), fullPage: true });
    console.log('PASS: menu, search, safe text, create, list, fail-closed editor; all network mocked. Evidence:', dir);
} finally { await browser.close(); }
