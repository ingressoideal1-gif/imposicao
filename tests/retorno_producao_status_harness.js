// Regressao: producao -> Corrigir Arte -> PRONTO, individual e em lote.
// Executa as funcoes reais com banco em memoria; nenhuma chamada de rede.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert/strict');

const fonte = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'script.js'), 'utf8')
    .replace(/\r\n/g, '\n');
function funcao(nome) {
    const inicio = fonte.indexOf('function ' + nome + '(');
    assert(inicio >= 0, nome);
    const fim = fonte.indexOf('\n}', inicio);
    return (fonte.slice(inicio - 6, inicio) === 'async ' ? 'async ' : '')
        + fonte.slice(inicio, fim + 2);
}
function constante(nome) {
    const inicio = fonte.indexOf('const ' + nome + ' =');
    assert(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf(';', inicio) + 1);
}
const nomes = ['calcularStatusConsolidadoPedidoArte', 'sincronizarStatusConsolidadoPedidoArte',
    'atualizarPedidoArteConfirmado', 'marcarEstagioDaArteNoErp', 'devolverArteParaAlteracao',
    'buscarModeloPersistidoDaDecisao', 'salvarSaidaCorrecaoArteConfirmada', 'decisionAmostraItem',
    'promoverPedidoSeTodosProntos', 'reconciliarStatusPersistidosDaListaArte',
    'pedidoCancelado', 'pedidoSaiuDaArte', 'normalizarStatusImpressao', 'modeloEmCorrecaoDeArte',
    'modeloEstaAprovado', 'planoDaAcaoEmLote', 'nomeDoModeloParaLista', 'textoDoPlanoEmLote',
    'voltarParaAtendimento'];
const constantes = ['ARTE_APROVADOS', 'ARTE_REPROVADOS', 'STATUS_CORRIGIR_ARTE',
    'SINAIS_SAIU_DA_ARTE', 'SINAIS_CANCELADO', 'ROTULO_DA_ACAO_EM_LOTE',
    'ESTAGIOS_QUE_A_ARTE_PRONTA_SUBSTITUI'];
const inicioLote = fonte.indexOf('window.acaoEmLoteNoPedido = async function');
assert(inicioLote >= 0);
const codigo = constantes.map(constante).concat(nomes.map(funcao),
    fonte.slice(inicioLote, fonte.indexOf('\n};', inicioLote) + 3)).join('\n');

function ambiente(statusInterno = 'EM PRODUCAO', statusArte = 'APROVADO') {
    const numero = 22001, osId = 'vibe_' + numero;
    const banco = {
        pedidos_modelos: [{ id: 1002001, id_int: numero, status_arte: 'APROVADA', status_impressao: 'Aguardando' }],
        pedidos_artes: [{ id: 'arte-1', id_int: numero, status: statusArte, entrega_dados: 'APROVADO', observacoes: {} }],
        pedidos_links_cliente: [{ os_id: osId, status_arte: 'APROVADO' }]
    };
    const log = { updates: [], overrides: [], avisos: [], erros: [], preparosLink: 0 };
    let falharConsolidado = false;
    const cliente = { from(tabela) {
        assert(banco[tabela], 'tabela simulada: ' + tabela);
        const filtros = []; let payload;
        const executar = unico => {
            const linhas = banco[tabela].filter(linha => filtros.every(([k, v]) => String(linha[k]) === String(v)));
            if (payload && tabela === 'pedidos_artes' && falharConsolidado) {
                return { data: null, error: { message: 'falha simulada no consolidado' } };
            }
            if (payload) {
                linhas.forEach(linha => Object.assign(linha, structuredClone(payload)));
                log.updates.push({ tabela, payload: structuredClone(payload) });
            }
            return { data: structuredClone(unico ? linhas[0] || null : linhas), error: null };
        };
        return {
            select() { return this; }, update(p) { payload = p; return this; },
            eq(k, v) { filtros.push([k, v]); return this; }, order() { return this; },
            single() { return Promise.resolve(executar(true)); },
            maybeSingle() { return Promise.resolve(executar(true)); },
            then(resolver, rejeitar) { return Promise.resolve(executar(false)).then(resolver, rejeitar); }
        };
    } };
    const os = { id: osId, numero, status: statusArte, status_interno: statusInterno };
    const state = { ordens: [os], osItens: {}, modelosGlobais: {}, todasArtes: [], amostrasOSAtivo: osId,
        amostrasContainerId: 'amostras-os-itens-container' };
    const recarregar = async () => {
        const modelos = banco.pedidos_modelos.map(m => ({ ...m,
            amostra_status: m.status_arte === 'APROVADA' ? 'APROVADA'
                : m.status_arte === 'AGUARDANDO_CLIENTE' ? 'PRONTO' : 'REPROVADA' }));
        state.osItens[osId] = modelos;
        state.modelosGlobais[numero] = structuredClone(modelos);
        state.todasArtes = structuredClone(banco.pedidos_artes);
    };
    const contexto = {
        window: {}, state, supabaseClient: cliente, vibeClient: cliente,
        document: { getElementById: () => null }, ESCALA_DA_AMOSTRA: 1,
        console: { warn: (...a) => log.erros.push(a), error: (...a) => log.erros.push(a), log() {} },
        toast: (texto, tipo) => log.avisos.push({ texto, tipo }), confirm: () => true,
        temSessaoDoSupabase: async () => true, pedidoIgnoradoNosPaineis: o => !!o.ignorado,
        gravarStatusOverride: (...a) => log.overrides.push(a),
        podeAgirEmLoteNoPedido: () => true, podeDestravarModeloAprovado: () => false,
        distribuicaoOrfaDoModelo: () => null, divergenciaDeCelulasDoModelo: () => null,
        bancoDeDadosIncompletoDoModelo: () => null, fonteSemGlifoDoModelo: () => null,
        garantirTabelasDaAmostra: async () => {}, regenerarAmostraDoModelo: async () => {},
        renderAmostrasOSItens() {}, loadOSItens: recarregar, findOSInState: () => os,
        substituirPendenteInformacao: async () => {}, garantirLinhaDePedidoArte: async () => true,
        prepararLinkDaArtePronta: async () => { log.preparosLink++; return { ok: true }; },
        clearAmostrasOS() {}, showView() {},
        saveAmostraToDB: async (id, _, dados) => {
            const modelo = banco.pedidos_modelos.find(m => m.id === id);
            modelo.status_arte = dados.amostra_status === 'PRONTO' ? 'AGUARDANDO_CLIENTE' : dados.amostra_status;
            Object.assign(state.osItens[osId].find(m => m.id === id), dados);
        }
    };
    vm.createContext(contexto);
    vm.runInContext(codigo, contexto);
    return { contexto, banco, log, os, state, osId, numero, recarregar,
        falharConsolidado: valor => { falharConsolidado = valor; } };
}

const casos = [];
function caso(nome, executar) { casos.push([nome, executar]); }
for (const status of ['EM PRODUCAO', 'EM IMPRESSAO', 'REVISAO PRODUCAO', 'EM ACABAMENTO', 'EXPEDICAO', 'ENTREGUE', 'CANCELADO']) {
    caso(status + ': promocao nao reabre aprovacao', async () => {
        const a = ambiente(status, 'Em Alteração'); await a.recarregar();
        a.state.osItens[a.osId][0].amostra_status = 'PRONTO';
        assert.equal(await a.contexto.promoverPedidoSeTodosProntos(a.osId), false);
        assert.equal(a.log.updates.length, 0);
        assert.equal(a.log.overrides.length, 0);
        assert.equal(a.os.status, 'Em Alteração');
    });
}
caso('todos aprovados sem status ERP nao viram Enviar Arte', async () => {
    const a = ambiente('', 'APROVADO'); await a.recarregar();
    assert.equal(await a.contexto.promoverPedidoSeTodosProntos(a.osId), false);
    assert.equal(a.banco.pedidos_links_cliente[0].status_arte, 'APROVADO');
});
for (const lote of [false, true]) {
    caso('ciclo completo de correcao ' + (lote ? 'em lote' : 'individual'), async () => {
        const a = ambiente(); await a.recarregar();
        assert.equal(await a.contexto.devolverArteParaAlteracao(1002001, a.osId), true);
        assert.equal(a.banco.pedidos_artes[0].status, 'Em Alteração');
        assert.equal(a.banco.pedidos_modelos[0].status_impressao, 'Corrigir Arte');
        if (lote) await a.contexto.window.acaoEmLoteNoPedido(a.osId, 'PRONTO');
        else assert.equal(await a.contexto.decisionAmostraItem(1002001, a.osId, 'PRONTO'), true);
        assert.equal(a.banco.pedidos_modelos[0].status_arte, 'APROVADA');
        assert.equal(a.banco.pedidos_modelos[0].status_impressao, 'Aguardando');
        assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
        assert.equal(a.os.status_interno, 'EM PRODUCAO');
        assert.equal(a.banco.pedidos_links_cliente[0].status_arte, 'APROVADO');
        assert.equal(a.log.overrides.length, 0);
    });
}
caso('Voltar para Atendimento apos correcao preserva arte e link aprovados', async () => {
    const a = ambiente(); await a.recarregar();
    await a.contexto.devolverArteParaAlteracao(1002001, a.osId);
    await a.contexto.decisionAmostraItem(1002001, a.osId, 'PRONTO');
    await a.contexto.voltarParaAtendimento();
    assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
    assert.equal(a.banco.pedidos_links_cliente[0].status_arte, 'APROVADO');
    assert.equal(a.log.preparosLink, 0);
    assert.equal(a.log.overrides.length, 0);
});
caso('Voltar para Atendimento nao reenvia pedido aprovado com ERP ausente', async () => {
    const a = ambiente('', 'APROVADO'); await a.recarregar();
    await a.contexto.voltarParaAtendimento();
    assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
    assert.equal(a.log.preparosLink, 0);
});
caso('Voltar para Atendimento prepara o link da arte inicial pronta', async () => {
    const a = ambiente('', 'Em Arte');
    a.banco.pedidos_modelos[0].status_arte = 'AGUARDANDO_CLIENTE'; await a.recarregar();
    await a.contexto.voltarParaAtendimento();
    assert.equal(a.banco.pedidos_artes[0].status, 'Enviar Arte');
    assert.equal(a.log.preparosLink, 1);
});
caso('Voltar para Atendimento bloqueia cancelado e informa falha do consolidado', async () => {
    const cancelado = ambiente('CANCELADO'); await cancelado.recarregar();
    await cancelado.contexto.voltarParaAtendimento();
    assert.equal(cancelado.log.updates.length, 0);
    assert.equal(cancelado.log.preparosLink, 0);
    const falha = ambiente('EM PRODUCAO', 'Enviar Arte'); await falha.recarregar();
    falha.falharConsolidado(true);
    await falha.contexto.voltarParaAtendimento();
    assert(falha.log.avisos.some(a => a.tipo === 'error'));
    assert.equal(falha.log.preparosLink, 0);
    assert.equal(falha.log.overrides.length, 0);
});
caso('correcao em lote preserva outro modelo ja impresso', async () => {
    const a = ambiente();
    a.banco.pedidos_modelos.push({ id: 1002002, id_int: a.numero,
        status_arte: 'APROVADA', status_impressao: 'Impresso' });
    await a.recarregar();
    await a.contexto.devolverArteParaAlteracao(1002001, a.osId);
    await a.contexto.window.acaoEmLoteNoPedido(a.osId, 'PRONTO');
    assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
    assert.equal(a.banco.pedidos_modelos[1].status_impressao, 'Impresso');
    assert.equal(a.log.updates.filter(u => u.tabela === 'pedidos_modelos').length, 2);
});
caso('marca Corrigir Arte pendente bloqueia promocao mesmo sem status ERP', async () => {
    const a = ambiente('', 'Em Alteração'); await a.recarregar();
    Object.assign(a.state.osItens[a.osId][0], { amostra_status: 'PRONTO', status_impressao: 'Corrigir Arte' });
    assert.equal(await a.contexto.promoverPedidoSeTodosProntos(a.osId), false);
    assert.equal(a.log.updates.length, 0);
});
caso('arte inicial com modelo pronto e outro aprovado avanca normalmente', async () => {
    const a = ambiente('', 'Em Arte');
    a.banco.pedidos_modelos.push({ id: 1002002, id_int: a.numero, status_arte: 'AGUARDANDO_CLIENTE', status_impressao: 'Aguardando' });
    await a.recarregar();
    assert.equal(await a.contexto.promoverPedidoSeTodosProntos(a.osId), true);
    assert.equal(a.banco.pedidos_artes[0].status, 'Enviar Arte');
    assert.equal(a.banco.pedidos_links_cliente[0].status_arte, 'Enviar Arte');
});
caso('reconciliacao recupera Enviar Arte na producao com modelos aprovados', async () => {
    const a = ambiente('EM PRODUCAO', 'Enviar Arte'); await a.recarregar();
    const r = await a.contexto.reconciliarStatusPersistidosDaListaArte();
    assert.equal(r.verificados, 1);
    assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
});
caso('falha do consolidado e recuperada sem repetir a decisao do modelo', async () => {
    const a = ambiente('EM PRODUCAO', 'Enviar Arte'); await a.recarregar();
    await a.contexto.devolverArteParaAlteracao(1002001, a.osId);
    a.banco.pedidos_artes[0].status = 'Enviar Arte';
    a.falharConsolidado(true);
    assert.equal(await a.contexto.decisionAmostraItem(1002001, a.osId, 'PRONTO'), false);
    assert.equal(a.banco.pedidos_modelos[0].status_arte, 'APROVADA');
    const escritasModelo = a.log.updates.filter(u => u.tabela === 'pedidos_modelos').length;
    a.falharConsolidado(false);
    a.state.modelosGlobais = {}; // a recuperacao precisa reler os modelos persistidos
    await a.contexto.reconciliarStatusPersistidosDaListaArte();
    assert.equal(a.banco.pedidos_artes[0].status, 'APROVADO');
    assert.equal(a.log.updates.filter(u => u.tabela === 'pedidos_modelos').length, escritasModelo);
});
caso('reconciliacao preserva correcao de dados', async () => {
    const a = ambiente('EM PRODUCAO', 'Enviar Arte');
    a.banco.pedidos_artes[0].entrega_dados = 'CORRIGIR'; await a.recarregar();
    await a.contexto.reconciliarStatusPersistidosDaListaArte();
    assert.equal(a.banco.pedidos_artes[0].status, 'Corrigir Dados');
});
caso('retorno explicito Em Arte e historico aprovado nao sao reconciliados', async () => {
    for (const status of ['Em Arte', 'APROVADO']) {
        const a = ambiente('EM PRODUCAO', status); await a.recarregar();
        assert.equal((await a.contexto.reconciliarStatusPersistidosDaListaArte()).verificados, 0);
        assert.equal(a.log.updates.length, 0);
    }
});

(async () => {
    let falhas = 0;
    for (const [nome, executar] of casos) {
        try { await executar(); }
        catch (e) { falhas++; console.error('FALHOU: ' + nome + '\n' + e.message); }
    }
    if (falhas) { console.error(falhas + '/' + casos.length + ' casos falharam'); process.exitCode = 1; }
    else console.log('OK: retorno producao/status -- ' + casos.length + ' casos');
})();
