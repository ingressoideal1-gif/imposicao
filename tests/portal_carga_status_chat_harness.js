// Offline: executa a carga, a classificação da aba e as decisões reais com banco simulado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.resolve(__dirname, '..');
const cliente = fs.readFileSync(path.join(raiz, 'frontend/cliente.js'), 'utf8');
const shell = fs.readFileSync(path.join(raiz, 'frontend/cliente-shell.js'), 'utf8');
function funcao(fonte, nome) {
    const inicio = fonte.search(new RegExp('(?:async )?function ' + nome + '\\('));
    assert.ok(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
function ambiente(opcoes = {}) {
    const campos = {};
    for (const id of ['cliente-loading', 'cliente-error', 'cliente-content', 'portal-abas',
        'portal-trilha', 'cliente-aviso-chat', 'cliente-pedido-numero', 'cliente-pedido-cliente',
        'cliente-amostras-itens-container', 'btn-cliente-aprovar-tudo']) {
        campos[id] = { style: {}, hidden: true, textContent: '', innerHTML: '' };
    }
    const modelo = { id: 12, id_int: 123, nome_modelo: 'Modelo teste',
        status_arte: 'AGUARDANDO_CLIENTE', amostra_num_id: 'n1' };
    const arte = { id: 'a1', id_int: 123, status: opcoes.status || 'Enviar Arte', entrega_dados: '',
        observacoes: {}, created_at: '2026-09-26T12:00:00Z' };
    const tabelas = {
        pedidos_modelos: opcoes.semModelos ? [] : [modelo],
        pedidos_artes: opcoes.semArtes ? [] : [arte],
        produtos_proposta: [], producao_cores: [], producao_formatos: [], produtos: [],
        producao_numeracoes: [{ id: 'n1', print_mode: 'front', elements: [], csv_data: [] }],
        producao_ordens_servico: { id: 'os-local', status: 'EM PRODUCAO' }
    };
    const chamadas = [], avisos = [], telas = [], aberturas = [];
    const osId = opcoes.local ? 'os-local' : 'vibe_123';
    const banco = {
        async rpc() {
            if (opcoes.erroLink) return { error: { message: 'offline' }, data: null };
            return { data: opcoes.linkInvalido ? [] : [{ id: 'l1', os_id: osId,
                numero_pedido: '123', status_arte: opcoes.statusLink || 'APROVADO' }] };
        },
        from(tabela) {
            let op = 'select', payload, colunas = '';
            const q = {
                select(c) { colunas = c; return q; }, eq() { return q; }, in() { return q; },
                order() { return q; }, limit() { return q; }, maybeSingle() { return q; },
                update(d) { op = 'update'; payload = d; return q; },
                insert(d) { op = 'insert'; payload = d; return q; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => {
                        chamadas.push({ tabela, op, payload });
                        if (opcoes.falha === tabela || (opcoes.miolo && colunas === 'id, elements, csv_data')) {
                            return { data: null, error: { message: 'consulta recusada' } };
                        }
                        if (tabela === 'propostas_chat') {
                            if (opcoes.chat === 'rede') throw new Error('offline');
                            return opcoes.chat === 'erro' ? { error: { message: 'recusado' } } : { error: null };
                        }
                        if (opcoes.mioloVazio && colunas === 'id, elements, csv_data') return { data: [] };
                        if (op === 'update') tabelas[tabela].forEach(r => Object.assign(r, payload));
                        return { data: tabelas[tabela], error: null };
                    }).then(resolve, reject);
                }
            };
            return q;
        }
    };
    const c = {
        console: { log() {}, warn() {}, error() {} },
        state: { osItens: {}, numeracoes: [], cores: [] }, clienteState: {}, supabaseClient: banco,
        document: { getElementById: id => campos[id] || null, querySelector: () => ({ style: {} }) },
        PortalBancos: { carregar: async () => {} }, bancoDesenhosCliente: new Map(),
        carregarBancosDoPortal() {}, carregarPortal: async () => opcoes.portalNulo ? null
            : { pedido: { id_cliente: 1, cliente: 'Cliente teste' }, entrega: { entrega_dados: '' } },
        numeracaoTemVersoNoPortal: () => false, armarMarcaDeQueOClienteOlhou() {},
        registrarSecao: (_nome, fn) => { c.desenharArte = fn; },
        montarPortal: status => { c.statusMontado = status; c.desenharArte(); },
        renderAmostrasOSItens() {}, cartaoDoQueFaltaNaArte() {},
        avisoDaArte: (_icone, _cor, titulo) => telas.push(titulo), pedidosDeAlteracaoDoCliente: () => [],
        problemaDoBancoCliente: () => false, numDoItem: () => null,
        mensagemDaAprovacaoDeArte: () => 'Arte aprovada',
        toast: msg => avisos.push(msg), pintarSeloDoStatus() {}, redesenharSecao() {},
        abrirSecao: secao => aberturas.push(secao),
        mostrarProximaEtapaAposArte: () => aberturas.push('recibo-arte'),
        gravarStatusDoLink: async () => {}, escapeHtml: s => String(s)
    };
    c.window = c;
    vm.createContext(c);
    const regras = cliente.slice(cliente.indexOf('const STATUS_MODELO_APROVADO_PARA_PEDIDO'),
        cliente.indexOf('async function sincronizarStatusConsolidadoPedidoArteCliente'));
    vm.runInContext(regras + '\n' + ['initClientePage', 'mostrarErroDeCargaCliente', 'carregarMioloDasNumeracoes',
        'desenharSecaoArte', 'registrarChatCliente', 'clienteFinalizarFluxo', 'decisionAmostraItem',
        'saveAmostraToDB', 'sincronizarStatusConsolidadoPedidoArteCliente'].map(n => funcao(cliente, n)).join('\n')
        + '\n' + ['semAcento', 'seloDoStatus'].map(n => funcao(shell, n)).join('\n'), c);
    return { c, campos, chamadas, tabelas, avisos, telas, aberturas, osId };
}
let total = 0;
async function testar(nome, executar) { await executar(); total++; console.log('OK: ' + nome); }
(async () => {
    for (const opcoes of [{ portalNulo: true }, { erroLink: true }, { miolo: true }, { mioloVazio: true },
        ...['pedidos_modelos', 'pedidos_artes', 'produtos_proposta', 'producao_cores', 'producao_numeracoes',
            'producao_formatos', 'produtos'].map(falha => ({ falha }))]) {
        await testar('carga recusada impede portal parcial: ' + JSON.stringify(opcoes), async () => {
            const a = ambiente(opcoes);
            await a.c.initClientePage('123', 'sintetico');
            assert.equal(a.c.statusMontado, undefined);
            assert.equal(a.campos['cliente-content'].style.display, 'none');
            assert.equal(a.campos['portal-abas'].hidden, true);
            assert.match(a.campos['cliente-error'].innerHTML, /Tentar novamente/);
            assert.doesNotMatch(a.campos['cliente-error'].innerHTML, /Link inválido/);
            assert.ok(a.chamadas.every(q => q.op === 'select'));
        });
    }
    await testar('link inválido é diferente de falha de carregamento', async () => {
        const a = ambiente({ linkInvalido: true });
        await a.c.initClientePage('123', 'sintetico');
        assert.match(a.campos['cliente-error'].innerHTML, /Link inválido/);
        assert.equal(a.chamadas.length, 0);
    });
    await testar('pedido genuinamente sem modelos permanece acessível e não aprova', async () => {
        const a = ambiente({ semModelos: true });
        await a.c.initClientePage('123', 'sintetico');
        assert.equal(a.c.state.osItens[a.osId].length, 0);
        assert.equal(a.campos['cliente-content'].style.display, 'block');
        await a.c.clienteFinalizarFluxo('APROVAR_TUDO');
        assert.ok(a.chamadas.every(q => q.op === 'select'));
    });
    for (const [status, chave, leitura] of [['Apr Parcial', 'aprovar', false],
        ['Dados Pendentes', 'aprovado', true], ['Em Alteração', 'correcao', true],
        ['Em Arte', 'preparando', true], ['Em Aprovação', 'aprovar', false],
        ['APROVADO', 'aprovado', true], ['EM PRODUCAO', 'producao', true],
        ['Corrigir Dados', 'correcao-dados', true]]) {
        await testar('reabertura usa status consolidado: ' + status, async () => {
            for (const local of [false, true]) {
                // Novo contexto simula F5: nenhuma decisão local sobrevive à abertura.
                const a = ambiente({ status, statusLink: 'Enviar Arte', local });
                await a.c.initClientePage('123', 'sintetico');
                assert.equal(a.c.statusMontado, status);
                assert.equal(a.c.seloDoStatus(a.c.clienteState.statusArte).chave, chave);
                assert.equal(a.c.state.arteSomenteLeitura, leitura);
                if (status === 'Corrigir Dados') assert.equal(a.telas.at(-1), 'Dados em correção');
                assert.ok(a.chamadas.every(q => q.op === 'select'));
                assert.ok(!a.chamadas.some(q => q.tabela === 'producao_ordens_servico'));
            }
        });
    }
    await testar('legado sem registro de arte preserva status do link e reserva da OS local', async () => {
        for (const local of [false, true]) {
            const a = ambiente({ semArtes: true, statusLink: 'Enviar Arte', local });
            await a.c.initClientePage('123', 'sintetico');
            assert.equal(a.c.statusMontado, local ? 'EM PRODUCAO' : 'Enviar Arte');
        }
    });
    for (const chat of ['erro', 'rede', 'ok']) {
        for (const fluxo of ['individual', 'APROVAR_TUDO', 'SOLICITAR_ALTERACAO']) {
            await testar('histórico ' + chat + ', decisão ' + fluxo, async () => {
                const a = ambiente({ chat });
                await a.c.initClientePage('123', 'sintetico');
                // Evita o avanço temporizado após a última aprovação individual.
                a.c.state.arteSomenteLeitura = true;
                if (fluxo === 'individual') await a.c.decisionAmostraItem(12, a.osId, 'APROVADA');
                else await a.c.clienteFinalizarFluxo(fluxo);
                // O histórico agora conclui independentemente do avanço da aprovação.
                await new Promise(resolve => setImmediate(resolve));
                const inserts = a.chamadas.filter(q => q.tabela === 'propostas_chat');
                assert.equal(inserts.length, 1, 'sem repetição automática de escrita');
                assert.equal(a.campos['cliente-aviso-chat'].hidden, chat === 'ok');
                if (chat !== 'ok') assert.match(a.campos['cliente-aviso-chat'].textContent, /Não é necessário aprovar novamente/);
                assert.ok(!a.avisos.some(msg => /Erro ao/.test(msg)), a.avisos.join(';'));
                if (fluxo !== 'SOLICITAR_ALTERACAO') assert.equal(a.tabelas.pedidos_modelos[0].status_arte, 'APROVADA_CLIENTE');
                if (fluxo === 'APROVAR_TUDO') assert.equal(a.aberturas.at(-1), 'recibo-arte');
                if (fluxo === 'SOLICITAR_ALTERACAO') assert.equal(a.c.clienteState.statusArte, 'Em Alteração');
                assert.equal(a.c.state.portalGravandoArte, false);
            });
        }
    }
    await testar('sucesso posterior no chat não apaga aviso de registro anterior pendente', async () => {
        const opcoes = { chat: 'erro' }, a = ambiente(opcoes);
        await a.c.registrarChatCliente({ mensagem: 'primeira' });
        opcoes.chat = 'ok';
        await a.c.registrarChatCliente({ mensagem: 'segunda' });
        assert.equal(a.campos['cliente-aviso-chat'].hidden, false);
    });
    console.log('OK: ' + total + ' cenários de carga, status e histórico.');
})().catch(e => { console.error(e); process.exitCode = 1; });
