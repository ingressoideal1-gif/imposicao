// Fluxo real com 4.744 propostas concluidas sinteticas; nenhum servico externo.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const config = fs.readFileSync('frontend/supabase-config.js', 'utf8');
function extract(name, text = source) {
    const i = text.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name);
    return text.slice(i, text.indexOf('\n}', i) + 2);
}
function constant(name) {
    const i = source.indexOf('const ' + name + ' = [');
    return source.slice(i, source.indexOf('];', i) + 2);
}
function environment() {
    const completed = Array.from({ length: 4744 }, (_, i) => ({ id_int: i + 100, status_interno: 'FINALIZADO' }));
    const proposals = [...completed, ...[
        [1, 'NOVO'], [2, 'APROVADO'], [3, 'LIBERADO'], [4, 'EM PRODUCAO'],
        [5, 'FINALIZADO'], [6, 'CANCELADO'], [7, 'EXPEDICAO'], [8, 'EM ACABAMENTO']
    ].map(([id_int, status_interno]) => ({ id_int, status_interno }))];
    const products = [1, 2, 3, 4, 6, 100].map(id_int => ({ id: id_int, id_int, created_at: '2026-09-01' }));
    const corrections = [4, 5, 6].map(id_int => ({ id: id_int, id_int, status_impressao: ' Corrigir_Arte ' }));
    const logs = [], paints = [], ui = { view: 'view-lista-arte', search: '' };
    const c = { state: { ordens: [], osItens: {}, todasArtes: [], linksClienteData: {} },
        console: { log() {}, warn() {}, error() {} }, AbortController, setTimeout, clearTimeout,
        location: { hostname: 'imposition.ai-ideal.com.br', protocol: 'https:' },
        document: { getElementById(id) {
            if (id === 'view-lista-arte') return { classList: { contains: () => ui.view === id } };
            if (id === 'os-search-arte') return { value: ui.search };
            return null;
        } },
        failCorrections: false, failModels: false, holdProducts: null,
        carregarArtesGlobais: async () => { c.state.todasArtes = [1, 2, 3, 4, 6, 100].map(id_int => ({ id_int, status: 'EM ARTE' })); },
        carregarLinksExistentes: async () => {}, carregarTemposNoCard: async () => {}, loadUsuarios: async () => {},
        aplicarNomesPreferenciaisDasPropostas: async () => {}, carregarHorasDosPrazos: async () => ({}),
        lerStatusOverride: () => null, nomePreferencialDaProposta: p => 'Cliente ' + p?.id_int,
        mapVibecodeProdutoToOSItem: p => ({ id: p.id }), aplicarRegraProdutoPrateleira() {},
        conferirColunasQrIdealDosPedidos() {}, iniciarComplementoLista() {},
        mostrarEstadoCargaLista() {}, conferirNovosPedidosDoUsuario() {}, toast() {},
        renderOrdens() { paints.push({ ids: c.state.ordens.map(o => o.numero), partial: c.state.listaArteSomenteAtivos }); },
        completarDadosDaLista() {},
        requisitarPropostas: async (action, body) => {
            logs.push({ table: 'propostas', action, ...body });
            if (action === 'pagamentos') return [];
            const filtered = body.tipo === 'numeros' ? proposals.filter(p => body.numeros.includes(p.id_int))
                : body.tipo === 'status' ? proposals.filter(p => body.status.includes(p.status_interno)) : proposals;
            return filtered.slice(body.offset, body.offset + body.limite);
        }
    };
    const client = { from(table) {
        let ids, range, correction = false;
        return {
            select() { return this; }, order() { return this; }, abortSignal() { return this; },
            in(_col, values) { ids = [...values]; return this; },
            ilike(col, value) { assert.equal(col, 'status_impressao'); assert.equal(value, '%corrigir%arte%'); correction = true; return this; },
            range(a, b) { range = [a, b]; return this; },
            async then(resolve, reject) {
                try {
                    logs.push({ table, ids, range, correction });
                    if (table === 'produtos_proposta' && c.holdProducts) await c.holdProducts;
                    if (correction && c.failCorrections || table === 'pedidos_modelos' && !correction && c.failModels) {
                        resolve({ error: Error('falha sintetica') }); return;
                    }
                    let data = [];
                    if (table === 'produtos_proposta') data = products;
                    if (correction) data = corrections.slice(range[0], range[1] + 1);
                    if (table === 'propostas_os') data = ids.map(id_int => ({ id_int, data_termino: '2026-10-01' }));
                    if (table === 'pedidos_modelos' && !correction) data = ids.map(id_int => ({ id: id_int, id_int, status_impressao: [4, 5].includes(id_int) ? 'Corrigir Arte' : 'Aguardando', quantidade: 300 }));
                    resolve({ data });
                } catch (e) { reject(e); }
            }
        };
    } };
    c.vibeClient = client; c.supabaseClient = client; c.window = c;
    vm.createContext(c);
    vm.runInContext('let _cargaOrdensEmAndamento = null; const STATUS_CORRIGIR_ARTE = "Corrigir Arte";\n'
        + constant('SINAIS_SAIU_DA_ARTE') + '\n' + constant('SINAIS_CANCELADO') + '\n'
        + ['recorteDaCargaDeOrdens', 'loadOrdens', 'carregarOrdensDados', 'loadOrdensFromVibecode',
            'pedidosComCorrecaoDeArte', 'propostaAtivaNaListaArte', 'pedidoCancelado', 'pedidoSaiuDaArte',
            'modeloEmCorrecaoDeArte', 'normalizarStatusImpressao', 'pedidosJaNaGrafica', 'pedidoEntraNoPainel',
            'arteFoiLancada', 'lerDadosLista', 'lerLotesDaLista', 'comporPrazoDoERP', 'carregarModelosGlobais',
            'carregarPagamentosGlobais', 'setFiltroFilaArte', 'pesquisarPedidosNaListaArte'].map(n => extract(n)).join('\n')
        + '\n' + extract('consultarPropostas', config), c);
    return { c, ui, logs, paints, products, corrections };
}
const tick = () => new Promise(r => setImmediate(r));
(async () => {
    let checks = 0;
    const ok = (condition, message) => { checks++; assert(condition, message); };
    const { c, ui, logs, paints } = environment();
    ok(await c.loadOrdens(), 'carga ativa conclui');
    assert.deepEqual(Array.from(c.state.ordens, o => o.numero).sort((a, b) => a - b), [1, 2, 3, 4, 5]); checks++;
    ok(!logs.some(l => l.tipo === 'status'), 'carga inicial nao consulta as 4.744 propostas concluidas');
    ok(c.state.listaArteSomenteAtivos, 'contagem de concluidos fica explicitamente nao carregada');
    ok(c.state.ordens.find(o => o.numero === 5)?._itens_count === 0, 'retrabalho finalizado sem produto entra');
    ok(!c.state.ordens.some(o => o.numero === 6), 'cancelado nao volta como retrabalho');
    ok(logs.filter(l => ['propostas_os', 'pedidos_modelos'].includes(l.table) && !l.correction).every(l => l.ids.every(id => id < 6)), 'prazos e modelos somente dos ativos');
    await c.carregarPagamentosGlobais();
    ok(logs.filter(l => l.action === 'pagamentos').every(l => l.numeros.every(id => id < 6)), 'pagamentos somente dos ativos');
    const selectiveCalls = logs.length;
    logs.length = 0;
    await c.setFiltroFilaArte('concluidos');
    ok(logs.some(l => l.tipo === 'status'), 'clique em Concluidos consulta historico');
    ok(c.state.ordens.some(o => o.numero === 7), 'historico descobre expedicao sem produto nem arte');
    ok(c.state.ordens.some(o => o.numero === 4843), 'ultimo concluido preservado, sem corte arbitrario');
    ok(!c.state.listaArteSomenteAtivos, 'historico completo identificado');
    await c.carregarPagamentosGlobais();
    const completeCalls = logs.length;
    logs.length = 0;
    await c.setFiltroFilaArte('fila');
    ok(!logs.some(l => l.tipo === 'status') && c.state.listaArteSomenteAtivos, 'retorno ao trabalho volta ao recorte ativo');
    ui.search = '4843'; logs.length = 0;
    await c.loadOrdens();
    ok(c.state.ordens.some(o => o.numero === 4843) && !c.state.listaArteSomenteAtivos, 'pesquisa explicita disponibiliza pedido antigo');
    ui.search = ''; ui.view = 'view-lista-impressao'; logs.length = 0;
    await c.loadOrdens();
    ok(c.state.ordens.some(o => o.numero === 8) && logs.some(l => l.tipo === 'status'), 'outros paineis preservam sua carga');
    ui.view = 'view-lista-arte'; c.failCorrections = true;
    const previous = c.state.ordens;
    ok(await c.loadOrdens() === false && c.state.ordens === previous && !c.state.listaArteSomenteAtivos, 'falha de retrabalho preserva lista e abrangencia anterior');
    c.failCorrections = false; c.failModels = true;
    ok(await c.loadOrdens() === false && c.state.ordens === previous && !c.state.listaArteSomenteAtivos, 'falha de modelos restaura lista completa');
    c.failModels = false;
    ok(await c.loadOrdens(), 'retry recupera sem F5');
    const { c: other, products, corrections } = environment();
    products.length = 0; corrections.splice(0, corrections.length, { id: 5, id_int: 5, status_impressao: 'CORRIGIR-ARTE' });
    ok(await other.loadOrdens() && other.state.ordens.some(o => o.numero === 5), 'sem produtos recentes ainda encontra arte e retrabalho');
    const paged = environment();
    paged.corrections.splice(0, paged.corrections.length, ...Array.from({ length: 501 }, (_, i) => ({ id: i, id_int: i + 1, status_impressao: 'CORRIGIR ARTE' })));
    const correctionIds = await paged.c.pedidosComCorrecaoDeArte();
    ok(correctionIds.size === 501 && correctionIds.has('501') && paged.logs.filter(l => l.correction).length === 2, 'retrabalho alem de 500 modelos continua paginado');
    const pending = environment(); let release;
    pending.c.holdProducts = new Promise(r => { release = r; });
    const first = pending.c.loadOrdens();
    ok(pending.c.loadOrdens() === first, 'mesmo recorte compartilha promessa');
    pending.c.state.filtroFilaTipo = 'concluidos';
    const history = pending.c.loadOrdens();
    release(); await Promise.all([first, history]);
    ok(!pending.c.state.listaArteSomenteAtivos && pending.c.state.ordens.some(o => o.numero === 4843), 'clique durante carga ativa termina com historico completo');
    const abandoned = environment(); let finish;
    abandoned.c.holdProducts = new Promise(r => { finish = r; });
    const active = abandoned.c.loadOrdens();
    abandoned.c.state.filtroFilaTipo = 'concluidos'; const queued = abandoned.c.loadOrdens();
    abandoned.c.state.filtroFilaTipo = 'fila'; finish(); await Promise.all([active, queued]);
    ok(!abandoned.logs.some(l => l.tipo === 'status'), 'historico abandonado nao gera leitura posterior');
    // O link direto pode pedir carga completa mesmo antes da troca de view.
    ok(await abandoned.c.loadOrdens({ completa: true }) && abandoned.c.state.ordens.some(o => o.numero === 4843), 'restauracao de pedido antigo pode solicitar carga completa');
    // Executar o trecho real do renderer que escolhe a lista e pinta o contador.
    const render = extract('renderOrdens');
    const start = render.indexOf('const totalConcluidosArte =');
    const end = render.indexOf('// Atualizar título da tabela', start);
    assert(start >= 0 && end > start);
    const fragment = render.slice(start, end) + '\nresultado = { ids: baseOrdensArte.map(o => o.numero), paginar: listaEhDosConcluidos };';
    const display = { state: { filtroFilaTipo: 'fila', listaArteSomenteAtivos: true },
        ordensConcluidosArte: [{numero:4843}], ordensFilaArte: [{numero:1}], ordensPendentesArte: [{numero:2}],
        ordensAprovacao: [{numero:3}], ordensAprovados: [{numero:4}], ordensTodos: [{numero:1}], searchArte: '' };
    const counter = {}; display.document = { getElementById: () => counter };
    const paint = () => vm.runInNewContext(fragment, { ...display, resultado: null });
    paint(); ok(counter.textContent === 'Consultar', 'renderer nao exibe zero ou contagem parcial como total');
    display.state.listaArteSomenteAtivos = false; paint(); ok(counter.textContent === 1, 'renderer exibe contagem depois da carga completa');
    const searchable = { ...display, searchArte: '4843' }; vm.runInNewContext(fragment, searchable);
    ok(searchable.resultado.ids.includes(4843) && searchable.resultado.paginar, 'pesquisa encontra concluido com paginacao');
    const restricted = { ...display, searchArte: '4843', state: { ...display.state, filtroStatusArte: 'Aprovada' } };
    vm.runInNewContext(fragment, restricted);
    ok(!restricted.resultado.ids.includes(4843), 'filtro explicito de status continua restringindo a pesquisa');
    const uiTest = environment(); let scheduled;
    uiTest.c.setTimeout = fn => { scheduled = fn; return 1; }; uiTest.c.clearTimeout = () => {};
    uiTest.c.state.listaArteSomenteAtivos = true; uiTest.ui.search = '4843';
    let loads = 0; uiTest.c.loadOrdens = () => { loads++; };
    uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 1, 'digitacao solicita historico depois da espera');
    uiTest.c.state.listaArteSomenteAtivos = false; uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 1, 'historico carregado e reutilizado durante a digitacao');
    uiTest.ui.search = ''; uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 2, 'limpar pesquisa recupera recorte ativo');
    ok(paints.length > 0 && completeCalls > selectiveCalls, 'carga seletiva reduz chamadas sem cortar historico solicitado');
    console.log(JSON.stringify({ checks, syntheticCompletedProposals: 4744, selectiveCalls, completeCalls }));
})().catch(e => { console.error(e); process.exitCode = 1; });
