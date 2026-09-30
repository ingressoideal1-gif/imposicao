// Diagnóstico de rede com HTTP local e funções reais; nenhum serviço de produção.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), puppeteer = require('puppeteer');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'frontend/supabase-config.js'), 'utf8');
function extract(name, text = source) {
    const i = text.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name);
    return text.slice(i, text.indexOf('\n}', i) + 2);
}
(async () => {
    const requests = [];
    const server = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://localhost'); requests.push(url.pathname);
        if (url.pathname === '/') { res.end('<!doctype html><body>Teste sintético</body>'); return; }
        if (url.pathname === '/corpo.pdf') {
            res.writeHead(200, { 'Content-Type': 'application/pdf' }); res.flushHeaders();
            setTimeout(() => { if (!res.destroyed) res.end('ARTE_SINTETICA'); }, 350); return;
        }
        if (url.pathname === '/headers.pdf') {
            setTimeout(() => { if (!res.destroyed) res.end('ARTE_SINTETICA'); }, 350); return;
        }
        if (url.pathname === '/api/proxy') { res.end('ARTE_SINTETICA'); return; }
        if (url.pathname === '/api/propostas/consultar') {
            res.writeHead(200, { 'Content-Type': 'application/json' }); res.flushHeaders();
            setTimeout(() => res.end('[{"nome":"DADO_NAO_EXPORTAR"}]'), 50); return;
        }
        if (url.pathname === '/falha.pdf') { res.writeHead(503); res.end('ERRO_NAO_EXPORTAR'); return; }
        res.end('ARTE_SINTETICA');
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const origin = 'http://127.0.0.1:' + server.address().port;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.setRequestInterception(true);
        page.on('request', req => {
            if (req.url().startsWith(origin + '/')) return req.continue();
            if (req.url().startsWith('https://synthetic.supabase.co/rest/v1/')) return req.respond({
                status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: '[]' });
            if (req.url().startsWith('https://synthetic.supabase.co/functions/v1/')) return req.respond({
                status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: 'ARTE_SINTETICA' });
            req.abort();
        });
        await page.goto(origin + '/?diagnostico_artes=1');
        await page.addScriptTag({ content: `const SERVIDA_PELA_NUVEM = false; const API_PAINEL = location.origin;
            const state = {}; const supabaseClient = {auth:{getSession:async()=>({data:{session:{access_token:'TOKEN_SINTETICO_NAO_EXPORTAR'}}})}};
            window._currentUser={id:'IDENTIDADE_NAO_EXPORTAR'}; window._currentPerms={role:'designer'};
            ${extract('urlDoProxy', config)} ${extract('requisitarPropostas', config)}
            ${extract('fetchPdfBytes')} ${extract('lerDadosLista')}` });
        await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'frontend/diagnostico-artes.js'), 'utf8') });
        const checks = await page.evaluate(async () => {
            let checks = 0;
            const ok = (test, msg) => { checks++; if (!test) throw Error(msg); };
            const api = DiagnosticoArtes, options = { participante: 'sintetico', estacao: 'rede-a' };
            const originals = { fetch, json: Response.prototype.json, text: Response.prototype.text, arrayBuffer: Response.prototype.arrayBuffer };
            const caminho = p => location.origin + p + '?cliente=DADO_NAO_EXPORTAR&token=TOKEN_SINTETICO_NAO_EXPORTAR';
            ok(api.iniciar(options), 'iniciar diagnóstico detalhado');
            ok(api.relatorio().esquema === 2 && document.querySelector('#diagnostico-artes summary').textContent.endsWith('v2'), 'versão detalhada identificada no painel e no JSON');
            // Headers chegam, corpo não termina; limite aborta e caminho alternativo recupera.
            const corpo = await fetchPdfBytes(caminho('/corpo.pdf'), { prazoMs: 100 });
            ok(new TextDecoder().decode(corpo) === 'ARTE_SINTETICA', 'bytes devolvidos intactos após fallback');
            let events = api.relatorio().eventos;
            const bodyAbort = events.find(e => e.tipo === 'http_corpo' && e.resultado === 'cancelado');
            ok(bodyAbort && bodyAbort.duracao_ms >= 70, 'identifica espera no corpo abortada');
            ok(events.some(e => e.tipo === 'http_headers' && e.rota === 'arquivo_outro_direto' && e.status_http === 200), 'recebimento de headers direto identificado');
            ok(events.some(e => e.tipo === 'fallback_arquivo' && e.arquivo_ref === bodyAbort.arquivo_ref), 'fallback ligado ao mesmo arquivo anônimo');
            ok(events.some(e => e.tipo === 'http_corpo' && e.rota === 'proxy_mesma_origem' && e.arquivo_ref === bodyAbort.arquivo_ref && e.resultado === 'concluido'), 'recuperação pelo proxy comprovada');

            await fetchPdfBytes(caminho('/headers.pdf'), { prazoMs: 100 });
            events = api.relatorio().eventos;
            ok(events.some(e => e.tipo === 'http_headers' && e.resultado === 'cancelado' && e.duracao_ms >= 70), 'separa espera anterior aos headers');
            const dados = await requisitarPropostas('consultar', { tipo: 'nome', nome: 'DADO_NAO_EXPORTAR' });
            ok(dados[0].nome === 'DADO_NAO_EXPORTAR', 'JSON original preservado');
            ok(api.relatorio().eventos.some(e => e.tipo === 'http_corpo' && e.rota === 'propostas' && e.leitura === 'json' && e.duracao_ms >= 30), 'mede corpo JSON sem copiá-lo');
            ok(api.relatorio().eventos.some(e => e.tipo === 'consulta_propostas' && e.consulta === 'nome' && e.linhas === 1), 'consulta identificada sem nome pesquisado');
            await lerDadosLista(Promise.resolve({ data: [1, 2] }), 'dados do ERP');
            ok(api.relatorio().eventos.some(e => e.tipo === 'resposta_consulta' && e.etapa === 'dados do ERP' && e.linhas === 2), 'identifica etapa de consulta da lista');

            const resposta = await fetch('https://synthetic.supabase.co/rest/v1/pedidos_modelos?cliente=DADO_NAO_EXPORTAR');
            const clone = resposta.clone();
            ok(Array.isArray(await resposta.json()) && await clone.text() === '[]', 'Response e clone continuam válidos');
            ok(api.relatorio().eventos.some(e => e.tipo === 'http_headers' && e.tabela === 'pedidos_modelos'), 'identifica tabela permitida sem filtros');
            await new Promise(resolve => setTimeout(resolve, 80));
            ok(api.relatorio().eventos.some(e => e.tipo === 'recurso' && e.tabela === 'pedidos_modelos' && !e.timing_detalhado && e.espera_primeiro_byte_ms === null), 'timing oculto entre origens não vira latência zero');
            ok(api.relatorio().eventos.some(e => e.tipo === 'recurso' && e.rota === 'propostas' && e.timing_detalhado && e.transferencia_ms >= 30), 'timing disponível separa transferência');
            const cloud = await fetch('https://synthetic.supabase.co/functions/v1/arquivo/api/proxy?url=' + encodeURIComponent(caminho('/corpo.pdf')));
            await cloud.arrayBuffer();
            ok(api.relatorio().eventos.some(e => e.tipo === 'http_corpo' && e.rota === 'proxy_nuvem' && e.arquivo_ref === bodyAbort.arquivo_ref), 'rota real de proxy em nuvem vinculada ao arquivo');
            const falha = await fetchPdfBytes(caminho('/falha.pdf'), { prazoMs: 100 });
            ok(falha.byteLength > 0 && api.relatorio().eventos.some(e => e.status_http === 503 && e.resultado === 'http_erro'), 'status HTTP da falha não é escondido pelo sucesso final');

            // A instrumentação não consome corpo nem cancela leitura ao encerrar.
            const naoLida = await fetch(caminho('/corpo.pdf'));
            ok(!naoLida.bodyUsed, 'diagnóstico não lê corpo por conta própria');
            const pendingBody = naoLida.arrayBuffer();
            api.parar();
            ok(api.relatorio().eventos.some(e => e.etapa === 'http_corpo' && e.resultado === 'pendente_ao_encerrar' && e.requisicao), 'leitura pendente mantém identificação');
            ok(fetch === originals.fetch && Response.prototype.json === originals.json && Response.prototype.text === originals.text && Response.prototype.arrayBuffer === originals.arrayBuffer, 'restaura fetch e todos os métodos de Response');
            api.iniciar(options);
            await pendingBody;
            ok(!api.relatorio().eventos.some(e => e.tipo === 'http_corpo'), 'leitura anterior não contamina nova coleta');
            api.parar();
            return { checks, report: events, final: api.relatorio() };
        });
        assert.deepEqual(errors, []);
        assert(!/DADO_NAO_EXPORTAR|TOKEN_SINTETICO|IDENTIDADE_NAO_EXPORTAR|ARTE_SINTETICA|ERRO_NAO_EXPORTAR|https?:\/\//.test(JSON.stringify(checks)), 'relatório sem nomes, URLs, tokens ou conteúdo');
        assert.equal(requests.filter(p => p === '/api/proxy').length, 3, 'somente fallbacks da função original, sem downloads extras');
        console.log(`PASS: ${checks.checks + 3} verificações de rede, corpo, fallback, privacidade e restauração`);
    } finally {
        if (browser) await browser.close();
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
