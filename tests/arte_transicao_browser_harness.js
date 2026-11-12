// Duas abas Chromium, funcoes reais e transporte RPC simulado. Sem rede externa.
// A implementacao SQL/concorrencia real e exercitada por arte_transicao_postgres.py.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function fn(name) {
    const start = source.indexOf('async function ' + name + '(');
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const browser = await puppeteer.launch({ headless: true });
    let rev = 1, status = 'Em Alteração', calls = 0, release;
    const started = new Promise(resolve => { release = resolve; });
    let unblock;
    const blocked = new Promise(resolve => { unblock = resolve; });
    try {
        const pages = await Promise.all([browser.newPage(), browser.newPage()]);
        for (const [i, page] of pages.entries()) {
            await page.setRequestInterception(true);
            page.on('request', request => request.abort());
            await page.exposeFunction('transport', async (name, args) => {
                calls++;
                if (name === 'arte_transicao_ler') return { data: { revisao: String(rev) } };
                if (i === 0) { release(); await blocked; }
                if (args.p_revisao !== String(rev)) return { error: { code: '40001', message: 'O pedido mudou em outra tela' } };
                status = args.p_acao === 'pronto' ? 'Enviar Arte' : status;
                rev++;
                return { data: { confirmado: true, status, enviar: status === 'Enviar Arte', arte_pronta_em: '2026-01-01T12:00:00Z' } };
            });
            await page.evaluate(code => {
                window.state = { ordens: [{ id: 'vibe_1', numero: 1, status: 'Em Alteração' }],
                    todasArtes: [{ id_int: 1, status: 'Em Alteração' }],
                    modelosGlobais: { 1: [{ id: 1, status_arte: 'REPROVADA_CLIENTE' }] },
                    linksClienteData: { vibe_1: { status_arte: 'Em Alteração' } } };
                window.supabaseClient = { rpc: window.transport, from() { throw Error('PATCH direto proibido'); } };
                window.overrides = [];
                window.gravarStatusOverride = (...args) => overrides.push(args);
                (0, eval)(code);
            }, ['confirmarTransicaoDaArte', 'sincronizarStatusConsolidadoPedidoArte',
                'sincronizarStatusOrdensDinamico', 'sincronizarPedidosProntosParaEnvio',
                'reconciliarStatusPersistidosDaListaArte'].map(fn).join('\n'));
        }
        const stale = pages[0].evaluate(async () => {
            try { await sincronizarStatusConsolidadoPedidoArte(1, state.modelosGlobais[1]); return 'sucesso indevido'; }
            catch (e) { return e.message; }
        });
        await started;
        await pages[1].evaluate(() => confirmarTransicaoDaArte(1, 'pronto', 1, 'alterado'));
        assert.equal(status, 'Enviar Arte');
        unblock();
        assert.match(await stale, /outra tela/);
        const before = calls;
        await pages[0].evaluate(async () => {
            await sincronizarStatusOrdensDinamico();
            await sincronizarPedidosProntosParaEnvio();
            await reconciliarStatusPersistidosDaListaArte();
        });
        assert.equal(calls, before, 'atualizar a aba antiga nao decide nada no servidor');
        assert.equal(status, 'Enviar Arte');
        assert.equal(await pages[0].evaluate(() => overrides.length), 0, 'conflito nao anuncia sucesso local');
        assert.equal(await pages[1].evaluate(() => state.linksClienteData.vibe_1.arte_pronta_em), '2026-01-01T12:00:00Z');
        // Uma resposta sem recibo tambem nao pode virar sucesso.
        await pages[1].evaluate(() => { supabaseClient.rpc = async () => ({ data: null }); });
        const missing = await pages[1].evaluate(async () => {
            try { await confirmarTransicaoDaArte(1, 'pronto', 1); return ''; } catch (e) { return e.message; }
        });
        assert.match(missing, /nao confirmada/);
        console.log('OK: duas abas, conflito sem retry, carga sem escrita, carimbo confirmado e recibo ausente.');
    } finally { unblock?.(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
