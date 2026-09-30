// Chromium real, funções de navegação/fila reais e dados sintéticos. Sem acesso externo.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const diagnostic = fs.readFileSync(path.join(root, 'frontend/diagnostico-artes.js'), 'utf8');
function extract(name) {
    const i = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name);
    return source.slice(i, source.indexOf('\n}', i) + 2);
}
const html = `<!doctype html><meta charset="utf-8"><style>
.view-section { display:none } .active { display:block }</style>
<section id="view-lista-arte" class="view-section active"></section>
<section id="view-amostras" class="view-section"><main id="amostras-itens-container"></main></section>`;
(async () => {
    const server = http.createServer((_, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        const errors = [], external = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        const origin = 'http://127.0.0.1:' + server.address().port;
        page.on('request', r => {
            if (r.url().startsWith(origin + '/')) r.continue();
            else { external.push(r.url()); r.abort(); }
        });
        await page.goto(origin);
        await page.addScriptTag({ content: diagnostic });
        assert.equal(await page.evaluate(() => !!window.DiagnosticoArtes || !!document.getElementById('diagnostico-artes')), false);
        await page.goto(origin + '/?diagnostico_artes=1');
        await page.evaluate(() => {
            window.state = { osItens: {}, cores: [{}], numeracoes: [{}] };
            window._currentUser = { id: 'IDENTIDADE_NAO_EXPORTAR' };
            window._currentPerms = { role: 'designer' };
            window.findOSInState = id => ({ id: 'vibe_' + String(id).replace(/^vibe_/, ''), numero: String(id).replace(/^vibe_/, '') });
            window.podeAbrirView = () => true;
            window.toast = () => {};
            window.quantidade = 4;
            window.quantidadeDom = null;
            window.lerDadosLista = q => q;
            window.loadOSItens = async id => {
                const result = await lerDadosLista(Promise.resolve({ data: Array.from({ length: quantidade }, (_, i) => ({ id: i + 1, _dbLoaded: true, arte_url: 'URL_NAO_EXPORTAR' })) }), 'modelos do pedido');
                state.osItens[id] = result.data;
            };
            window.recarregarNumeracoesDoPedido = async () => {};
            window.showView = id => document.querySelectorAll('.view-section').forEach(el => el.classList.toggle('active', el.id === id));
            window.renderAmostrasOSItens = id => {
                const container = document.getElementById('amostras-itens-container');
                container.dataset.amostrasOsId = id;
                container.innerHTML = state.osItens[id].slice(0, quantidadeDom ?? quantidade).map((_, i) =>
                    `<h3 id="amostra-item-header-${i}">Modelo sintético</h3><canvas width="40" height="30" id="amostra-item-canvas-${i}"></canvas>`).join('');
                for (let i = 0; i < container.querySelectorAll('canvas').length; i++) mostrarCargaDaPrevia(container, i, id, 'carregando');
            };
            window.fetchPdfBytes = function () { window.ultimoThis = this; return window.resultadoPdf; };
            window.loadOrdens = () => { throw Error('HTTP 403 MENSAGEM_NAO_EXPORTAR'); };
            window.originalLoad = loadOSItens;
            window.storageAntes = [localStorage.length, sessionStorage.length];
        });
        await page.addScriptTag({ content: ['navigateToAmostrasFromOS', 'mostrarCargaDaPrevia', 'executarRasterDaPrevia', 'rasterDaAmostra'].map(extract).join('\n') });
        await page.addScriptTag({ content: diagnostic });
        const checks = await page.evaluate(async () => {
            let checks = 0;
            const ok = (condition, msg) => { checks++; if (!condition) throw Error(msg); };
            const wait = ms => new Promise(r => setTimeout(r, ms));
            const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const api = DiagnosticoArtes;
            ok(loadOSItens === originalLoad, 'opt-in sem iniciar não envolve funções');
            ok(!api.iniciar({ participante: 'nome@exemplo.invalid', estacao: 'pc-1' }), 'rejeita email como código');
            const options = { participante: 'designer-1', estacao: 'pc-1' };
            ok(api.iniciar(options), 'inicia');
            ok(!api.iniciar(options), 'evita duas coletas simultâneas');
            ok(loadOSItens !== originalLoad, 'instrumentação ativa');
            await navigateToAmostrasFromOS('101');
            await wait(90);
            let report = api.relatorio();
            ok(report.eventos.some(e => e.tipo === 'resposta_consulta' && e.linhas === 4), 'conta resposta sem guardar conteúdo');
            ok(report.eventos.some(e => e.momento === 'apos_carga' && e.no_estado === 4), 'conta modelos recebidos');
            ok(report.eventos.some(e => e.momento === 'apos_montar_cartoes' && e.cartoes_no_dom === 4), 'conta cartões montados');
            const container = document.getElementById('amostras-itens-container');
            mostrarCargaDaPrevia(container, 0, 'vibe_101', 'pronto');
            await frame();
            ok(api.relatorio().aberturas[0].primeira_previa_ms != null, 'primeira prévia visível medida');
            window.resultadoPdf = Promise.resolve('resultado original');
            const receiver = {};
            ok(fetchPdfBytes.call(receiver) === resultadoPdf && ultimoThis === receiver, 'conserva Promise e this');
            window.resultadoPdf = Promise.reject(Error('MENSAGEM_NAO_EXPORTAR timeout'));
            const rejeitada = fetchPdfBytes();
            ok(rejeitada === resultadoPdf, 'conserva identidade da Promise rejeitada');
            await rejeitada.catch(() => {});
            try { loadOrdens(); ok(false, 'deveria lançar'); } catch (e) { ok(e.message.includes('403'), 'conserva exceção síncrona'); }

            // A quantidade parcial vem da leitura e se recupera ao reabrir.
            showView('view-lista-arte'); window.quantidade = 2;
            await navigateToAmostrasFromOS('101'); await wait(90);
            api.registrarFalha();
            showView('view-lista-arte'); window.quantidade = 4;
            await navigateToAmostrasFromOS('101'); await wait(90);
            report = api.relatorio();
            ok(report.aberturas.map(a => a.modelos).join(',') === '4,2,4', 'registra recuperação após reabrir sem F5');
            ok(report.eventos.some(e => e.momento === 'relato_do_operador' && e.no_estado === 2 && e.previas_carregando === 2), 'preserva evidência de travamento');
            // Quatro itens no estado, mas dois cartões: distingue montagem parcial.
            window.quantidadeDom = 2; renderAmostrasOSItens('vibe_101');
            ok(api.relatorio().eventos.some(e => e.no_estado === 4 && e.cartoes_no_dom === 2), 'distingue dado completo e DOM parcial');
            // Canvas tradicional oculto e viewer PDF visível não podem ser ignorados.
            container.querySelector('canvas').style.display = 'none';
            container.insertAdjacentHTML('beforeend', '<canvas id="amostra-pdf-canvas-0" width="30" height="30"></canvas>');
            mostrarCargaDaPrevia(container, 0, 'vibe_101', 'pronto'); await frame();
            ok(api.relatorio().aberturas[2].primeira_previa_ms != null, 'mede viewer PDF visível');

            // Fila real conserva limite de concorrência e cache, mesmo instrumentada.
            let ativos = 0, maximo = 0;
            await Promise.all([0, 1, 2, 3].map(idx => executarRasterDaPrevia(idx, 'vibe_101', async () => {
                ativos++; maximo = Math.max(maximo, ativos); await wait(20); ativos--; return idx;
            })));
            ok(maximo === 2 && executarRasterDaPrevia.fila.ativos === 0, 'limite da fila preservado');
            const fila = executarRasterDaPrevia.fila;
            let renders = 0;
            const cacheArgs = ['sintetico'];
            await rasterDaAmostra(cacheArgs, async () => { renders++; return document.createElement('canvas'); });
            await rasterDaAmostra(cacheArgs, async () => { renders++; return document.createElement('canvas'); });
            ok(renders === 1 && api.relatorio().eventos.some(e => e.tipo === 'cache_raster' && e.reutilizado), 'cache original preservado e medido');
            const cache = rasterDaAmostra.cache;
            let soltar;
            window.resultadoPdf = new Promise(r => { soltar = r; });
            const pendente = fetchPdfBytes();
            api.parar();
            report = api.relatorio();
            ok(report.eventos.some(e => e.etapa === 'obter_pdf' && e.resultado === 'pendente_ao_encerrar'), 'exporta espera inconclusiva');
            ok(loadOSItens === originalLoad && executarRasterDaPrevia.fila === fila && rasterDaAmostra.cache === cache, 'restaura funções conservando cache e fila');
            const json = JSON.stringify(report);
            ok(!/IDENTIDADE_NAO_EXPORTAR|URL_NAO_EXPORTAR|MENSAGEM_NAO_EXPORTAR/.test(json), 'sem identidade, arte ou erro bruto no relatório');
            ok(report.eventos.some(e => e.resultado === 'tempo_excedido') && report.eventos.some(e => e.resultado === 'acesso'), 'classifica falhas');
            ok(JSON.stringify(storageAntes) === JSON.stringify([localStorage.length, sessionStorage.length]), 'não persiste coleta');

            api.iniciar(options); soltar(); await pendente; await wait(0);
            ok(!api.relatorio().eventos.some(e => e.etapa === 'obter_pdf'), 'fim da coleta anterior não contamina a seguinte');
            const originalCriar = URL.createObjectURL, originalClick = HTMLAnchorElement.prototype.click;
            let exported;
            URL.createObjectURL = blob => { exported = blob; return 'blob:sintetico'; };
            HTMLAnchorElement.prototype.click = function () { window.nomeExportado = this.download; };
            api.exportar();
            ok(JSON.parse(await exported.text()).ativo === false && nomeExportado.endsWith('.json'), 'exportação encerra e gera JSON');
            URL.createObjectURL = originalCriar; HTMLAnchorElement.prototype.click = originalClick;
            api.iniciar(options); window._currentUser = { id: 'OUTRA_IDENTIDADE_NAO_EXPORTAR' };
            await loadOSItens('vibe_101');
            ok(api.relatorio().encerramento === 'conta_alterada' && loadOSItens === originalLoad, 'troca de conta encerra instrumentação');

            // Sem APIs opcionais e com prévia fora da tela: não inventar sucesso.
            const observer = window.PerformanceObserver;
            window.PerformanceObserver = undefined;
            api.iniciar(options);
            await navigateToAmostrasFromOS('102'); await wait(90);
            container.style.marginTop = '3000px';
            mostrarCargaDaPrevia(container, 0, 'vibe_102', 'pronto'); await frame();
            ok(api.relatorio().aberturas[0].primeira_previa_ms == null, 'canvas fora da tela não é primeira prévia');
            mostrarCargaDaPrevia(container, 0, 'vibe_102', 'erro');
            api.parar();
            ok(api.relatorio().aberturas[0].resultado === 'falha_sem_previa', 'erro não vira sucesso de abertura');
            ok(api.relatorio().observadores.length === 0, 'funciona sem PerformanceObserver');
            window.PerformanceObserver = observer; container.style.marginTop = '';

            api.iniciar(options);
            for (let i = 0; i < 2100; i++) api.registrarFalha();
            api.parar();
            ok(api.relatorio().eventos.length === 2000 && api.relatorio().descartados > 0, 'buffer limitado');
            return checks;
        });
        assert.deepEqual(errors, []);
        assert.deepEqual(external, []);
        console.log(`PASS: ${checks + 3} verificações do diagnóstico; rede externa bloqueada`);
    } finally {
        if (browser) await browser.close();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
