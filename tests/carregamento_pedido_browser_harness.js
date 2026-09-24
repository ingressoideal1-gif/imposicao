// Código real de abertura, navegador real, transporte e periféricos simulados.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const puppeteer = require('puppeteer');
const src = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8');
function func(nome) {
    const start = src.indexOf('async function ' + nome + '(');
    return src.slice(start, src.indexOf('\n}', start) + 2);
}
(async () => {
    const server = http.createServer((_, res) => res.end('<!doctype html><select id="ped-numeracao"><option value="n1">N1</option></select>'));
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true });
        const page = await browser.newPage();
        await page.goto('http://127.0.0.1:' + server.address().port);
        await page.addScriptTag({ content: func('enviarParaPedido') + '\n' + func('carregarModeloParaPedido') + '\n' + func('executarPedImposition') });
        const resultado = await page.evaluate(async () => {
            const avisos = [];
            Object.assign(window, {
                state: { osItens: { os: [{ id: 1, arte_url: 'https://synthetic.test/a.pdf', amostra_num_id: 'n1' },
                    { id: 2, arte_url: 'https://synthetic.test/b.pdf', amostra_num_id: 'n1' }] }, cores: [] },
                toast: msg => avisos.push(msg), podeAbrirView: () => true,
                limparPreviaEnquantoCarrega() {}, atualizarIndicadorModeloComVerso() {},
                pintarLinhaAberta() {}, moverJanelaParaModelo() {}, showView() {},
                aplicarTravaModoPdf() {}, updatePedSummary() {}, renderPedOSQueue() {},
                guardarPdfDoVersoDaPrevia() {}, globalFuzzyMatch: () => false,
                enviarParaImposicao: async () => {},
                loadPedArtFile: async (file, atual) => { if (atual()) state.pedArtFile = file; },
            });
            let liberar;
            window.fetch = async () => new Promise(resolve => { liberar = resolve; });
            const carga = enviarParaPedido(1, 'os');
            await new Promise(r => setTimeout(r, 850));
            if (!state.pedidoSelecaoCarregando || !liberar) throw Error('abertura não permaneceu pendente');
            await executarPedImposition('pdf');
            if (!avisos.some(m => m.includes('Aguarde'))) throw Error('geração precoce não bloqueada');
            liberar({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => new Blob(['%PDF-sintetico']) });
            await carga;
            if (state.pedidoSelecaoCarregando || !state.pedArtFile) throw Error('prontidão não acompanhou a arte');
            if (document.getElementById('ped-numeracao').value !== 'n1') throw Error('numeração não aguardada');
            window.fetch = async () => ({ ok: false, status: 503 });
            await enviarParaPedido(1, 'os').catch(() => {});
            if (!state.pedidoSelecaoErro) throw Error('erro de carga foi esquecido');
            await executarPedImposition('pdf');
            if (!avisos.at(-1).includes('carregar')) throw Error('erro não bloqueou a próxima tentativa');
            const pendentes = {};
            window.fetch = async url => new Promise(resolve => { pendentes[url] = resolve; });
            const antiga = enviarParaPedido(1, 'os');
            await new Promise(r => setTimeout(r, 850));
            const nova = enviarParaPedido(2, 'os');
            await new Promise(r => setTimeout(r, 850));
            const responder = url => pendentes[url]({ ok: true, headers: new Headers({ 'content-type': 'application/pdf' }), blob: async () => new Blob(['%PDF-' + url]) });
            responder('https://synthetic.test/b.pdf'); await nova;
            responder('https://synthetic.test/a.pdf'); await antiga;
            if (state.activeOSItem.itemId !== 2 || state.pedArtFile.name !== 'b.pdf') throw Error('resposta antiga contaminou seleção');
            return 'clique imediato bloqueado; arte e numeração aguardadas; erro bloqueia; resposta antiga descartada';
        });
        console.log('OK browser Pedido: ' + resultado);
    } finally { if (browser) await browser.close(); server.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
