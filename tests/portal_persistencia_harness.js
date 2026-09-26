// Regressões offline: executa as funções reais com respostas PostgREST simuladas.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.join(__dirname, '..');
const cliente = fs.readFileSync(path.join(raiz, 'frontend/cliente.js'), 'utf8');
const confirmacoes = fs.readFileSync(path.join(raiz, 'frontend/cliente-confirmacoes.js'), 'utf8');
function funcao(nome) {
    const inicio = cliente.indexOf('async function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return cliente.slice(inicio, cliente.indexOf('\n}', inicio) + 2);
}
let total = 0;
async function teste(nome, executar) {
    await executar();
    total++;
    console.log('OK: ' + nome);
}
function ambiente() {
    const modelo = { id: 12, id_int: 123, amostra_status: 'PRONTO', status_arte: 'AGUARDANDO_CLIENTE' };
    const chamadas = [];
    const avisos = [];
    const aberturas = [];
    const campos = {};
    let payload;
    const filtros = [];
    const banco = {
        from(tabela) {
            chamadas.push(tabela);
            let op = 'select';
            const q = {
                update(dados) { payload = dados; op = 'update'; return q; },
                insert(dados) { payload = dados; op = 'insert'; return q; },
                eq(coluna, valor) { filtros.push([coluna, valor]); return q; },
                select() { return q; }, order() { return q; }, limit() { return q; }, maybeSingle() { return q; },
                then(resolve, reject) {
                    return Promise.resolve().then(() => banco.responder ? banco.responder({ tabela, op, payload }) : banco.resposta || {
                        data: [{ id: 12, id_int: 123, ...payload }], error: null
                    }).then(resolve, reject);
                }
            };
            return q;
        },
        async rpc(nome, args) {
            chamadas.push({ nome, args });
            return banco.rpcResposta || { data: {
                ok: true, numero: '123', status: 'APROVADO', entrega_dados: 'APROVADO', finalizado: true
            }, error: null };
        }
    };
    const c = vm.createContext({
        console: { log() {}, warn() {}, error() {} },
        supabaseClient: banco, vibeClient: banco,
        state: { osItens: { vibe_123: [modelo] }, amostrasContainerId: 'cliente-amostras-itens-container' },
        clienteState: { numero: '123', osId: 'vibe_123', token: 'sintetico', statusArte: 'Dados Pendentes' },
        document: { getElementById: id => campos[id] || null },
        localStorage: { getItem: () => '{}', setItem() { throw new Error('não deve salvar só no navegador'); } },
        escapeHtml: s => String(s), seloDoStatus: () => ({ chave: 'pendente' }),
        entregaExigeRecebedor: () => false,
        redesenharSecao() {}, atualizarPainelDoPedido() {}, pintarSeloDoStatus() {},
        avisoDeFinalizacao: (...args) => avisos.push(args),
        toast: (...args) => avisos.push(args),
        problemaDoBancoCliente: () => false, numDoItem: () => null,
        renderAmostrasOSItens() {}, mensagemDaAprovacaoDeArte: () => 'aprovado',
        abrirSecao: secao => aberturas.push(secao),
        mostrarProximaEtapaAposArte: () => aberturas.push('recibo-arte'),
        SECOES: ['arte', 'entrega', 'faturamento', 'orcamento', 'pagamento']
    });
    c.window = c;
    const regras = cliente.slice(cliente.indexOf('const STATUS_MODELO_APROVADO_PARA_PEDIDO'),
        cliente.indexOf('async function sincronizarStatusConsolidadoPedidoArteCliente'));
    vm.runInContext(regras + '\n' + ['saveAmostraToDB', 'gravarStatusDoLink',
        'sincronizarStatusConsolidadoPedidoArteCliente', 'gravarCorrecaoDoCliente',
        'registrarChatCliente', 'clienteFinalizarFluxo', 'decisionAmostraItem'].map(funcao).join('\n') + '\n' + confirmacoes, c);
    c.avisoDeFinalizacao = (...args) => avisos.push(args);
    c.portalConfirmacoes.entrega = true;
    c.portalConfirmacoes.faturamento = true;
    // Permite reproduzir também o fluxo antigo, que gravava antes de finalizar.
    return { c, banco, modelo, chamadas, filtros, avisos, aberturas, campos };
}
async function executar() {
    await teste('UPDATE vazio não aprova modelo nem altera memória', async () => {
        const a = ambiente();
        a.banco.resposta = { data: [], error: null };
        await assert.rejects(a.c.saveAmostraToDB(12, 'vibe_123', { amostra_status: 'APROVADA' }));
        assert.equal(a.modelo.amostra_status, 'PRONTO');
    });
    await teste('falha na finalização não marca sucesso nem envia chat separado', async () => {
        const a = ambiente();
        a.modelo.amostra_status = 'APROVADA';
        a.banco.rpcResposta = { data: null, error: { message: 'rollback' } };
        await a.c.finalizarNoPortal();
        assert.notEqual(a.c.clienteState.pedidoFinalizado, true);
        assert.equal(a.c.portalGravandoConfirmacao, false);
        assert.ok(!a.chamadas.includes('propostas_chat'));
        assert.ok(!a.chamadas.includes('status-direto'));
    });
    await teste('modelo é salvo por id + pedido e somente depois muda a tela', async () => {
        const a = ambiente();
        await a.c.saveAmostraToDB(12, 'vibe_123', { amostra_status: 'APROVADA', amostra_obs: 'Conferido' });
        assert.equal(a.modelo.amostra_status, 'APROVADA');
        assert.equal(a.modelo.status_arte, 'APROVADA_CLIENTE');
        assert.deepEqual(a.filtros, [['id', 12], ['id_int', 123]]);
    });
    for (const [nome, resposta] of Object.entries({
        negado: { data: null, error: { message: 'RLS' } },
        duplicado: { data: [{ id: 12 }, { id: 12 }], error: null },
        outroPedido: { data: [{ id: 12, id_int: 999, status_arte: 'APROVADA_CLIENTE' }], error: null },
        outroModelo: { data: [{ id: 99, id_int: 123, status_arte: 'APROVADA_CLIENTE' }], error: null },
        statusDivergente: { data: [{ id: 12, id_int: 123, status_arte: 'REPROVADA_CLIENTE' }], error: null }
    })) {
        await teste('recibo de modelo inválido: ' + nome, async () => {
            const a = ambiente(); a.banco.resposta = resposta;
            await assert.rejects(a.c.saveAmostraToDB(12, 'vibe_123', { amostra_status: 'APROVADA' }));
            assert.equal(a.modelo.amostra_status, 'PRONTO');
        });
    }
    for (const alterar of [a => { a.c.supabaseClient = null; }, a => { a.modelo.id_int = 999; },
        a => { a.modelo._source = 'vibecode'; }, a => { a.c.state.osItens.vibe_123 = []; }]) {
        await teste('sem banco, modelo carregado ou vínculo correto não há aprovação', async () => {
            const a = ambiente(); alterar(a);
            await assert.rejects(a.c.saveAmostraToDB(12, 'vibe_123', { amostra_status: 'APROVADA' }));
            assert.equal(a.chamadas.length, 0);
        });
    }
    await teste('recibo falso da RPC de status interrompe solicitação de alteração', async () => {
        const a = ambiente(); a.banco.rpcResposta = { data: false, error: null };
        await assert.rejects(a.c.gravarStatusDoLink('Em Alteração'));
        await a.c.clienteFinalizarFluxo('SOLICITAR_ALTERACAO');
        assert.equal(a.aberturas.length, 0);
        assert.notEqual(a.c.state.arteSomenteLeitura, true);
        assert.equal(a.c.state.portalGravandoArte, false);
    });
    await teste('decisão do modelo com UPDATE vazio não envia chat nem avança', async () => {
        const a = ambiente(); a.banco.resposta = { data: [], error: null };
        await a.c.decisionAmostraItem(12, 'vibe_123', 'APROVADA');
        assert.deepEqual(a.chamadas, ['pedidos_modelos']);
        assert.equal(a.aberturas.length, 0);
        assert.equal(a.c.state.portalGravandoArte, false);
    });
    await teste('falha parcial em Aprovar tudo aguarda as outras respostas e permite tentar novamente', async () => {
        const a = ambiente(); a.c.state.osItens.vibe_123.push({ id: 13 });
        let liberar, iniciou = 0;
        a.c.saveAmostraToDB = async id => {
            iniciou++;
            if (id === 12) throw new Error('não gravado');
            await new Promise(resolve => { liberar = resolve; });
        };
        const pendente = a.c.clienteFinalizarFluxo('APROVAR_TUDO');
        await Promise.resolve();
        assert.equal(a.c.state.portalGravandoArte, true);
        await a.c.clienteFinalizarFluxo('APROVAR_TUDO');
        assert.equal(iniciou, 2);
        liberar(); await pendente;
        assert.equal(a.c.state.portalGravandoArte, false);
        assert.equal(a.aberturas.length, 0);
        assert.equal(a.chamadas.length, 0);
    });
    await teste('Aprovar tudo avança só depois de modelo e pedido confirmados', async () => {
        const a = ambiente();
        let confirmado = false;
        a.c.sincronizarStatusConsolidadoPedidoArteCliente = async () => {
            assert.equal(a.modelo.status_arte, 'APROVADA_CLIENTE');
            if (!confirmado) throw new Error('pedido não gravado');
            return 'Dados Pendentes';
        };
        await a.c.clienteFinalizarFluxo('APROVAR_TUDO');
        assert.equal(a.aberturas.length, 0);
        assert.notEqual(a.c.state.arteSomenteLeitura, true);
        confirmado = true;
        await a.c.clienteFinalizarFluxo('APROVAR_TUDO');
        assert.deepEqual(a.aberturas, ['recibo-arte']);
        assert.equal(a.c.state.arteSomenteLeitura, true);
    });
    await teste('status consolidado recusa retorno vazio ou divergente e aceita todas as linhas confirmadas', async () => {
        const a = ambiente();
        const linhas = [{ id: 1, id_int: 123, entrega_dados: 'APROVADO' }, { id: 2, id_int: 123, entrega_dados: 'APROVADO' }];
        let gravadas = [];
        a.banco.responder = ({ op }) => ({ data: op === 'update' ? gravadas : linhas, error: null });
        a.modelo.status_arte = 'APROVADA_CLIENTE';
        await assert.rejects(a.c.sincronizarStatusConsolidadoPedidoArteCliente(123, [a.modelo]));
        gravadas = [{ ...linhas[0], status: 'APROVADO' }];
        await assert.rejects(a.c.sincronizarStatusConsolidadoPedidoArteCliente(123, [a.modelo]));
        gravadas = linhas.map(l => ({ ...l, status: 'APROVADO' }));
        assert.equal(await a.c.sincronizarStatusConsolidadoPedidoArteCliente(123, [a.modelo]), 'APROVADO');
    });
    await teste('status confirmado do modelo vence status de versão antiga da arte', async () => {
        const a = ambiente();
        assert.equal(a.c.calcularStatusConsolidadoPedidoArteCliente([
            { status_arte: 'APROVADA_CLIENTE', aprovacao: 'REPROVADA_CLIENTE' }
        ], 'APROVADO', ''), 'APROVADO');
        assert.equal(a.c.calcularStatusConsolidadoPedidoArteCliente([
            { status_arte: 'REPROVADA_CLIENTE', amostra_status: 'APROVADA' }
        ], 'APROVADO', ''), 'Em Alteração');
    });
    await teste('conferência só confirma INSERT e UPDATE que devolvem os campos salvos', async () => {
        const a = ambiente();
        const linha = { id: 1, id_int: 123, status: 'Dados Pendentes', observacoes: { preservar: 'original' } };
        let existente = linha, gravadas = [];
        a.banco.responder = ({ op }) => ({ data: op === 'select' ? existente : gravadas, error: null });
        let r = await a.c.gravarCorrecaoDoCliente(123, 'Corrigir endereço', 'CORRIGIR');
        assert.equal(r.ok, false);
        assert.deepEqual(linha.observacoes, { preservar: 'original' });
        existente = null;
        r = await a.c.gravarCorrecaoDoCliente(123, 'Corrigir endereço', 'CORRIGIR');
        assert.equal(r.ok, false);
        a.banco.responder = ({ op, payload }) => ({ data: op === 'select' ? existente : [{ id: 1, id_int: 123, ...payload }], error: null });
        r = await a.c.gravarCorrecaoDoCliente(123, 'Corrigir endereço', 'CORRIGIR');
        assert.equal(r.ok, true);
    });
    await teste('finalização bem sucedida usa uma RPC e mantém correção como Corrigir Dados', async () => {
        for (const corrigir of [false, true]) {
            const a = ambiente(); a.modelo.amostra_status = 'APROVADA';
            a.c.portalConfirmacoes.entrega = !corrigir;
            a.c.portalConfirmacoes.textoEntrega = corrigir ? 'Corrigir endereço' : '';
            const status = corrigir ? 'Corrigir Dados' : 'APROVADO';
            a.banco.rpcResposta = { data: { ok: true, numero: '123', finalizado: true,
                status, entrega_dados: corrigir ? 'CORRIGIR' : 'APROVADO' }, error: null };
            await a.c.finalizarNoPortal();
            assert.equal(a.c.clienteState.pedidoFinalizado, true);
            assert.equal(a.c.clienteState.statusArte, status);
            assert.equal(a.chamadas.length, 1);
            assert.equal(a.chamadas[0].nome, 'link_cliente_finalizar');
            await a.c.finalizarNoPortal();
            assert.equal(a.chamadas.length, 1, 'clique após sucesso não repete');
            if (corrigir) assert.match(a.c.cartaoDeFinalizacao(), /solicitação de correção/);
        }
    });
    for (const data of [null, false, [], { ok: true },
        { ok: true, numero: '999', finalizado: true, status: 'APROVADO', entrega_dados: 'APROVADO' },
        { ok: true, numero: '123', finalizado: true, status: 'Corrigir Dados', entrega_dados: 'CORRIGIR' }]) {
        await teste('finalização exige recibo completo e correspondente ao pedido', async () => {
            const a = ambiente(); a.modelo.amostra_status = 'APROVADA';
            a.banco.rpcResposta = { data, error: null };
            await a.c.finalizarNoPortal();
            assert.equal(a.c.clienteState.pedidoFinalizado, false);
            assert.equal(a.c.clienteState.statusArte, 'Dados Pendentes');
            assert.equal(a.c.portalGravandoConfirmacao, false);
        });
    }
    await teste('resposta lenta trava cliques duplicados; falha libera uma nova tentativa', async () => {
        const a = ambiente(); a.modelo.amostra_status = 'APROVADA';
        let liberar, chamadas = 0;
        a.banco.rpc = async () => { chamadas++; return new Promise(resolve => { liberar = resolve; }); };
        const primeira = a.c.finalizarNoPortal();
        assert.notEqual(a.c.clienteState.pedidoFinalizado, true);
        await a.c.finalizarNoPortal();
        assert.equal(chamadas, 1);
        liberar({ data: null, error: { message: 'offline' } }); await primeira;
        const segunda = a.c.finalizarNoPortal();
        assert.equal(chamadas, 2);
        liberar({ data: { ok: true, numero: '123', finalizado: true, status: 'APROVADO', entrega_dados: 'APROVADO' }, error: null });
        await segunda;
        assert.equal(a.c.clienteState.pedidoFinalizado, true);
    });
    await teste('exceção de rede libera o botão e preserva status anterior', async () => {
        const a = ambiente(); a.modelo.amostra_status = 'APROVADA';
        const botao = a.campos['portal-btn-finalizar'] = {};
        a.banco.rpc = async () => { throw new Error('offline'); };
        await a.c.finalizarNoPortal();
        assert.equal(botao.disabled, false);
        assert.equal(a.c.clienteState.pedidoFinalizado, false);
        assert.equal(a.c.clienteState.statusArte, 'Dados Pendentes');
    });
    for (const preparar of [a => { a.c.portalConfirmacoes.faturamento = null; },
        a => { a.c.state.osItens.vibe_123 = []; }, a => { a.modelo.amostra_status = 'REPROVADA'; },
        a => { a.c.entregaExigeRecebedor = () => true; },
        a => { a.c.portalConfirmacoes.entrega = false; a.campos['portal-correcao-entrega'] = { value: 'não salvo' }; }]) {
        await teste('pendência ou correção sem salvar impede chamada de finalização', async () => {
            const a = ambiente(); a.modelo.amostra_status = 'APROVADA'; preparar(a);
            await a.c.finalizarNoPortal();
            assert.equal(a.chamadas.length, 0);
            assert.notEqual(a.c.clienteState.pedidoFinalizado, true);
        });
    }
    await teste('falha ao salvar texto preserva o texto confirmado e bloqueia finalização', async () => {
        const a = ambiente();
        a.c.portalConfirmacoes.entrega = false;
        a.c.portalConfirmacoes.textoEntrega = 'salvo';
        a.campos['portal-correcao-entrega'] = { value: 'novo texto' };
        a.c.gravarCorrecaoDoCliente = async () => ({ ok: false });
        await a.c.salvarCorrecaoDeDados('entrega');
        assert.equal(a.c.portalConfirmacoes.textoEntrega, 'salvo');
        assert.equal(a.c.portalErroConfirmacao.entrega, true);
        assert.equal(a.c.portalGravandoConfirmacao, false);
    });
    await teste('nova correção salva reabre a finalização sem antecipar sucesso', async () => {
        const a = ambiente(); a.c.portalConfirmacoes.entrega = false;
        a.c.clienteState.pedidoFinalizado = true;
        a.campos['portal-correcao-entrega'] = { value: 'Texto revisto' };
        a.c.gravarCorrecaoDoCliente = async (numero, texto, selo, confirmacao) => {
            assert.equal(selo, 'CORRIGIR');
            assert.equal(confirmacao.finalizado, false);
            assert.equal(a.c.portalConfirmacoes.textoEntrega, '');
            return { ok: true };
        };
        await a.c.salvarCorrecaoDeDados('entrega');
        assert.equal(a.c.portalConfirmacoes.textoEntrega, 'Texto revisto');
        assert.equal(a.c.clienteState.pedidoFinalizado, false);
    });
    console.log('OK: ' + total + ' cenários de persistência do portal.');
}
executar().catch(e => { console.error(e); process.exitCode = 1; });
