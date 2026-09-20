'use strict';
// Regressões offline: código real, dados sintéticos e nenhum banco/impressora.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'frontend', name), 'utf8').replace(/\r\n/g, '\n');
const page = read('producao-por-cor.js');
const main = read('script.js');
const pedido = read('pedido.js');
const extract = (source, name) => {
    const match = new RegExp(`^(?:async )?function ${name}\\(`, 'm').exec(source);
    assert(match, name);
    return source.slice(match.index, source.indexOf('\n}', match.index) + 2);
};
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const model = (id = 11, os = 1, changes = {}) => ({ id, id_int: os, id_produto_proposta_origem: 99,
    nome_modelo: `Modelo ${id}`, status_impressao: 'Aguardando', padrao: 'Azul', quantidade: 100, ...changes });
function fixture() {
    const elements = new Map();
    for (const id of ['ppc-message', 'ppc-table-wrap', 'ppc-model-list', 'ppc-product-select',
        'ppc-color-list', 'ppc-refresh', 'ppc-summary', 'ppc-list-title', 'ppc-list-subtitle']) {
        elements.set(id, { innerHTML: '', textContent: '', hidden: false, dataset: {},
            addEventListener() {}, style: {} });
    }
    const events = {}, calls = [], notices = [];
    const tables = { pedidos_modelos: [model()], propostas: [], produtos_proposta: [{ id: 99, id_int: 1, id_produto: 9, nome_produto: 'Produto A' }] };
    const ctx = {
        state: { ordens: [{ id: 'vibe_1', numero: 1, status_interno: 'EM PRODUCAO' }], osItens: {},
            cores: [{ id: 5, name: 'Azul' }], numeracoes: [{ id: 6, name: 'Duplex', print_mode: 'FxVerso' }], selectedOSItems: [] },
        document: { getElementById: id => elements.get(id) || null, querySelector: () => null },
        console: { log() {}, warn() {}, error() {} }, setTimeout,
        CSS: { escape: String }, STATUS_CORRIGIR_ARTE: 'Corrigir Arte',
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        renderOrdens() {}, toast: (...args) => notices.push(args),
        localStorage: { getItem: () => null, setItem() {} },
    };
    ctx.window = ctx;
    ctx.addEventListener = (type, handler) => { events[type] = handler; };
    ctx.dispatchEvent = event => { calls.push(event); if (events[event.type]) events[event.type](event); };
    ctx.loadOrdens = async () => true;
    ctx.getOSItens = id => ctx.state.osItens[id] || [];
    ctx.loadOSItens = async id => { ctx.state.osItens[id] = tables.pedidos_modelos
        .filter(row => `vibe_${row.id_int}` === id).map(row => ({ ...row, _dbLoaded: true })); };
    ctx.enviarParaPedido = async (...args) => { ctx.state.activeOSItem = { itemId: args[0], osId: args[1] }; calls.push({ open: args }); };
    ctx.fecharJanelaDoModelo = () => { ctx.state.activeOSItem = null; ctx.PedidoJanelaExterna?.aoFechar(); };
    ctx.isNumeracaoDuplex = num => num.print_mode === 'FxVerso';
    ctx.supabaseClient = { from(table) {
        let column, values;
        return { select() { return this; }, in(c, v) { column = c; values = v; return this; },
            order() { return this; }, async range(start, end) {
                const rows = tables[table].filter(row => !values || values.some(value => String(value) === String(row[column])));
                return { data: rows.slice(start, end + 1), error: null };
            } };
    } };
    vm.createContext(ctx);
    vm.runInContext(read('cor-numeracao-do-modelo.js'), ctx);
    vm.runInContext(extract(main, 'normalizarStatusImpressao'), ctx);
    vm.runInContext(extract(main, 'alvosDaImpressao'), ctx);
    // Constantes e funções reais de elegibilidade; somente Ignorar fica simulado.
    for (const name of ['SINAIS_NA_GRAFICA', 'SINAIS_DEPOIS_DA_GRAFICA']) {
        const start = main.indexOf(`const ${name} =`);
        vm.runInContext(main.slice(start, main.indexOf(';', start) + 1), ctx);
    }
    vm.runInContext(extract(main, 'pedidoNaGrafica') + '\n' + extract(main, 'pedidoJaPassouDaGrafica'), ctx);
    ctx.pedidoIgnoradoNosPaineis = os => os.ignorado === true;
    vm.runInContext(page.replace('window.ProducaoPorCorUtils = { modelosDoFiltro };',
        'window.ProducaoPorCorUtils = { modelosDoFiltro, local, loadRecords, loadFullItem, openModel, openPage, leavePage, refresh, render, formatDate, colorInfo, selectInBatches, changeStatus };'), ctx);
    const api = ctx.ProducaoPorCorUtils;
    async function start() { await api.openPage(); api.local.productKey = 'id:9'; api.local.colorKey = 'id:5'; api.render(); }
    return { ctx, api, elements, calls, notices, tables, start };
}
let checks = 0;
async function check(label, body) { await body(); checks++; console.log(`OK: ${label}`); }
async function statusFixture(response) {
    const f = fixture();
    await f.start(); await f.ctx.loadOSItens('vibe_1');
    const filters = [];
    f.ctx.supabaseClient = { from() { return { update() { return this; }, eq(k, v) { filters.push([k, v]); return this; },
        select() { return Promise.resolve(response); } }; } };
    vm.runInContext(extract(main, 'updateItemImpressao'), f.ctx);
    return { ...f, filters };
}
(async () => {
    await check('entrada neutra; seleção anterior isolada e restaurada na saída', async () => {
        const f = fixture(); const selected = [{ itemId: 11, osId: 'vibe_1' }, { itemId: 12, osId: 'vibe_1' }];
        f.ctx.state.selectedOSItems = selected;
        f.ctx.state.pedidoAberto = { osId: 'vibe_2' };
        await f.api.openPage();
        assert.equal(f.api.local.productKey, ''); assert.equal(f.api.local.colorKey, '');
        assert.equal(f.ctx.state.selectedOSItems.length, 0);
        f.api.local.productKey = 'id:9'; f.api.local.colorKey = 'id:5';
        await f.api.openModel(11, 'vibe_1'); assert.equal(f.ctx.state.selectedOSItems.length, 0);
        assert.equal(f.ctx.PedidoJanelaExterna.validarGeracao()(), true);
        f.api.leavePage(); assert.equal(f.ctx.state.selectedOSItems, selected);
        assert.equal(f.ctx.state.pedidoAberto.osId, 'vibe_2');
        assert.equal(f.ctx.state.activeOSItem, null);
    });
    await check('dropdown inclui todos os produtos com modelos aguardando, independente da fila do pedido', async () => {
        const f = fixture();
        f.ctx.state.ordens.push(...[
            { id: 'vibe_2', numero: 2, status_interno: 'EXPEDICAO' },
            { id: 'vibe_3', numero: 3, status_interno: 'ENTREGUE' },
            { id: 'vibe_4', numero: 4, status_interno: 'EM PRODUCAO', ignorado: true },
            { id: 'vibe_5', numero: 5, status_interno: 'EM ARTE' },
        ]);
        f.tables.pedidos_modelos.push(model(12, 1, { status_impressao: 'IMPRESSO' }), model(13, 1, { status_impressao: 'CORRIGIR_ARTE' }), model(21, 2), model(31, 3), model(41, 4), model(51, 5));
        for (const number of [2, 3, 4, 5]) f.tables.produtos_proposta.push({ id: 99, id_int: number, id_produto: number, nome_produto: `Produto ${number}` });
        await f.api.openPage();
        assert.deepEqual(Array.from(f.api.local.records, row => row.modelId), [11, 21, 31, 41, 51]);
        const options = f.elements.get('ppc-product-select').innerHTML;
        for (const number of [2, 3, 4, 5, 9]) assert(options.includes(`value="id:${number}"`));
        assert.equal(f.api.local.productKey, '');
    });
    await check('produto de pedido fora do cache aparece e seu modelo pode abrir', async () => {
        const f = fixture();
        f.tables.pedidos_modelos.push(model(71, 7));
        f.tables.produtos_proposta.push({ id: 99, id_int: 7, id_produto: 77, nome_produto: 'Produto fora do cache' });
        f.tables.propostas.push({ id: 700, id_int: 7, cliente: 'Cliente sintético', status_interno: 'EM ARTE' });
        await f.api.openPage();
        assert(f.elements.get('ppc-product-select').innerHTML.includes('Produto fora do cache'));
        assert.equal(f.ctx.state.ordens.filter(order => order.id === 'vibe_7').length, 1);
        f.api.local.productKey = 'id:77'; f.api.local.colorKey = 'id:5';
        await f.api.openModel(71, 'vibe_7');
        assert(f.calls.some(call => call.open && call.open[0] === 71 && call.open[1] === 'vibe_7'));
        await f.api.refresh();
        assert.equal(f.ctx.state.ordens.filter(order => order.id === 'vibe_7').length, 1);
    });
    await check('troca produto/cor fecha janela e invalida abertura pendente', async () => {
        const f = fixture(); await f.start(); const d = deferred();
        f.ctx.loadOSItens = async () => { await d.promise; f.ctx.state.osItens.vibe_1 = [{ ...model(), _dbLoaded: true }]; };
        const opening = f.api.openModel(11, 'vibe_1'); await tick();
        f.ctx.fecharJanelaDoModelo(); f.api.local.colorKey = 'outra'; d.resolve(); await opening;
        assert(!f.calls.some(c => c.open));
    });
    await check('saída cancela abertura e não volta para Pedido', async () => {
        const f = fixture(); await f.start(); const d = deferred();
        f.ctx.loadOSItens = async () => { await d.promise; f.ctx.state.osItens.vibe_1 = [{ ...model(), _dbLoaded: true }]; };
        const opening = f.api.openModel(11, 'vibe_1'); await tick(); f.api.leavePage(); d.resolve(); await opening;
        assert(!f.calls.some(c => c.open)); assert.equal(f.api.local.openItemId, null);
    });
    await check('último clique vence respostas invertidas', async () => {
        const f = fixture(); f.tables.pedidos_modelos.push(model(12)); await f.start();
        const pending = [];
        f.ctx.loadOSItens = () => { const d = deferred(); pending.push(d); return d.promise.then(() => {
            f.ctx.state.osItens.vibe_1 = f.tables.pedidos_modelos.map(row => ({ ...row, _dbLoaded: true }));
        }); };
        const first = f.api.openModel(11, 'vibe_1'); const second = f.api.openModel(12, 'vibe_1'); await tick();
        pending[1].resolve(); await second; pending[0].resolve(); await first;
        assert.equal(f.calls.filter(c => c.open).length, 1); assert.equal(f.api.local.openItemId, 12);
    });
    await check('status rejeitado ou zero linhas não confirma nem esconde modelo', async () => {
        for (const response of [{ data: [], error: null }, { data: null, error: { message: 'negado' } },
            { data: [{ id: 11, id_int: 2, status_impressao: 'Impresso' }], error: null },
            { data: [{ id: 12, id_int: 1, status_impressao: 'Impresso' }], error: null },
            { data: [{ id: 11, id_int: 1, status_impressao: null }], error: null },
            { data: [1, 2].map(() => ({ id: 11, id_int: 1, status_impressao: 'Impresso' })), error: null },
            { data: [{ id: 11, id_int: 1, status_impressao: 'Aguardando' }], error: null }]) {
            const f = await statusFixture(response);
            const select = { dataset: { statusItem: '11', statusOs: 'vibe_1' }, value: 'Impresso' };
            await f.api.changeStatus(select);
            assert(!f.notices.some(n => n[1] === 'success')); assert(!f.calls.some(c => c.detail));
            assert.equal(f.api.local.records[0].status, 'Aguardando'); assert.equal(select.value, 'Aguardando');
        }
    });
    await check('status confirmado usa id + pedido e fecha o modelo removido da lista', async () => {
        const f = await statusFixture({ data: [{ id: 11, id_int: 1, status_impressao: 'Impresso' }], error: null });
        await f.api.openModel(11, 'vibe_1');
        await f.api.changeStatus({ dataset: { statusItem: '11', statusOs: 'vibe_1' }, value: 'Impresso' });
        assert.deepEqual(f.filters, [['id', 11], ['id_int', 1]]);
        assert.equal(f.api.local.records[0].status, 'Impresso'); assert.equal(f.api.local.openItemId, null);
        assert.equal(f.ctx.state.activeOSItem, null); assert(f.notices.some(n => n[1] === 'success'));
    });
    await check('Corrigir Arte carrega modelo real antes da gravação confirmada', async () => {
        const f = fixture(); await f.start();
        f.ctx.state.osItens.vibe_1 = [{ id: 'vibe_item_99' }];
        const writes = [];
        f.ctx.supabaseClient = { from() { return { update(data) { writes.push(data); return this; }, eq() { return this; },
            select() { return Promise.resolve({ data: [{ id: 11, status_impressao: 'Corrigir Arte', status_arte: 'REPROVADA_CLIENTE' }], error: null }); } }; } };
        f.ctx.avisarCorrecaoDeArte = () => {};
        vm.runInContext(extract(main, 'devolverArteParaAlteracao') + '\n' + extract(main, 'updateItemImpressao'), f.ctx);
        await f.api.changeStatus({ dataset: { statusItem: '11', statusOs: 'vibe_1' }, value: 'Corrigir Arte' });
        assert.equal(writes.length, 1); assert.equal(writes[0].status_arte, 'REPROVADA_CLIENTE');
        assert.equal(f.api.local.records[0].status, 'Corrigir Arte');
    });
    await check('confirmação de impressão não conclui combinação quando status falha', async () => {
        const f = await statusFixture({ data: [], error: null }); let registered = false;
        f.ctx.confirmarPopup = async () => true; f.ctx.escHtmlSimples = String;
        f.ctx.registrarCombinacao = async () => { registered = true; };
        vm.runInContext(extract(main, 'confirmarImpressaoModelos'), f.ctx);
        assert.equal(await f.ctx.confirmarImpressaoModelos([{ itemId: 11, osId: 'vibe_1' }]), false);
        assert.equal(registered, false);
    });
    await check('saída durante carga do status cancela escrita ainda não iniciada', async () => {
        const f = fixture(); await f.start(); const d = deferred(); let writes = 0;
        f.ctx.loadOSItens = async () => { await d.promise; f.ctx.state.osItens.vibe_1 = [{ ...model(), _dbLoaded: true }]; };
        f.ctx.updateItemImpressao = async () => { writes++; return true; };
        const change = f.api.changeStatus({ dataset: { statusItem: '11', statusOs: 'vibe_1' }, value: 'Impresso' });
        await tick(); f.api.leavePage(); d.resolve(); await change; assert.equal(writes, 0);
    });
    await check('falha de atualização mantém erro visível, sem ações com dados antigos', async () => {
        const f = fixture(); await f.start(); f.ctx.loadOrdens = async () => false;
        await f.api.refresh(); f.api.render();
        assert.equal(f.api.local.records.length, 0); assert.equal(f.elements.get('ppc-message').hidden, false);
        assert(f.elements.get('ppc-message').textContent.includes('Não foi possível'));
        await f.api.openModel(11, 'vibe_1'); assert(!f.calls.some(c => c.open));
        f.ctx.loadOrdens = async () => true; await f.api.refresh(); assert.equal(f.api.local.error, '');
    });
    await check('catálogo indisponível não vira lista aparentemente válida', async () => {
        const f = fixture(); f.ctx.state.cores = []; f.ctx.api = async () => { throw new Error('offline'); };
        await f.api.openPage(); assert(f.api.local.error.includes('offline')); assert.equal(f.api.local.records.length, 0);
    });
    await check('órfão usa identidade própria; desconhecidos não são agrupados pelo nome do modelo', async () => {
        const f = fixture(); f.tables.produtos_proposta = [];
        f.tables.pedidos_modelos = [model(11, 1, { id_produto: 9 }), model(12, 1, { id_produto_proposta_origem: null, nome_modelo: 'Igual' }), model(13, 1, { id_produto_proposta_origem: null, nome_modelo: 'Igual' })];
        const rows = await f.api.loadRecords(); assert.equal(rows[0].productKey, 'id:9');
        assert.notEqual(rows[1].productKey, rows[2].productKey);
    });
    await check('paginação percorre respostas truncadas sem perder modelos', async () => {
        const f = fixture(); const all = Array.from({ length: 1200 }, (_, id) => ({ id, id_int: 1 })); let requests = 0;
        const client = { from() { return { select() { return this; }, in() { return this; }, order() { return this; },
            async range(start, end) { requests++; return { data: all.slice(start, Math.min(end + 1, start + 73)) }; } }; } };
        const rows = await f.api.selectInBatches(client, 'pedidos_modelos', '*', [1]);
        assert.equal(rows.length, 1200); assert.equal(new Set(rows.map(r => r.id)).size, 1200); assert(requests > 1);
    });
    await check('prazo civil mantém dia e timestamp mantém hora', async () => {
        process.env.TZ = 'America/Sao_Paulo'; const f = fixture();
        assert.equal(f.api.formatDate('2026-09-20'), '20/09/2026');
        assert(f.api.formatDate('2026-09-20T15:30:00-03:00').includes('15:30'));
    });
    await check('cor e verso seguem reconciliação e numeração efetiva do Pedido', async () => {
        const f = fixture(); f.ctx.state.cores.push({ id: 7, name: 'Vermelha' });
        f.tables.pedidos_modelos[0].amostra_cor_id = 7;
        f.tables.pedidos_modelos[0].amostra_num_id = 6;
        f.tables.pedidos_modelos[0].verso_tipo = 'Frente';
        const [row] = await f.api.loadRecords(); assert.equal(row.colorKey, 'id:5'); assert.equal(row.back, 'FxVerso');
    });
    await check('geração da janela usa arquivo e verso do Pedido, não da aba Imposição', async () => {
        const f = fixture(); f.ctx.state.pedArtFile = { name: 'certo.pdf' }; f.ctx.state.impArtFile = { name: 'errado.pdf' };
        const begin = pedido.indexOf('    const selectedFile =', pedido.indexOf('window.runPedImposition'));
        const end = pedido.indexOf('    if (selectedFile)', begin);
        assert.equal(vm.runInContext(`(() => { ${pedido.slice(begin, end)} return selectedFile.name; })()`, f.ctx), 'certo.pdf');
        assert(pedido.includes('let versoFile = state.pedArtVersoFile;'));
        const run = pedido.slice(pedido.indexOf('window.runPedImposition'), pedido.indexOf('async function pedQueueGerarPDF'));
        assert(!run.includes('state.impArtFile')); assert(!run.includes('state.impArtVersoFile'));
    });
    await check('carregador PDF descarta resposta após cancelamento', async () => {
        const f = fixture(); const d = deferred(); let current = true;
        f.ctx.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() { throw new Error('não deveria iniciar PDF cancelado'); } };
        vm.runInContext(extract(pedido, 'loadPedArtFile'), f.ctx);
        const job = f.ctx.loadPedArtFile({ name: 'antigo.pdf', arrayBuffer: () => d.promise }, () => current);
        current = false; f.ctx.state.pedArtFile = { name: 'novo.pdf' }; d.resolve(new ArrayBuffer(0)); await job;
        assert.equal(f.ctx.state.pedArtFile.name, 'novo.pdf'); assert.equal(f.ctx.state.pedArtPdfDoc, undefined);
    });
    await check('janela real aguarda frente e verso; saída durante download não toca o novo modelo', async () => {
        for (const cancel of [false, true]) {
            const f = fixture(); await f.start();
            f.tables.pedidos_modelos[0].arte_url = 'https://example.invalid/frente.pdf';
            f.tables.pedidos_modelos[0].verso_arte_url = 'https://example.invalid/verso.pdf';
            f.tables.pedidos_modelos[0].amostra_cor_id = 5;
            const download = deferred();
            for (const name of ['atualizarIndicadorModeloComVerso', 'pintarLinhaAberta', 'moverJanelaParaModelo',
                'limparPreviaEnquantoCarrega', 'aplicarTravaModoPdf', 'updatePedSummary', 'renderPedOSQueue']) f.ctx[name] = () => {};
            f.ctx.setTimeout = fn => setTimeout(fn, 0);
            f.ctx.File = class { constructor(data, name) { this.name = name; } };
            f.ctx.fetch = async url => { if (url.includes('frente')) await download.promise;
                return { ok: true, headers: { get: () => 'application/pdf' }, blob: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) };
            };
            f.ctx.pdfjsLib = { getDocument: () => ({ promise: Promise.resolve({ verso: true }) }) };
            f.ctx.guardarPdfDoVersoDaPrevia = value => { f.ctx.state.pedVersoDoc = value; };
            f.ctx.loadPedArtFile = async file => { f.ctx.state.pedArtFile = file; };
            f.ctx.enviarParaImposicao = async () => {};
            vm.runInContext(extract(pedido, 'enviarParaPedido'), f.ctx);
            const opening = f.api.openModel(11, 'vibe_1');
            await tick(); await tick();
            assert.equal(f.ctx.PedidoJanelaExterna.validarGeracao()(), false);
            if (cancel) {
                f.api.leavePage(); f.ctx.state.pedArtFile = { name: 'novo.pdf' };
                f.ctx.state.pedArtVersoFile = { name: 'novo-verso.pdf' };
            }
            download.resolve(); await opening;
            if (cancel) {
                assert.equal(f.ctx.state.pedArtFile.name, 'novo.pdf');
                assert.equal(f.ctx.state.pedArtVersoFile.name, 'novo-verso.pdf');
            } else {
                assert.equal(f.ctx.state.pedArtFile.name, 'frente.pdf');
                assert.equal(f.ctx.state.pedArtVersoFile.name, 'Arte_verso_Modelo.pdf');
                assert.equal(f.ctx.state.pedVersoDoc.verso, true);
                assert.equal(f.ctx.PedidoJanelaExterna.validarGeracao()(), true);
            }
        }
    });
    await check('preparação compartilhada para após cancelamento durante consulta de numeração', async () => {
        const f = fixture(); await f.ctx.loadOSItens('vibe_1'); let current = true; const d = deferred();
        f.ctx.recarregarNumeracoesDoPedido = () => d.promise;
        f.ctx.garantirCsvDoTrabalho = () => { throw new Error('abertura cancelada avançou'); };
        f.ctx.idsDeNumeracaoDoTrabalho = () => [];
        vm.runInContext(extract(main, 'enviarParaImposicao'), f.ctx);
        const job = f.ctx.enviarParaImposicao(11, 'vibe_1', false, { aindaAtual: () => current });
        current = false; f.ctx.state.activeOSItem = { itemId: 22, osId: 'vibe_2' }; d.resolve(); await job;
        assert.equal(f.ctx.state.activeOSItem.itemId, 22);
    });
    await check('PDF e impressão aguardam janela pronta e cancelam preparação ao sair', async () => {
        for (const mode of ['pdf', 'print']) {
            const f = fixture(); await f.start();
            const start = pedido.indexOf('window.runPedImposition =');
            vm.runInContext(pedido.slice(start, pedido.indexOf('\n};', start) + 3), f.ctx);
            let downloads = 0; const d = deferred();
            f.ctx.idsDeNumeracaoDoTrabalho = () => [];
            f.ctx.garantirCsvDoTrabalho = () => { downloads++; return d.promise; };
            await f.ctx.runPedImposition(mode); assert.equal(downloads, 0);
            assert(f.notices.some(n => n[0].includes('terminar de carregar')));
            await f.api.openModel(11, 'vibe_1');
            const generation = f.ctx.runPedImposition(mode); assert.equal(downloads, 1);
            f.api.leavePage(); d.resolve(); await generation;
            assert.equal(f.ctx.isImposing, undefined);
        }
    });
    await check('confirmação conserva o alvo iniciado após mudar modelo e seleção', async () => {
        const f = fixture(); await f.start(); await f.api.openModel(11, 'vibe_1');
        const start = pedido.indexOf('    const alvosDaJanelaExterna =');
        const end = pedido.indexOf(';', start) + 1;
        vm.runInContext(`const validarContexto = () => true; ${pedido.slice(start, end)}`, f.ctx);
        f.ctx.state.activeOSItem = { itemId: 22, osId: 'vibe_2' };
        f.ctx.state.selectedOSItems = [{ itemId: 33, osId: 'vibe_3' }];
        for (const branch of pedido.matchAll(/const alvoImpressao = .*alvosDaJanelaExterna.*;/g)) {
            const target = vm.runInContext(`(() => { const isRefazer = false, isMultiSelected = false; ${branch[0]} return alvoImpressao; })()`, f.ctx);
            assert.equal(target.length, 1); assert.equal(target[0].itemId, 11); assert.equal(target[0].osId, 'vibe_1');
        }
        assert.equal([...pedido.matchAll(/const alvoImpressao = .*alvosDaJanelaExterna.*;/g)].length, 4);
    });
    console.log(`OK: ${checks} cenários de regressão de Produção por Cor.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
