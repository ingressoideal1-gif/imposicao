// Regressao do clique real, com banco simulado e recarga sem localStorage.
const assert = require('assert/strict');
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync(require('path').join(__dirname, '../frontend/script.js'), 'utf8').replace(/\r\n/g, '\n');
function func(nome) {
    const inicio = src.search(new RegExp('^(?:async )?function ' + nome + '\\(', 'm'));
    assert(inicio >= 0, nome);
    return src.slice(inicio, src.indexOf('\n}', inicio) + 2);
}
function constante(nome) {
    const inicio = src.indexOf('const ' + nome + ' = ');
    return src.slice(inicio, src.indexOf(';\n', inicio) + 1);
}
function montar({ erro, vazio, status = 'NOVO', semLink = false, aprovado = false, entrega = null, nativo = false, reprovado = false } = {}) {
    const os = { id: nativo ? 'os-900' : 'vibe_900', numero: 900, status: 'Em Aprovação', status_interno: status };
    const db = {
        pedidos_artes: [{ id: 'arte', id_int: 900, status: 'Em Aprovação', entrega_dados: entrega }],
        pedidos_links_cliente: semLink ? [] : [{ id: 'link', os_id: os.id, status_arte: 'Em Aprovação', cliente_abriu_em: '2026-09-24T12:00:00Z' }],
        producao_ordens_servico: nativo ? [{ id: os.id, status: os.status }] : []
    };
    const modelos = [{ id: 1, status_arte: reprovado ? 'REPROVADA_CLIENTE' : aprovado ? 'APROVADA_CLIENTE' : 'AGUARDANDO' }];
    const state = { ordens: [os], amostrasOSAtivo: os.id, osItens: { [os.id]: [{ amostra_status: aprovado ? 'APROVADA' : 'PRONTO' }] }, modelosGlobais: { 900: modelos },
        todasArtes: structuredClone(db.pedidos_artes), linksClienteData: { [os.id]: structuredClone(db.pedidos_links_cliente[0]) } };
    state.todasArtes[0].campoLocalPreservado = 'preservar';
    const avisos = [], escritas = [];
    const client = { from(tabela) {
        let payload;
        const filtros = [];
        const q = {
            update(p) { payload = p; return q; }, select() { return q; },
            eq(k, v) { filtros.push(r => r[k] === v); return q; },
            in(k, vs) { filtros.push(r => vs.includes(r[k])); return q; },
            then(resolve, reject) {
                if (erro === tabela && payload) return Promise.resolve({ data: null, error: { message: 'recusado' } }).then(resolve, reject);
                const rows = (db[tabela] || []).filter(r => filtros.every(f => f(r)));
                if (payload && vazio === tabela) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                if (payload) { escritas.push(tabela); rows.forEach(r => Object.assign(r, payload)); }
                return Promise.resolve({ data: structuredClone(rows), error: null }).then(resolve, reject);
            }
        };
        return q;
    } };
    const ctx = { state, supabaseClient: client, vibeClient: client, console: { error() {} },
        temSessaoDoSupabase: async () => true, pedidoIgnoradoNosPaineis: () => false,
        toast: (msg, tipo) => avisos.push({ msg, tipo }), confirm: () => true,
        garantirLinhaDePedidoArte: async () => true, substituirPendenteInformacao: async () => {},
        gravarStatusOverride() {}, renderOrdens() {}, clearAmostrasOS() {}, showView() {} };
    ctx.window = ctx;
    vm.createContext(ctx);
    const nomes = ['pedidoCancelado', 'pedidoSaiuDaArte', 'normalizarStatusImpressao', 'modeloEmCorrecaoDeArte',
        'classificarPedidoNaArte', 'atualizarPedidoArteConfirmado', 'prepararModelosReprovadosParaRetornoAArte', 'voltarParaArte',
        'sincronizarStatusOrdensDinamico', 'sincronizarPedidosProntosParaEnvio', 'reconciliarStatusPersistidosDaListaArte'];
    if (src.includes('async function registrarRetornoParaArte(')) nomes.push('registrarRetornoParaArte');
    const consts = ['SINAIS_CANCELADO', 'SINAIS_SAIU_DA_ARTE', 'ARTE_APROVADOS', 'ARTE_REPROVADOS', 'ARTE_EM_APROVACAO', 'ARTE_COM_O_DESIGNER', 'STATUS_CORRIGIR_ARTE'];
    const inicioLista = src.indexOf('window.voltarParaArteFromLista = async function');
    vm.runInContext(consts.map(constante).join('\n') + '\n' + nomes.map(func).join('\n') + '\n'
        + src.slice(inicioLista, src.indexOf('\n};', inicioLista) + 3), ctx);
    return { ctx, state, os, db, avisos, escritas, modelos };
}

(async () => {
    for (const acao of ['voltarParaArte', 'voltarParaArteFromLista']) {
        for (const opcoes of [{}, { semLink: true }, { aprovado: true, entrega: 'CORRIGIR' },
            { aprovado: true, entrega: 'APROVADO' }, { reprovado: true }, { nativo: true }]) {
            const x = montar(opcoes);
            const modelosAntes = JSON.stringify(x.modelos);
            await x.ctx[acao](x.os.id);
            assert.equal(x.ctx.classificarPedidoNaArte(x.os).fila, 'fila', acao + ': volta sem marcar Em Alteração');
            assert.equal(x.state.todasArtes[0].campoLocalPreservado, 'preservar', 'preserva dados em memoria fora do status');
            x.state.todasArtes = structuredClone(x.db.pedidos_artes);
            x.state.linksClienteData = { [x.os.id]: structuredClone(x.db.pedidos_links_cliente[0]) };
            x.os.status = x.db.pedidos_links_cliente[0]?.status_arte || 'Em Arte';
            const antesSync = x.escritas.length;
            await x.ctx.sincronizarStatusOrdensDinamico();
            assert.equal(x.escritas.length, antesSync, 'reconciliacao automatica nao desfaz o retorno');
            assert.equal(x.ctx.classificarPedidoNaArte(x.os).fila, 'fila', acao + ': persiste apos recarga');
            assert.equal(JSON.stringify(x.modelos), modelosAntes, 'preserva aprovacoes dos modelos');
            assert.equal(x.db.pedidos_artes[0].entrega_dados, opcoes.entrega || null, 'preserva entrega');
            if (!opcoes.semLink) assert.equal(x.db.pedidos_links_cliente[0].cliente_abriu_em, '2026-09-24T12:00:00Z', 'preserva historico do link');
            // A nova versao segue o ciclo normal de envio e abertura.
            x.state.todasArtes[0].status = 'Enviar Arte';
            x.os.status = 'Enviar Arte';
            x.state.modelosGlobais[900] = [{ status_arte: 'AGUARDANDO' }];
            x.state.todasArtes[0].entrega_dados = null;
            x.state.linksClienteData[x.os.id] = { cliente_abriu_em: null };
            assert.equal(x.ctx.classificarPedidoNaArte(x.os).fila, 'aprovacao');
            x.state.linksClienteData[x.os.id].cliente_abriu_em = '2026-09-25T15:00:00Z';
            assert.equal(x.ctx.classificarPedidoNaArte(x.os).statusCalculado, 'Em Aprovação');
        }
        for (const opcoes of [{ erro: 'pedidos_artes' }, { vazio: 'pedidos_artes' },
            { erro: 'pedidos_links_cliente' }, { vazio: 'pedidos_links_cliente' },
            { nativo: true, vazio: 'producao_ordens_servico' }]) {
            const x = montar(opcoes);
            await x.ctx[acao](x.os.id);
            assert(x.avisos.some(a => a.tipo === 'error'), acao + ': falha de persistencia visivel');
            assert(!x.avisos.some(a => a.tipo === 'info'), acao + ': nao anuncia sucesso falso');
        }
        const cancelado = montar({ status: 'CANCELADO' });
        await cancelado.ctx[acao](cancelado.os.id);
        assert.equal(cancelado.escritas.length, 0, 'cancelado nao e alterado');
        assert.equal(cancelado.ctx.classificarPedidoNaArte(cancelado.os).fila, 'concluidos');
    }
    const expedido = montar({ status: 'EXPEDICAO' });
    expedido.state.todasArtes[0].status = 'Em Arte';
    assert.equal(expedido.ctx.classificarPedidoNaArte(expedido.os).fila, 'concluidos', 'ERP preservado sem modelo em retrabalho');
    expedido.modelos[0].status_impressao = 'Corrigir Arte';
    assert.equal(expedido.ctx.classificarPedidoNaArte(expedido.os).fila, 'fila', 'retrabalho por modelo continua valendo');
    console.log('OK: retorno por ambos os botoes, recarga, falhas e protecoes do fluxo.');
})().catch(e => { console.error(e); process.exitCode = 1; });
