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
            if (['view-lista-arte', 'view-lista-impressao', 'view-acabamento'].includes(id)) return { classList: { contains: () => ui.view === id } };
            if (['os-search-arte', 'os-search-impressao', 'os-search-acabamento'].includes(id)) return { value: ui.search };
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
            eq(col, value) { if (col === 'id_int') ids = [value]; return this; },
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
                    if (table === 'produtos_proposta') {
                        data = ids ? products.filter(p => ids.includes(p.id_int)) : products;
                        if (range) data = data.slice(range[0], range[1] + 1);
                    }
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
        + constant('SINAIS_NA_GRAFICA') + '\n' + constant('SINAIS_DEPOIS_DA_GRAFICA') + '\n'
        + ['recorteDaCargaDeOrdens', 'carregarPedidoPesquisado', 'loadOrdens', 'carregarOrdensDados', 'loadOrdensFromVibecode',
            'pedidosComCorrecaoDeArte', 'propostaAtivaNaListaArte', 'pedidoCancelado', 'pedidoSaiuDaArte',
            'modeloEmCorrecaoDeArte', 'normalizarStatusImpressao', 'pedidosJaNaGrafica', 'pedidoEntraNoPainel',
            'arteFoiLancada', 'lerDadosLista', 'lerLotesDaLista', 'comporPrazoDoERP', 'carregarModelosGlobais',
            'carregarPagamentosGlobais', 'setFiltroFilaArte', 'pesquisarPedidosNaListaArte',
            'carregarDadosDoRecorteGrafica', 'solicitarRecorteDoPainel', 'pesquisarPedidosNoPainelProducao', 'setFiltroPrazo'].map(n => extract(n)).join('\n')
        + '\n' + extract('consultarPropostas', config), c);
    return { c, ui, logs, paints, products, corrections, proposals };
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
    ok(c.state.ordens.some(o => o.numero === 4843) && c.state.listaArteSomenteAtivos, 'pesquisa por numero disponibiliza pedido antigo sem declarar historico completo');
    ok(!logs.some(l => l.tipo === 'status') && logs.filter(l => l.tipo === 'numeros').every(l => l.numeros.length === 1 && l.numeros[0] === 4843), 'pesquisa consulta somente o numero solicitado');
    ok(c.state.ordens.some(o => o.numero === 1), 'pesquisa preserva as filas ja carregadas');
    ok(logs.filter(l => l.ids).every(l => l.ids.every(n => n === 4843)), 'modelos, produtos e prazos limitados ao pedido');
    c.state.pagamentosGlobais = {1: [{status:'pago'}]}; logs.length = 0;
    await c.carregarPagamentosGlobais([4843]);
    ok(c.state.pagamentosGlobais[1][0].status==='pago' && logs.filter(l=>l.action==='pagamentos').every(l=>l.numeros.length===1 && l.numeros[0]===4843), 'pagamento pontual preserva outros pedidos e limita consulta');
    const beforeFailure = c.state.ordens; ui.search = '4842'; c.failModels = true;
    ok(await c.loadOrdens() === false && c.state.ordens === beforeFailure, 'erro na pesquisa preserva estado anterior');
    c.failModels = false;
    const stale = environment(); let unhold;
    stale.ui.search = '4843'; stale.c.holdProducts = new Promise(r => { unhold = r; });
    const oldSearch = stale.c.loadOrdens(); stale.ui.search = '4842'; unhold();
    ok(await oldSearch === false && !stale.c.state.ordens.some(o => o.numero === 4843), 'resposta antiga nao entra depois de trocar a pesquisa');
    const account = environment(); let finishAccount;
    account.ui.search = '4843'; account.c._currentUser = {id:'conta-a'};
    account.c.holdProducts = new Promise(r => {finishAccount = r;});
    const oldAccount = account.c.loadOrdens(); account.c._currentUser = {id:'conta-b'}; finishAccount();
    ok(await oldAccount === false && account.c.state.ordens.length === 0, 'troca de conta descarta resposta da pesquisa anterior');
    ui.search = '4843'; logs.length = 0;
    const openModels = [{id: 'modelo-completo', _dbLoaded: true}];
    c.state.amostrasOSAtivo = 'vibe_4843'; c.state.osItens.vibe_4843 = openModels;
    await c.loadOrdens();
    ok(c.state.osItens.vibe_4843 === openModels, 'pesquisa nao substitui os modelos completos do pedido em uso');
    ui.search = '99999'; await c.loadOrdens();
    ok(!c.state.ordens.some(o=>o.numero===99999) && c.state.ordens.some(o=>o.numero===1), 'numero inexistente nao cria pedido ficticio nem apaga fila');
    ui.search = 'Cliente'; logs.length = 0; await c.loadOrdens();
    ok(logs.some(l => l.tipo === 'status'), 'pesquisa por nome preserva o historico textual');
    ui.search = ''; ui.view = 'view-lista-impressao'; logs.length = 0;
    await c.loadOrdens();
    ok(c.state.ordens.some(o => o.numero === 8) && logs.some(l => l.tipo === 'status'), 'producao descobre retorno em acabamento por status');
    ok(c.state.ordens.length === 2 && !c.state.ordens.some(o => o.numero === 4843), 'producao carrega somente os dois pedidos ativos');
    ok(logs.filter(l => l.ids).every(l => l.ids.every(id => [4, 8].includes(id))), 'produtos, prazos e modelos da producao excluem historico');
    ok(logs.filter(l => l.tipo === 'status').every(l => !l.status.includes('FINALIZADO')), 'producao nao solicita status concluidos');
    ok(c.state.ordens.find(o=>o.numero===8)._itens_count === 0, 'retorno sem produto continua na fila');
    ui.view = 'view-acabamento'; logs.length = 0; await c.loadOrdens();
    ok(c.state.ordens.length === 2 && !c.state.ordens.some(o=>o.numero===7), 'acabamento carrega trabalho ativo; expedicao aguarda clique');
    ok(logs.filter(l=>l.ids).every(l=>l.ids.every(id=>[4,8].includes(id))), 'acabamento restringe produtos, prazos e modelos');
    c.AcabamentoPainel = {recorteCarga:()=> 'expedicao'}; logs.length=0; await c.loadOrdens();
    ok(c.state.ordens.length===1 && c.state.ordens[0].numero===7, 'expedicao consulta somente estados posteriores a grafica');
    ok(logs.some(l=>l.tipo==='status'&&l.status.includes('ENTREGUE')), 'expedicao preserva consulta de entregues');
    ui.view='view-lista-impressao';c.state.filtroPrazo='impressos';logs.length=0;await c.loadOrdens();
    ok(c.state.ordens.some(o=>o.numero===4843)&&!c.state.listaArteSomenteAtivos,'Impresso carrega historico completo quando solicitado');
    c.state.filtroPrazo='geral';await c.loadOrdens();
    ok(c.state.ordens.length===2,'voltar a Geral recupera fila restrita');
    c.updateFiltroPrazoBotoes=()=>{};c.setFiltroPrazo('impressos');await c.loadOrdens();
    ok(c.state.ordens.some(o=>o.numero===4843),'clique real em Impresso solicita historico');
    c.setFiltroPrazo('impressos');await c.loadOrdens();
    ok(c.state.ordens.length===2,'segundo clique em Impresso retoma fila ativa');
    ui.view = 'view-lista-arte'; c.failCorrections = true;
    const previous = c.state.ordens;
    const abrangenciaAnterior = c.state.listaArteSomenteAtivos;
    ok(await c.loadOrdens() === false && c.state.ordens === previous && c.state.listaArteSomenteAtivos === abrangenciaAnterior, 'falha de retrabalho preserva lista e abrangencia anterior');
    c.failCorrections = false; c.failModels = true;
    ok(await c.loadOrdens() === false && c.state.ordens === previous && c.state.listaArteSomenteAtivos === abrangenciaAnterior, 'falha de modelos restaura lista e abrangencia');
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
    uiTest.c.state.listaArteSomenteAtivos = true; uiTest.ui.search = 'Cliente';
    let loads = 0; uiTest.c.loadOrdens = () => { loads++; };
    uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 1, 'digitacao solicita historico depois da espera');
    uiTest.c.state.listaArteSomenteAtivos = false; uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 1, 'historico carregado e reutilizado durante a digitacao');
    uiTest.ui.search = ''; uiTest.c.pesquisarPedidosNaListaArte(); scheduled();
    ok(loads === 2, 'limpar pesquisa recupera recorte ativo');
    ok(paints.length > 0 && completeCalls > selectiveCalls, 'carga seletiva reduz chamadas sem cortar historico solicitado');
    const paginatedProducts = environment(); paginatedProducts.ui.view = 'view-lista-impressao';
    paginatedProducts.products.splice(0, paginatedProducts.products.length,
        ...Array.from({length:501},(_,i)=>({id:i+9000,id_int:4,created_at:'2026-09-01'})));
    ok(await paginatedProducts.c.loadOrdens() && paginatedProducts.c.state.ordens.find(o=>o.numero===4)._itens_count===501,
        'produtos da fila alem de 500 sao preservados');
    ok(paginatedProducts.logs.filter(l=>l.table==='produtos_proposta').length===2,'produtos da fila usam paginas ordenadas');
    const empty = environment();empty.ui.view='view-lista-impressao';
    empty.proposals.splice(0,empty.proposals.length);
    ok(await empty.c.loadOrdens()&&empty.c.state.ordens.length===0,'fila vazia e resultado valido sem fallback historico');
    ok(!empty.logs.some(l=>l.table==='produtos_proposta'||l.table==='propostas_os'), 'fila vazia nao busca produtos nem prazos globais');
    const delivered=environment();delivered.ui.view='view-acabamento';delivered.c.AcabamentoPainel={recorteCarga:()=> 'expedicao'};
    delivered.proposals.push({id_int:99999,status_interno:'ENTREGUE'});
    ok(await delivered.c.loadOrdens()&&delivered.c.state.ordens.some(o=>o.numero===99999),'expedicao preserva pedido entregue antigo sem produto');
    delivered.ui.search='99999';delivered.logs.length=0;await delivered.c.loadOrdens();
    ok(delivered.logs.filter(l=>l.tipo==='numeros').every(l=>l.numeros.length===1&&l.numeros[0]===99999), 'pesquisa numerica do acabamento consulta um pedido');
    const modelError=environment();modelError.ui.view='view-lista-impressao';await modelError.c.loadOrdens();
    const modelPrevious=modelError.c.state.ordens;modelError.c.failModels=true;
    ok(await modelError.c.loadOrdens()===false&&modelError.c.state.ordens===modelPrevious,'falha da fila de producao preserva pedidos anteriores');
    const switched=environment();switched.ui.view='view-lista-impressao';let releaseProducts;
    switched.c.holdProducts=new Promise(resolve=>{releaseProducts=resolve;});
    const productionLoad=switched.c.loadOrdens();switched.ui.view='view-acabamento';const finishLoad=switched.c.loadOrdens();
    releaseProducts();await Promise.all([productionLoad,finishLoad]);
    ok(switched.c.state.recorteOrdensCarregado==='acabamento'&&switched.c.state.ordens.length===2,'troca de painel durante carga termina no recorte atual');
    const discovery=environment();discovery.ui.view='view-lista-impressao';await discovery.c.loadOrdens();
    const discoveryPrevious=discovery.c.state.ordens;discovery.c.requisitarPropostas=async()=>{throw Error('rede sintetica indisponivel');};
    ok(await discovery.c.loadOrdens()===false&&discovery.c.state.ordens===discoveryPrevious,'falha na descoberta de fila nao aplica resultado parcial');
    // A lista termina de atualizar depois de abrir o Pedido. O produto resumido
    // do ERP nao pode substituir o modelo completo entre desenhar a fila e clicar.
    for (const pesquisa of [false, true]) for (const uso of ['pedido', 'modelo', 'combinacao']) {
        const f = environment();
        await f.c.loadOrdens();
        Object.assign(f.c.state, {formatos:[], produtosGlobais:[]});
        f.c.localStorage = {getItem: () => null};
        vm.runInContext(extract('mapVibecodeProdutoToOSItem'), f.c);
        let releaseProducts;
        f.c.holdProducts = new Promise(resolve => {releaseProducts = resolve;});
        if (pesquisa) f.ui.search = '1';
        const refresh = f.c.loadOrdens();
        await tick();
        const modelo = {id:9001, modelo:'9001', bloco:25, _dbLoaded:true,
            quantidade:100, num_inicial:1, num_final:100, arte_url:'arte-sintetica.pdf'};
        const modelos = [modelo];
        f.c.state.osItens.vibe_1 = modelos;
        if (uso === 'pedido') f.c.state.pedidoAberto = {osId:'vibe_1'};
        if (uso === 'modelo') f.c.state.activeOSItem = {osId:'vibe_1', itemId:9001};
        if (uso === 'combinacao') f.c.state.selectedOSItems = [{osId:'vibe_1', itemId:9001}];
        releaseProducts();
        ok(await refresh, 'refresh tardio conclui');
        ok(f.c.state.osItens.vibe_1 === modelos, `${pesquisa ? 'pesquisa' : 'lista'} preserva modelos em ${uso}`);
        ok(f.c.state.osItens.vibe_1[0].bloco === 25 && f.c.state.osItens.vibe_1[0].id === 9001,
            'bloco e identidade conservados antes do clique');
        delete f.c.state.pedidoAberto;
        delete f.c.state.activeOSItem;
        f.c.state.selectedOSItems = [];
        f.c.holdProducts = null;
        ok(await f.c.loadOrdens(), 'pedido fechado pode atualizar');
        ok(f.c.state.osItens.vibe_1[0].id === 'vibe_item_1', 'resumo ERP continua atualizando pedido fora de uso');
    }
    console.log(JSON.stringify({ checks, syntheticCompletedProposals: 4744, selectiveCalls, completeCalls }));
})().catch(e => { console.error(e); process.exitCode = 1; });
