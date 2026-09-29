// Funções de produção, rede simulada e pixels reais. Nenhum dado comercial.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
function extract(name, source = src) {
    const i = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name);
    return source.slice(i, source.indexOf('\n}', i) + 2);
}
const tick = () => new Promise(r => setImmediate(r));

async function loads() {
    let release, queries = 0;
    let gate = new Promise(r => { release = r; });
    const old = [{ id: 7, arte_url: 'arte-anterior.pdf' }];
    const ctx = { state: { osItens: { os1: old } }, console: { error() {}, warn() {} },
        setTimeout, clearTimeout, AbortController, toast() {},
        findOSInState: () => ({ id: 'os1', numero: 1 }),
        supabaseClient: { from() {
            const q = { select() { return q; }, eq() { return q; }, order() { return q; },
                then(resolve) { queries++; return gate.then(() => resolve({ error: Error('Offline') })); } };
            return q;
        } }
    };
    vm.createContext(ctx);
    vm.runInContext(extract('lerDadosLista') + extract('loadOSItens'), ctx);
    let finished = 0;
    const a = ctx.loadOSItens('os1', { obrigatorio: true }).catch(e => { finished++; return e; });
    const b = ctx.loadOSItens('1', { obrigatorio: true }).catch(e => { finished++; return e; });
    await tick();
    assert.equal(finished, 0); assert.equal(queries, 2);
    release();
    const results = await Promise.all([a, b]);
    assert.equal(results[0], results[1]); assert.equal(finished, 2);
    assert.equal(ctx.state.osItens.os1, old);
    assert.equal(ctx.state._loadingOSItens.os1, false);
    await ctx.loadOSItens('os1'); assert.equal(queries, 4, 'nova tentativa não fica presa');

    let late;
    gate = new Promise(r => { late = r; });
    const read = ctx.lerDadosLista;
    ctx.lerDadosLista = (q, etapa) => read(q, etapa, 5);
    await assert.rejects(ctx.loadOSItens('os1', { obrigatorio: true }), /demorou/);
    assert.equal(ctx.state._loadingOSItens.os1, false);
    late(); await tick();
    assert.equal(ctx.state.osItens.os1, old);

    // Timeout inclui corpo HTTP e aborta antes de tentar o proxy.
    let attempts = 0, aborts = 0;
    const network = { setTimeout, clearTimeout, AbortController, atob,
        urlDoProxy: () => 'https://synthetic.invalid/proxy',
        fetch: async (_, { signal }) => {
            attempts++; signal.addEventListener('abort', () => aborts++);
            return { ok: true, arrayBuffer: () => new Promise(() => {}) };
        } };
    vm.createContext(network); vm.runInContext(extract('fetchPdfBytes'), network);
    await assert.rejects(network.fetchPdfBytes('https://synthetic.invalid/arte.pdf', { prazoMs: 5 }), /demorou/);
    assert.equal(attempts, 2); assert.equal(aborts, 2);
    console.log('PASS: carga compartilhada, erro propagado, cache preservado, prazo e abort do download');
}

async function browserTests() {
    const browser = await puppeteer.launch({ headless: true });
    try {
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', r => r.url().startsWith('data:') ? r.continue() : r.abort());
        await page.setContent('<main id="amostras-itens-container" data-amostras-os-id="os1"></main>');
        const functions = ['aguardarRecursoDaPrevia', 'executarRasterDaPrevia', 'rasterDaAmostra', 'drawAmostraFace',
            'mostrarCargaDaPrevia', 'renderItemAmostraCombinada', 'desenharItemAmostraCombinada',
            'preloadAmostraItemPdfElements', 'pdfDuplicarParaVersoDoModelo', 'escalaDaArteDoModelo',
            'modelosForaDoPdfProva', 'travarCardsDeModelosAprovados'];
        await page.addScriptTag({ content: functions.map(n => extract(n)).join('\n') });
        // Fixar a base anterior evita comparar o renderizador consigo mesmo depois do commit.
        const baseline = execFileSync('git', ['show', '7f52fc938413f164cc1c136e15104d412dfcb932:frontend/script.js'], { cwd: root, encoding: 'utf8', maxBuffer: 8e6 });
        await page.addScriptTag({ content: extract('drawAmostraFace', baseline).replace('function drawAmostraFace(', 'function drawBaseline(') });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend/amostra-modal.js'), 'utf8') });
        const result = await page.evaluate(async () => {
            let checks = 0;
            const ok = (condition, msg) => { checks++; if (!condition) throw Error(msg); };
            const container = document.querySelector('main');
            const card = i => `<h3 id="amostra-item-header-${i}">Modelo ${i}</h3><canvas id="amostra-item-canvas-${i}"></canvas><div id="amostra-item-empty-${i}"></div>`;
            container.innerHTML = card(0);
            const item = { id: 1, _dbLoaded: true, arte_url: 'https://synthetic.invalid/arte.pdf', _needsSnapshot: true };
            window.state = { osItens: { os1: [item] }, cores: [], numeracoes: [] };
            window.ESCALA_ARTE_MIN = 1; window.ESCALA_ARTE_MAX = 400;
            window.garantirFontesCarregadas = async () => {};
            window.fontesDosElementos = () => [];
            window.garantirPdfDaCor = async () => {};
            window.isNumeracaoDuplex = () => false;
            window.resolverNumeracaoParaModelo = n => n;
            window.formatoDoModelo = () => ({ width_mm: 50, height_mm: 30 });
            window.rotuloDoModelo = (_, i) => 'Modelo ' + i;
            window.podeDestravarModeloAprovado = () => false;
            window.podeCopiarDeModeloAprovado = () => false;
            for (const n of ['atualizarNavCsvDaAmostra', 'atualizarBotoesCsvDaAmostra', 'atualizarCaixaDeEscalaDaArte']) window[n] = () => {};
            let snapshots = 0, fail = false, downloads = 0, destroyed = 0;
            window.snapshotAmostraAndUpload = () => { snapshots++; };
            window.fetchPdfBytes = async () => { downloads++; if (fail) throw Error('HTTP 503'); return new Uint8Array([1]).buffer; };
            window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument: () => ({
                destroy: async () => { destroyed++; }, promise: Promise.resolve({ numPages: 2,
                    getPage: async n => ({ getViewport: ({ scale }) => ({ width: 100 * scale, height: 60 * scale }),
                        render: ({ canvasContext: ctx }) => {
                            ctx.fillStyle = n === 2 ? '#00ff00' : '#ff0000';
                            ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
                            return { promise: Promise.resolve(), cancel() {} };
                        } }) }) }) };
            const canvas = document.querySelector('canvas');
            canvas.width = 80; canvas.height = 40;
            canvas.getContext('2d').fillStyle = '#0000ff'; canvas.getContext('2d').fillRect(0, 0, 80, 40);
            const previous = canvas.toDataURL();
            fail = true;
            abrirAmostraModal(0, 'os1');
            const running = renderItemAmostraCombinada.fila.trabalhos.get('os1:0').promessa;
            ok(document.querySelector('#am-corpo').textContent.includes('Carregando'), 'modal mostra espera');
            ok(await running === false, 'falha comunicada');
            ok(downloads === 2, 'uma recuperação automática, sem loop');
            ok(canvas.toDataURL() === previous, 'falha preserva último bitmap completo');
            ok(snapshots === 0 && item._needsSnapshot, 'falha não agenda snapshot nem consome edição');
            ok(document.querySelector('[data-amostra-carga]').dataset.estado === 'erro', 'estado no card');
            ok(document.querySelector('#am-corpo').textContent.includes('Tentar novamente'), 'recuperação no modal');
            ok(!document.querySelector('#am-corpo img'), 'modal não apresenta bitmap antigo como atual');
            ok(modelosForaDoPdfProva([item], container).length === 1, 'PDF Prova reconhece a falha mesmo com bitmap anterior');
            const approved = document.createElement('div');
            approved.dataset.modeloAprovado = '1';
            const retry = document.querySelector('[data-recarregar-previa]');
            const edit = document.createElement('input');
            retry.parentNode.appendChild(approved); approved.appendChild(retry); approved.appendChild(edit);
            travarCardsDeModelosAprovados(container);
            ok(!retry.disabled && edit.disabled, 'retry é leitura; edição de aprovado continua bloqueada');
            // Devolver o botão ao aviso para os próximos estados do mesmo card.
            approved.parentNode.appendChild(retry); approved.remove();
            fail = false;
            document.querySelector('#am-corpo button').click();
            await renderItemAmostraCombinada.fila.trabalhos.get('os1:0').promessa;
            ok(document.querySelector('[data-amostra-carga]').dataset.estado === 'pronto', 'retry manual recupera');
            ok(!!document.querySelector('#am-corpo img'), 'modal recebe composição completa');
            ok(modelosForaDoPdfProva([item], container).length === 0, 'PDF Prova liberado após recuperação');
            clearTimeout(item._snapshotTimer);
            ok(!item._needsSnapshot, 'snapshot permitido apenas depois da composição');
            AmostraModal.fechar();

            // Equivalência pixel a pixel com a base: arte + cor, frente/verso e escala.
            const cor = { id: 'c', pdf_base64: btoa('synthetic') };
            for (const face of ['front', 'back']) {
                for (const scale of [100, 150]) {
                    item.arte_escala_h = scale; item.arte_escala_v = 75;
                    item.verso_arte_url = item.arte_url;
                    const old = document.createElement('canvas'), current = document.createElement('canvas');
                    await drawBaseline(item, face, old, null, formatoDoModelo(), cor, null, 0, 'os1', 2);
                    await drawAmostraFace(item, face, current, null, formatoDoModelo(), cor, null, 0, 'os1', 2);
                    ok(old.toDataURL() === current.toDataURL(), 'pixels preservados: ' + face + '/' + scale);
                }
            }
            ok(destroyed > 0, 'documentos liberados');

            // Navegar durante a espera de fonte nao pode pintar no destino antigo.
            const staleCanvas = document.createElement('canvas');
            staleCanvas.width = 20; staleCanvas.height = 20;
            staleCanvas.getContext('2d').fillRect(0, 0, 20, 20);
            const stalePixels = staleCanvas.toDataURL();
            const fontsBefore = window.garantirFontesCarregadas;
            let currentJob = true, releaseFont;
            window.garantirFontesCarregadas = () => new Promise(r => { releaseFont = r; });
            const staleJob = drawAmostraFace(item, 'front', staleCanvas, null, formatoDoModelo(), cor, null, 0, 'os1', 2, () => currentJob);
            currentJob = false; releaseFont(); await staleJob;
            window.garantirFontesCarregadas = fontsBefore;
            ok(staleCanvas.toDataURL() === stalePixels, 'navegacao invalida o desenho antes de tocar no destino');

            // PDF de elemento: falha não fica permanente; dois modelos aguardam a mesma carga.
            const el = { type: 'PDF', pdf_content: 'https://synthetic.invalid/elemento.pdf', _preloadFalhou: true };
            let release;
            const before = downloads;
            window.fetchPdfBytes = () => { downloads++; return new Promise(r => { release = r; }); };
            const one = preloadAmostraItemPdfElements({ elements: [el] }, 0, 'os1', item);
            const two = preloadAmostraItemPdfElements({ elements: [el] }, 1, 'os1', item);
            release(new Uint8Array([1]).buffer); await Promise.all([one, two]);
            ok(downloads === before + 1 && el._pdfCanvas && !el._preloadFalhou, 'elemento compartilhado recupera');

            // Concorrência e navegação tardia, usando coordenador real com desenho controlado.
            renderItemAmostraCombinada.fila = null;
            container.innerHTML = Array.from({ length: 5 }, (_, i) => card(i)).join('');
            state.osItens.os1 = Array.from({ length: 5 }, (_, i) => ({ id: i }));
            let active = 0, peak = 0, started = 0;
            const releases = [];
            window.desenharItemAmostraCombinada = async () => {
                started++; active++; peak = Math.max(peak, active);
                await new Promise(r => releases.push(r)); active--;
            };
            const jobs = state.osItens.os1.map((_, i) => renderItemAmostraCombinada(i, 'os1'));
            ok(started === 5, 'esperas de recursos nao ocupam as vagas de rasterizacao');
            container.dataset.amostrasOsId = 'outro';
            releases.splice(0).forEach(r => r());
            await Promise.all(jobs);
            ok(started === 5 && peak === 5, 'recursos independentes aguardados sem bloquear os demais');
            ok(renderItemAmostraCombinada.fila.trabalhos.size === 0, 'trabalhos antigos removidos');
            container.dataset.amostrasOsId = 'os1';
            let calls = 0, unblock;
            window.desenharItemAmostraCombinada = async () => {
                calls++;
                if (calls === 1) await new Promise(r => { unblock = r; });
            };
            const first = renderItemAmostraCombinada(0, 'os1');
            const second = renderItemAmostraCombinada(0, 'os1');
            const third = renderItemAmostraCombinada(0, 'os1');
            ok(calls === 1, 'solicitações do mesmo modelo não desenham em paralelo');
            unblock(); await Promise.all([first, second, third]);
            ok(calls === 2, 'alterações em voo geram apenas um repinte final');
            return checks;
        });
        assert.deepEqual(errors, []);
        console.log('PASS browser:', result, 'verificações de recuperação, modal, fidelidade e concorrência');
    } finally { await browser.close(); }
}
(async () => { await loads(); await browserTests(); })().catch(e => { console.error(e); process.exitCode = 1; });
