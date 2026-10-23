import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { launch } = require('puppeteer');
const root = resolve(decodeURIComponent(new URL('../frontend', import.meta.url).pathname).replace(/^\/(\w:)/, '$1'));
const id = '00000000-0000-4000-8000-000000000002';
let pedido = { id, nome: 'Credenciais teste', cliente_id: 42, revisao: 1, documento: { modelos: [], cores: [], numeracoes: [], formatos: [] } };
let recusarProximoSave = false;
const catalogo = {
    producao_formatos: [{ id: 'f1', name: 'PVC 54x86', width_mm: 54, height_mm: 86 }],
    producao_cores: [{ id: 'c1', name: 'Azul', formato_id: 'f1', width_mm: 54, height_mm: 86, pdf_base64: null, pdf_verso_base64: null }],
    producao_numeracoes: [{ id: 'n1', name: 'Credencial', formato_id: 'f1', tipo: 'SEQUENCIAL', print_mode: 'front', elements: [], csv_data: null, bg_url: null }],
    producao_saidas: [], catalogo_fontes: [],
};
catalogo.producao_formatos.push({ id: 'f2', name: 'Outro formato', width_mm: 80, height_mm: 100 }, { id: 'f3', name: 'Sem cadastros', width_mm: 90, height_mm: 120 });
catalogo.producao_cores.push({ id: 'c2', name: 'Cor de outro formato', formato_id: 'f2' });
catalogo.producao_numeracoes.push({ id: 'n2', name: 'Outro', formato_id: 'f2', print_mode: 'front' }, { id: 'multi', name: 'Vários formatos', formato_id: 'f2', formato_ids: ['f1', 'f2'], print_mode: 'front' });
// Editor and Supabase SDK are real; network responses and session are synthetic.
const browser = await launch({ headless: true });
const evidence = await mkdtemp(join(tmpdir(), 'idgen-editor-browser-'));
const errors = [];
try {
    const page = await browser.newPage(); const writes = [], rejected = [];
    await page.setViewport({ width: 1440, height: 1000 });
    page.on('pageerror', e => errors.push(e.message));
    await page.evaluateOnNewDocument(() => {
        const expires_at = Math.floor(Date.now() / 1000) + 3600;
        const payload = btoa(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000001', role: 'authenticated', exp: expires_at }));
        localStorage.setItem('sb-vwbtitjlpelrcnsytzqw-auth-token', JSON.stringify({
            access_token: 'eyJhbGciOiJIUzI1NiJ9.' + payload + '.synthetic-signature', refresh_token: 'synthetic-refresh',
            expires_at, expires_in: 3600, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000001', email: 'test@example.invalid' },
        }));
    });
    await page.setRequestInterception(true);
    page.on('request', async r => {
        const u = new URL(r.url());
        try {
            if (u.hostname === 'idgen-test.invalid') {
                const filename = resolve(root, '.' + (u.pathname === '/' ? '/index.html' : decodeURIComponent(u.pathname)));
                if (!filename.startsWith(root + '\\') && !filename.startsWith(root + '/')) return r.abort();
                try { const body = await readFile(filename); return r.respond({ status: 200, contentType: { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png' }[extname(filename)] || 'application/octet-stream', body }); }
                catch { return r.respond({ status: 404, body: '' }); }
            }
            if (u.hostname.endsWith('supabase.co')) {
                const headers = { 'Access-Control-Allow-Origin': 'https://idgen-test.invalid', 'Access-Control-Allow-Headers': r.headers()['access-control-request-headers'] || 'authorization,content-type,apikey,x-client-info,prefer', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
                if (r.method() === 'OPTIONS') return r.respond({ status: 204, headers });
                if (u.pathname === '/functions/v1/idgen-interno') {
                    const { acao, dados } = JSON.parse(r.postData());
                    if (acao === 'salvar') {
                        writes.push({ acao, dados });
                        if (recusarProximoSave || dados.revisao !== pedido.revisao) {
                            recusarProximoSave = false;
                            return r.respond({ status: 409, headers, contentType: 'application/json', body: JSON.stringify({ erro: 'Conflito' }) });
                        }
                        pedido = { ...pedido, documento: dados.documento, revisao: pedido.revisao + 1 };
                    } else assert.equal(acao, 'abrir');
                    return r.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(pedido) });
                }
                if (u.pathname.startsWith('/rest/v1/') && r.method() === 'GET') {
                    const table = u.pathname.split('/').pop(); let data = catalogo[table] || [];
                    const filtro = u.searchParams.get('id'); if (filtro) data = data.filter(x => x.id === filtro.slice(3));
                    return r.respond({ status: 200, headers, contentType: 'application/json', body: JSON.stringify(r.headers().accept?.includes('vnd.pgrst.object') ? data[0] : data) });
                }
                rejected.push(r.method() + ' ' + u.pathname); return r.abort();
            }
            // Existing pinned editor libraries only. No credentials/customer data is sent.
            if (['cdnjs.cloudflare.com', 'cdn.jsdelivr.net'].includes(u.hostname)) return r.continue();
            return r.abort();
        } catch (e) { errors.push('route: ' + e.message); return r.abort(); }
    });
    await page.goto('https://idgen-test.invalid/?idgen=' + id, { waitUntil: 'networkidle2' });
    await page.waitForSelector('#idgen-modelo-form', { timeout: 15000 });
    assert.equal(await page.$eval('#idgen-modelo-cores', e => e.disabled), true);
    const opcoes = selector => page.$$eval(selector + ' option', opts => opts.map(o => o.value).filter(Boolean));
    await page.select('#idgen-modelo-formatos', 'f1');
    assert.deepEqual(await opcoes('#idgen-modelo-cores'), ['c1']);
    assert.deepEqual(await opcoes('#idgen-modelo-numeracoes'), ['n1', 'multi']);
    await page.select('#idgen-modelo-cores', 'c1'); await page.select('#idgen-modelo-numeracoes', 'n1');
    await page.select('#idgen-modelo-formatos', 'f2');
    assert.equal(await page.$eval('#idgen-modelo-cores', e => e.value), '');
    assert.equal(await page.$eval('#idgen-modelo-numeracoes', e => e.value), '');
    assert.deepEqual(await opcoes('#idgen-modelo-cores'), ['c2']);
    assert.deepEqual(await opcoes('#idgen-modelo-numeracoes'), ['n2', 'multi']);
    await page.select('#idgen-modelo-formatos', 'f3');
    assert.deepEqual(await opcoes('#idgen-modelo-cores'), []);
    assert.equal(await page.$eval('#idgen-modelo-numeracoes', e => e.disabled), true);
    await page.type('#idgen-modelo-nome', 'Credencial A');
    await page.select('#idgen-modelo-formatos', 'f1'); await page.select('#idgen-modelo-cores', 'c1'); await page.select('#idgen-modelo-numeracoes', 'n1');
    await page.click('#idgen-modelo-form button[type=submit]');
    await page.waitForSelector('#amostra-item-num-0');
    assert.equal(pedido.documento.modelos.length, 1);
    const model = pedido.documento.modelos[0].id;
    await page.evaluate(async model => {
        await saveAmostraToDB(model, IdGenEditor.chave, { arte_escala_h: 110, arte_escala_v: 95, modo_pdf: true });
        await autoSaveOSItemField(model, IdGenEditor.chave, 'num_inicial', '123');
        const canvas = document.createElement('canvas'); canvas.width = 10; canvas.height = 10;
        canvas.getContext('2d').fillRect(0, 0, 10, 10);
        const blob = await (await fetch(canvas.toDataURL('image/png'))).blob();
        const dt = new DataTransfer(); dt.items.add(new File([blob], 'sintetica.png', { type: 'image/png' }));
        const input = document.getElementById('amostra-item-arte-0'); input.files = dt.files;
        await onItemArteUpload(0, IdGenEditor.chave, model, 'frente');
    }, model);
    assert.match(pedido.documento.modelos[0].arte_url || '', /^data:image\/png;base64,/);
    assert.equal(pedido.documento.modelos[0].numeracao_inicio, 123);
    assert.equal(pedido.documento.modelos[0].arte_escala_h, 110);
    recusarProximoSave = true;
    const revisao = pedido.revisao;
    assert.equal(await page.evaluate(async model => {
        try { await saveAmostraToDB(model, IdGenEditor.chave, { arte_escala_h: 888 }); return false; }
        catch { return state.osItens[IdGenEditor.chave][0].arte_escala_h === 110; }
    }, model), true);
    assert.equal(pedido.revisao, revisao);
    assert.equal(await page.evaluate(async () => {
        try { await IdGenEditor.arquivo(new Blob([new Uint8Array(5 * 1024 * 1024 + 1)]), 'grande.pdf'); return false; }
        catch (e) { return e.message.includes('5 MB'); }
    }), true);
    const bloqueios = await page.evaluate(async () => {
        const out = [];
        for (const url of ['https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/pedidos_modelos', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/artes/test.pdf', '/api/print']) {
            try { await fetch(url, { method: 'POST', body: '{}' }); out.push(false); } catch { out.push(true); }
        }
        return out;
    });
    assert.deepEqual(bloqueios, [true, true, true]);
    await page.click('button[title="Editar Numeração exclusivamente para este Modelo"]');
    await page.waitForFunction(() => document.getElementById('num-formato').value !== '' && document.getElementById('btn-num-voltar').style.display !== 'none');
    await page.$eval('#num-name', e => { e.value = 'Numeração IdGen editada'; });
    await page.click('#btn-num-save');
    await page.waitForFunction(() => IdGenEditor.documento.numeracoes.some(n => n.name === 'Numeração IdGen editada'));
    assert.ok(pedido.documento.numeracoes.some(n => n.name === 'Numeração IdGen editada'));
    await page.evaluate(async () => {
        const cor = state.cores[0];
        await editCor(cor.id); document.getElementById('cor-name').value = 'Azul IdGen'; await saveCor();
        await IdGenEditor.enviarAnexos([new File(['Documento sintético'], 'instrucao.txt', { type: 'text/plain' })]);
        await saveBriefingField(IdGenEditor.pedido(IdGenEditor.chave).numero, 'nome_evento', 'Evento sintético');
        const pdf = await PDFLib.PDFDocument.create(); const folha = pdf.addPage([153, 244]);
        folha.drawRectangle({ x: 20, y: 50, width: 40, height: 20, color: PDFLib.rgb(0, 0, 0) });
        const file = new File([await pdf.save()], 'frentes.pdf', { type: 'application/pdf' });
        await IdGenEditor.importarPdf({ target: { files: [file], value: 'arquivo' } });
    });
    assert.equal(pedido.documento.cores[0].name, 'Azul IdGen');
    assert.equal(pedido.documento.briefing.nome_evento, 'Evento sintético');
    assert.equal(pedido.documento.anexos[0].nome, 'instrucao.txt');
    assert.match(pedido.documento.anexos[0].url, /^data:text\/plain;base64,/);
    assert.match(pedido.documento.modelos[0].arte_url, /^data:application\/pdf;base64,/);
    assert.equal(catalogo.producao_cores[0].name, 'Azul');
    assert.equal(catalogo.producao_numeracoes[0].name, 'Credencial');
    // Reabrir deve ler o documento confirmado, sem depender de caches do navegador.
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#amostra-item-num-0');
    assert.equal(await page.$eval('[id^=briefing-nome-]', e => e.value), 'Evento sintético');
    assert.equal(await page.evaluate(() => state.osItens[IdGenEditor.chave][0].numeracao_inicio), 123);
    assert.equal(await page.$eval('#btn-enviar-link-os-banner', e => getComputedStyle(e).display), 'none');
    await page.$eval('#amostra-item-num-0', e => e.scrollIntoView({ block: 'center' }));
    await page.waitForFunction(() => {
        const c = document.getElementById('amostra-pdf-canvas-0');
        if (!c || !c.width || !c.height || getComputedStyle(c).display === 'none') return false;
        const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        for (let i = 0; i < p.length; i += 4) if (p[i + 3] > 200 && p[i] < 80 && p[i + 1] < 80 && p[i + 2] < 80) return true;
        return false;
    }, { timeout: 20000 });
    assert.deepEqual(rejected, []);
    await page.screenshot({ path: join(evidence, 'editor.png'), fullPage: true });
    // Documento antigo: numeração duplex, categoria ausente no modelo.
    pedido.documento.numeracoes.find(n => n.id === pedido.documento.modelos[0].amostra_num_id).print_mode = 'duplex';
    delete pedido.documento.modelos[0].verso_tipo;
    delete pedido.documento.modelos[0].frente_verso;
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('#amostra-item-num-0');
    assert.equal(await page.evaluate(() => state.osItens[IdGenEditor.chave][0].verso_tipo), 'FRENTE E VERSO');
    assert.equal(await page.evaluate(() => document.getElementById('amostras-itens-container').innerText.includes('Pedido no Vibe:')), false);
    await page.click('button[title="Editar Numeração exclusivamente para este Modelo"]');
    await page.waitForFunction(() => state.numFormato && document.getElementById('btn-num-voltar').style.display !== 'none');
    assert.equal(await page.$eval('#num-print-mode', e => e.value), 'duplex');
    assert.equal(await page.$eval('#num-print-mode', e => e.validationMessage), '');
    assert.equal(await page.$eval('#num-print-mode option[value=front]', e => e.disabled), false);
    assert.equal(await page.evaluate(() => document.getElementById('view-numeracao').innerText.includes('altere primeiro no Vibe')), false);
    await page.click('#btn-num-save');
    await page.waitForFunction(() => IdGenEditor.documento.modelos[0].verso_tipo === 'FRENTE E VERSO');
    await page.waitForFunction(() => document.getElementById('view-amostras').classList.contains('active') && !window.customNumeracaoEditState);
    assert.equal(pedido.documento.modelos[0].verso_tipo, 'FRENTE E VERSO');
    assert.equal(pedido.documento.modelos[0].frente_verso, true);
    const antesExcluir = pedido.revisao;
    page.once('dialog', d => d.dismiss());
    await page.locator('[data-idgen-excluir]').click();
    assert.equal(pedido.revisao, antesExcluir);
    assert.equal(pedido.documento.modelos.length, 1);
    page.once('dialog', d => d.accept());
    await page.locator('[data-idgen-excluir]').click();
    await page.waitForFunction(() => IdGenEditor.documento.modelos.length === 0);
    assert.equal(pedido.documento.modelos.length, 0);
    assert.equal(pedido.documento.anexos.length, 1);
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForFunction(() => IdGenEditor.ativo && IdGenEditor.documento.modelos.length === 0);
    await writeFile(join(evidence, 'resultado.json'), JSON.stringify({ errors, rejected, writes: writes.length }, null, 2));
    assert.deepEqual(errors, []);
    console.log('PASS shared editor: model, attributes, numbering, color, briefing, private art/attachment/PDF import, reload, legacy guard. Evidence:', evidence);
} catch (e) {
    console.error('Browser errors:', errors);
    console.error('Evidence:', evidence);
    const pages = await browser.pages(); await pages.at(-1)?.screenshot({ path: join(evidence, 'falha.png'), fullPage: true });
    await writeFile(join(evidence, 'pagina.txt'), await pages.at(-1).evaluate(() => document.body.innerText));
    await writeFile(join(evidence, 'estado.json'), JSON.stringify(await pages.at(-1).evaluate(() => ({ formatos: state.formatos, nums: state.numeracoes, campo: document.getElementById('num-formato')?.value, opcoes: document.getElementById('num-formato')?.innerHTML, nome: document.getElementById('num-name')?.value, documento: window.IdGenEditor?.documento })), null, 2));
    throw e;
} finally { await browser.close(); }
