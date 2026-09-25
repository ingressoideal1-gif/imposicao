const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto').webcrypto;
const fonte = fs.readFileSync(path.join(__dirname, '../frontend/arte-de-impressao.js'), 'utf8');

async function casos() {
    let total = 0;
    function ok(cond, msg) { if (!cond) throw Error(msg); total++; }
    async function recusa(fn, texto) {
        let erro;
        try { await fn(); } catch (e) { erro = e; }
        ok(erro && erro.message.includes(texto), 'Recusa esperada: ' + texto + '; recebido ' + erro?.message);
    }
    const arte = new Blob(['%PDF-1.4\nsynthetic'], { type: 'application/pdf' });
    function montar({ frente = 'https://synthetic.test/front', verso = 'https://synthetic.test/back', numeracao = true } = {}) {
        const num = { id: 'n1', elements: [], print_mode: 'duplex', tipo: 'SEQUENCIAL' };
        const modelo = { id: 1, id_int: 123, quantidade: 3, bloco: '1', arte_url: frente,
            verso_arte_url: verso, amostra_num_id: numeracao ? 'n1' : null };
        const estado = { activeOSItem: { itemId: 1, osId: 'os' }, selectedOSItems: [],
            osItens: { os: [{ ...modelo, qtd: 3 }] }, numeracoes: numeracao ? [structuredClone(num)] : [],
            cores: [], vinculosDeBanco: {}, bancosDoPedido: [] };
        const dados = { modelo: 1, formato: {}, saida: {}, print_mode: 'duplex',
            numeracao_id: numeracao ? 'n1' : null, numeracao: numeracao ? structuredClone(num) : null };
        const fd = new FormData(); fd.set('payload', JSON.stringify(dados));
        let mudarConsulta = null;
        const cliente = { from(tabela) { return { select() { return this; }, in() { return this; },
            async abortSignal() {
                if (mudarConsulta) return mudarConsulta(tabela);
                return { data: [structuredClone(tabela === 'pedidos_modelos' ? modelo : num)], error: null };
            } }; } };
        globalThis.chamarBancosPedido = async () => ({ bancos: [], vinculos: [] });
        globalThis.fetch = async url => url.endsWith('/api/version')
            ? { ok: true, json: async () => ({ capabilities: ['integridade_impressao_v1'] }) }
            : { ok: true, blob: async () => arte };
        return { estado, modelo, num, fd, cliente, mudar(fn) { mudarConsulta = fn; },
            executar() { return confirmarIntegridadeDoTrabalho(fd, 'http://localhost', estado, cliente); } };
    }
    {
        const c = montar(); await c.executar();
        const p = JSON.parse(c.fd.get('payload'));
        ok(p.integridade.faces[0].front && p.integridade.faces[0].back, 'ambas as artes confirmadas');
        ok(p.integridade.arquivos.file.sha256.length === 64, 'hash vincula os bytes');
    }
    {
        const c = montar({ frente: null, numeracao: false });
        c.fd.set('file', arte, 'residual.pdf'); await c.executar();
        ok(!c.fd.has('file') && c.fd.has('file_verso'), 'frente vazia legítima não herda arte anterior');
    }
    {
        const c = montar(); c.mudar(() => ({ data: [], error: null }));
        await recusa(() => c.executar(), 'Consulta incompleta');
    }
    {
        const c = montar(); c.estado.numeracoes = [];
        await recusa(() => c.executar(), 'numeração mudou');
    }
    {
        const c = montar(); c.estado.numeracoes[0].elements = [{ type: 'TEXT' }];
        await recusa(() => c.executar(), 'numeração mudou');
    }
    {
        const c = montar(); delete c.estado.numeracoes[0].elements;
        await recusa(() => c.executar(), 'numeração mudou');
    }
    function comElementoGrafico() {
        const c = montar();
        c.num.elements = [{ type: 'PDF', face: 'front', render_mode: 'print',
            pdf_content: 'data:application/pdf;base64,JVBERi0=', x_mm: 10, _centerAnchor: true }];
        c.estado.numeracoes[0].elements = structuredClone(c.num.elements);
        const payload = JSON.parse(c.fd.get('payload'));
        payload.numeracao = structuredClone(c.num);
        c.fd.set('payload', JSON.stringify(payload));
        return c;
    }
    for (const campo of ['_pdfCanvas', '_pdfLoading', '_svgImage', '_svgLoading',
        '_pdfPreview', '_preloadFalhou', '_assinantes']) {
        const c = comElementoGrafico();
        const temporario = campo === '_pdfCanvas' && typeof document !== 'undefined'
            ? document.createElement('canvas') : {};
        if (campo === '_assinantes') temporario.circular = temporario;
        c.estado.numeracoes[0].elements[0][campo] = temporario;
        await c.executar();
        ok(c.estado.numeracoes[0].elements[0][campo] === temporario,
            'cache de previa nao altera cadastro nem e removido: ' + campo);
    }
    for (const campo of ['pdf_content', 'x_mm', '_centerAnchor', 'face', 'render_mode']) {
        const c = comElementoGrafico();
        c.estado.numeracoes[0].elements[0]._pdfCanvas = {};
        c.estado.numeracoes[0].elements[0][campo] = 'divergente';
        await recusa(() => c.executar(), 'numeração mudou');
    }
    {
        const c = comElementoGrafico();
        c.estado.numeracoes[0].elements[0]._pdfCanvas = {};
        const payload = JSON.parse(c.fd.get('payload'));
        delete payload.numeracao.elements[0].pdf_content;
        c.fd.set('payload', JSON.stringify(payload));
        await recusa(() => c.executar(), 'Elementos de numeração');
    }
    {
        const c = montar(); c.modelo.arte_url = 'https://synthetic.test/changed';
        await recusa(() => c.executar(), 'configuração do modelo mudou');
    }
    {
        const c = montar(); const original = fetch;
        globalThis.fetch = async u => u.endsWith('/api/version') ? original(u) : { ok: false };
        await recusa(() => c.executar(), 'arte obrigatória');
    }
    {
        const c = montar(); const original = fetch;
        globalThis.fetch = async u => u.endsWith('/api/version') ? original(u) : { ok: true, blob: async () => new Blob(['<html>erro</html>']) };
        await recusa(() => c.executar(), 'Arte inválida');
    }
    {
        const c = montar(); let liberar;
        const bloqueio = new Promise(resolve => { liberar = resolve; }); const original = fetch;
        globalThis.fetch = async u => { if (!u.endsWith('/api/version')) await bloqueio; return original(u); };
        let terminou = false;
        const tarefa = c.executar().then(() => { terminou = true; });
        await new Promise(r => setTimeout(r, 20)); ok(!terminou, 'não libera durante download pendente');
        liberar(); await tarefa; ok(terminou, 'libera somente após download');
    }
    {
        const c = montar(); const original = fetch;
        globalThis.fetch = async u => { if (!u.endsWith('/api/version')) c.estado.activeOSItem = { itemId: 2 }; return original(u); };
        await recusa(() => c.executar(), 'seleção mudou');
    }
    {
        const c = montar(); const original = fetch;
        globalThis.fetch = async u => { if (!u.endsWith('/api/version')) c.modelo.quantidade = 4; return original(u); };
        await recusa(() => c.executar(), 'dados mudaram');
    }
    {
        const c = montar(); globalThis.fetch = async () => ({ ok: true, json: async () => ({ capabilities: [] }) });
        await recusa(() => c.executar(), 'Atualize o NewProd');
    }
    {
        const conferir = criarConferenciaStream();
        const bytes = new Uint8Array(await arte.arrayBuffer()); const sha256 = await hashArquivoImpressao(arte);
        await conferir.arquivo({ index: 1, sha256 }, bytes);
        await recusa(async () => conferir.verificar(), 'sem confirmar');
        await recusa(() => conferir.arquivo({ index: 1, sha256 }, bytes), 'duplicado');
        await recusa(() => conferir.arquivo({ index: 2, sha256: 'errado' }, bytes), 'Integridade');
        await recusa(async () => conferir.concluir({ files: 2 }), 'Contagem');
        conferir.concluir({ files: 1 }); conferir.verificar(); ok(true, 'stream íntegro');
    }
    {
        const c = montar();
        c.num.elements = [{type:'TEXT',face:'back'}];
        c.estado.numeracoes[0].elements = structuredClone(c.num.elements);
        await recusa(() => c.executar(), 'Elementos de numeração');
    }
    {
        const c = montar(); c.fd.set('file', new Blob(['%PDF-antigo']), 'antigo.pdf');
        await recusa(() => c.executar(), 'prévia difere');
    }
    {
        const cliente = status => ({ from() { return { insert() {return this;}, select() {return this;},
            single() {return this;}, eq() {return this;}, async abortSignal() {return {data:{id:'job1',status}};} }; } });
        await registrarEAguardarEnvioRemoto(cliente('completed'), {}); ok(true, 'agente confirmou envio');
        await recusa(() => registrarEAguardarEnvioRemoto(cliente('error'), {}), 'agente não confirmou');
        const vazio = {from() {return {insert(){return this;},select(){return this;},single(){return this;},
            async abortSignal(){return {data:null};}};}};
        await recusa(() => registrarEAguardarEnvioRemoto(vazio, {}), 'registro do envio');
    }
    return total;
}

(async () => {
    if (process.argv.includes('--browser')) {
        const puppeteer = require('puppeteer');
        const http = require('node:http');
        const server = http.createServer((_, res) => { res.end('<!doctype html><title>Teste sintético</title>'); });
        await new Promise(r => server.listen(0, '127.0.0.1', r));
        let browser;
        try {
            browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            await page.goto('http://127.0.0.1:' + server.address().port);
            await page.addScriptTag({ content: fonte });
            const total = await page.evaluate(casos);
            console.log('OK browser: ' + total + ' verificações de integridade');
        } finally { if (browser) await browser.close(); server.close(); }
    } else {
        const ctx = vm.createContext({ console, Blob, File, FormData, TextDecoder, TextEncoder, crypto,
            structuredClone, AbortController, setTimeout, clearTimeout });
        vm.runInContext(fonte, ctx);
        const total = await vm.runInContext('(' + casos.toString() + ')()', ctx);
        console.log('OK: ' + total + ' verificações de integridade');
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
