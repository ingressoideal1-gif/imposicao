'use strict';
// Auditoria HISTORICA: reproduz a revisao analisada, anterior a correcao.
// Para validar o codigo atual: producao_por_cor_fluxo_harness.js.
// As assercoes documentam defeitos presentes; nao sao criterios de aceitacao.
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');
const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..');
const baseline = file => execFileSync('git', ['show', `f184a001:frontend/${file}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const page = baseline('producao-por-cor.js');
const main = baseline('script.js');
const pedido = baseline('pedido.js');
const reconciliation = baseline('cor-numeracao-do-modelo.js');
function actualFunction(name, nextMarker) {
    const start = main.indexOf(`async function ${name}(`);
    assert(start >= 0);
    const end = main.indexOf(nextMarker, start);
    assert(end > start);
    return main.slice(start, end);
}
function fixture() {
    const elements = new Map();
    for (const id of ['ppc-message', 'ppc-table-wrap', 'ppc-model-list', 'ppc-product-select',
        'ppc-color-list', 'ppc-refresh', 'ppc-summary', 'ppc-list-title', 'ppc-list-subtitle']) {
        elements.set(id, { innerHTML: '', textContent: '', hidden: false, dataset: {},
            addEventListener() {}, style: {} });
    }
    const events = {}, calls = [], notices = [];
    const ctx = {
        state: { ordens: [{ id: 'vibe_1', numero: 1 }], osItens: {}, cores: [{ id: 5, name: 'Azul' }] },
        document: { getElementById: id => elements.get(id) || null, querySelector: () => null },
        console: { log() {}, warn() {}, error() {} }, setTimeout,
        CSS: { escape: String }, STATUS_CORRIGIR_ARTE: 'Corrigir Arte',
        CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
        normalizarStatusImpressao: value => {
            const key = String(value || '').trim().toUpperCase();
            return key === 'IMPRESSO' ? 'Impresso' : key === 'CORRIGIR ARTE' ? 'Corrigir Arte' : 'Aguardando';
        },
        renderOrdens() {}, toast: (...args) => notices.push(args),
        localStorage: { getItem: () => null, setItem() {} },
    };
    ctx.window = ctx;
    ctx.addEventListener = (type, handler) => { events[type] = handler; };
    ctx.dispatchEvent = event => { calls.push(event); if (events[event.type]) events[event.type](event); };
    ctx.loadOrdens = async () => true;
    ctx.pedidoNaGrafica = () => true;
    ctx.pedidoJaPassouDaGrafica = () => false;
    ctx.getOSItens = id => ctx.state.osItens[id] || [];
    ctx.loadOSItens = async () => {};
    ctx.enviarParaPedido = async (...args) => calls.push({ open: args });
    ctx.supabaseClient = { from(table) { return { select() { return this; },
        async in() { return { data: table === 'pedidos_modelos' ? [{ id: 11, id_int: 1,
            id_produto: 9, nome_modelo: 'Modelo A', status_impressao: 'Aguardando',
            padrao: 'Azul', verso_tipo: 'Frente' }] : [] }; } }; } };
    vm.createContext(ctx);
    vm.runInContext(reconciliation, ctx);
    vm.runInContext(page.replace('window.ProducaoPorCorUtils = { modelosDoFiltro };',
        'window.ProducaoPorCorUtils = { modelosDoFiltro, local, loadRecords, loadFullItem, openModel, leavePage, refresh, render, formatDate, colorInfo, selectInBatches };'), ctx);
    return { ctx, api: ctx.ProducaoPorCorUtils, elements, calls, notices };
}
async function check(label, body) { await body(); console.log(`CONFIRMADO: ${label}`); }
(async () => {
    await check('geracao na Producao por Cor escolhe arquivo impArtFile em vez da arte pedArtFile da janela', async () => {
        const { ctx, elements } = fixture();
        elements.set('view-pedido', { classList: { contains: () => false } });
        ctx.state.pedArtFile = { name: 'modelo-visivel.pdf' };
        ctx.state.impArtFile = { name: 'outro-estado.pdf' };
        const start = pedido.indexOf("const isPedTab = document.getElementById('view-pedido')");
        const end = pedido.indexOf('if (selectedFile)', start);
        assert(start > 0 && end > start);
        assert.equal(vm.runInContext(`(() => { ${pedido.slice(start, end)} return selectedFile.name; })()`, ctx), 'outro-estado.pdf');
    });
    await check('selecao de dois modelos do mesmo pedido sobrevive a troca para lista de outra cor', async () => {
        const { ctx } = fixture();
        ctx.state.selectedOSItems = [{ itemId: 11, osId: 'vibe_1' }, { itemId: 12, osId: 'vibe_1' }];
        const start = main.indexOf('function limparSelecaoDeOutroPedido(osId)');
        const end = main.indexOf('window.limparSelecaoDeOutroPedido', start);
        vm.runInContext(main.slice(start, end), ctx);
        assert.equal(ctx.limparSelecaoDeOutroPedido('vibe_1'), 0);
        assert.equal(ctx.state.selectedOSItems.length, 2);
        assert(!page.includes('selectedOSItems'));
        const begin = pedido.indexOf('if (state.selectedOSItems && state.selectedOSItems.length > 1)', pedido.indexOf('window.runPedImposition ='));
        const finish = pedido.indexOf('const itemPdfPares', begin);
        ctx.arteDoModeloParaFolha = selection => selection.itemId;
        const ids = vm.runInContext(`(() => { let isMultiSelected = false, schema, tempMultiArtes, numId; ${pedido.slice(begin, finish)} return tempMultiArtes; })()`, ctx);
        assert.equal(ids.length, 2);
    });
    await check('controle: produto + cor excluem modelo Impresso', async () => {
        const { api } = fixture();
        const records = ['Aguardando', 'Impresso', 'Corrigir Arte'].map(status => ({ productKey: 'p', colorKey: 'c', status }));
        assert.equal(api.modelosDoFiltro(records, 'p', 'c').length, 1);
    });
    await check('Corrigir Arte sem abrir modelo falha com cache de produtos', async () => {
        const { ctx, notices } = fixture();
        ctx.state.osItens.vibe_1 = [{ id: 'vibe_item_99' }];
        vm.runInContext(actualFunction('devolverArteParaAlteracao', 'window.devolverArteParaAlteracao'), ctx);
        assert.equal(await ctx.devolverArteParaAlteracao(11, 'vibe_1'), false);
        assert(notices.some(n => n[0].includes('modelo não carregado')));
    });
    await check('Impresso anuncia sucesso quando banco retorna data: []', async () => {
        const { ctx, notices, calls } = fixture();
        ctx.state.osItens.vibe_1 = [{ id: 11, status_impressao: 'Aguardando' }];
        ctx.supabaseClient = { from() { return { update() { return this; }, eq() { return this; },
            then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); } }; } };
        vm.runInContext(actualFunction('updateItemImpressao', '// -------------------------------------------------------------------------------'), ctx);
        await ctx.updateItemImpressao(11, 'vibe_1', 'Impresso');
        assert.equal(ctx.state.osItens.vibe_1[0].status_impressao, 'Impresso');
        assert(notices.some(n => n[1] === 'success'));
        assert(calls.some(e => e.detail && e.detail.status === 'Impresso'));
    });
    await check('abertura pendente continua depois de sair da pagina', async () => {
        const { ctx, api, calls } = fixture();
        let release;
        ctx.loadOSItens = () => new Promise(resolve => { release = () => {
            ctx.state.osItens.vibe_1 = [{ id: 11, _dbLoaded: true }]; resolve();
        }; });
        api.local.active = true;
        const opening = api.openModel(11, 'vibe_1');
        await new Promise(resolve => setTimeout(resolve, 0));
        api.leavePage(); release(); await opening;
        assert.equal(api.local.active, false);
        assert(calls.some(c => c.open));
        assert.equal(api.local.openItemId, 11);
    });
    await check('cliques A e B: resposta atrasada de A vence o ultimo clique B', async () => {
        const { ctx, api, calls } = fixture();
        const pending = {};
        ctx.loadOSItens = id => new Promise(resolve => { pending[id] = () => {
            ctx.state.osItens[id] = [{ id: id === 'vibe_1' ? 11 : 22, _dbLoaded: true }]; resolve();
        }; });
        const first = api.openModel(11, 'vibe_1');
        const second = api.openModel(22, 'vibe_2');
        await new Promise(resolve => setTimeout(resolve, 0));
        pending.vibe_2(); await second; pending.vibe_1(); await first;
        assert.equal(calls.filter(c => c.open).at(-1).open[0], 11);
    });
    await check('modelo removido da lista por status continua marcado como aberto', async () => {
        const { ctx, api } = fixture();
        api.local.active = true;
        api.local.openItemId = 11; api.local.openOSId = 'vibe_1';
        api.local.records = [{ modelId: 11, status: 'Aguardando', productKey: 'p', productLabel: 'P', colorKey: 'c' }];
        ctx.state.activeOSItem = { itemId: 11, osId: 'vibe_1' };
        ctx.dispatchEvent(new ctx.CustomEvent('pedidos-modelo-status-impressao', { detail: { itemId: 11, status: 'Impresso' } }));
        assert.equal(api.local.openItemId, 11);
        assert.equal(ctx.state.activeOSItem.itemId, 11);
        assert.equal(api.modelosDoFiltro(api.local.records, 'p', 'c').length, 0);
    });
    await check('falha ao atualizar preserva registros antigos e filtro esconde o erro', async () => {
        const { ctx, api, elements } = fixture();
        api.local.records = [{ modelId: 11, status: 'Aguardando', productKey: 'p', productLabel: 'P', colorKey: 'c', colorLabel: 'C', modelLabel: 'A' }];
        api.local.productKey = 'p'; api.local.colorKey = 'c';
        ctx.loadOrdens = async () => { throw new Error('offline simulado'); };
        await api.refresh();
        assert(elements.get('ppc-message').textContent.includes('offline simulado'));
        api.render();
        assert.equal(elements.get('ppc-message').hidden, true);
        assert.equal(api.local.records.length, 1);
    });
    await check('loadOrdens retorna false e pagina prossegue com lista antiga', async () => {
        const { ctx, api } = fixture();
        ctx.loadOrdens = async () => false;
        assert.equal((await api.loadRecords()).length, 1);
    });
    await check('modelo sem vinculo de proposta perde identidade de produto apesar de id_produto', async () => {
        const { api } = fixture();
        const rows = await api.loadRecords();
        assert.equal(rows[0].productKey, 'nome:modelo a');
    });
    await check('consulta em lote nao pagina resposta limitada pelo servidor', async () => {
        const { api } = fixture(); let requests = 0;
        const sourceRows = Array.from({ length: 1200 }, (_, id) => ({ id, id_int: 1 }));
        const client = { from() { return { select() { return this; }, in() {
            requests++; return Promise.resolve({ data: sourceRows.slice(0, 1000) });
        } }; } };
        assert.equal((await api.selectInBatches(client, 'pedidos_modelos', '*', [1])).length, 1000);
        assert.equal(requests, 1);
    });
    await check('prazo somente data recua um dia em America/Sao_Paulo', async () => {
        process.env.TZ = 'America/Sao_Paulo';
        const { api } = fixture();
        assert.equal(api.formatDate('2026-09-20'), '19/09/2026');
    });
    console.log('13 verificacoes offline concluidas. Nenhum acesso a banco, agente ou impressora.');
})().catch(error => { console.error(error); process.exitCode = 1; });
