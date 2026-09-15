const fs = require('fs');
const vm = require('vm');

const fonte = fs.readFileSync('frontend/script.js', 'utf8');

function trechoConst(nome) {
    const inicio = fonte.indexOf('const ' + nome + ' =');
    const fim = fonte.indexOf(';', inicio) + 1;
    if (inicio < 0 || fim <= 0) throw new Error('const não encontrada: ' + nome);
    return fonte.slice(inicio, fim);
}

function trechoFuncao(nome) {
    let inicio = fonte.indexOf('function ' + nome + '(');
    if (inicio < 0) throw new Error('função não encontrada: ' + nome);
    if (fonte.slice(inicio - 6, inicio) === 'async ') inicio -= 6;
    const abre = fonte.indexOf('{', inicio);
    let nivel = 0;
    for (let i = abre; i < fonte.length; i++) {
        if (fonte[i] === '{') nivel++;
        if (fonte[i] === '}' && --nivel === 0) return fonte.slice(inicio, i + 1);
    }
    throw new Error('função incompleta: ' + nome);
}

const contexto = {};
vm.createContext(contexto);
vm.runInContext(
    trechoConst('ARTE_REPROVADOS') + '\n' +
    trechoConst('ARTE_APROVADOS') + '\n' +
    trechoFuncao('calcularStatusConsolidadoPedidoArte') + '\n' +
    'this.calcular = calcularStatusConsolidadoPedidoArte;',
    contexto
);

function igual(recebido, esperado, caso) {
    if (recebido !== esperado) throw new Error(caso + ': esperado ' + esperado + ', recebido ' + recebido);
}

const aprovado = { status_arte: 'APROVADA_CLIENTE' };
const pendente = { status_arte: 'AGUARDANDO_CLIENTE' };
const alteracao = { status_arte: 'REPROVADA_CLIENTE' };

igual(contexto.calcular([pendente], '', 'AGUARDANDO_APROVACAO'), 'Em Aprovação', 'nome antigo');
igual(contexto.calcular([aprovado, pendente], '', ''), 'Apr Parcial', 'aprovação parcial');
igual(contexto.calcular([aprovado], '', ''), 'Dados Pendentes', 'arte aprovada sem dados');
igual(contexto.calcular([aprovado], 'APROVADO', ''), 'APROVADO', 'aprovação completa');
igual(contexto.calcular([aprovado], 'CORRIGIR', 'APROVADO'), 'Corrigir Dados', 'correção vence aprovação');
igual(contexto.calcular([aprovado, pendente], 'CORRIGIR', ''), 'Corrigir Dados', 'correção vence parcial');
igual(contexto.calcular([alteracao, aprovado], 'APROVADO', ''), 'Em Alteração', 'alteração de arte');
igual(contexto.calcular([pendente], '', 'Enviar Arte'), 'Enviar Arte', 'pronto para envio');
igual(contexto.calcular([pendente], '', 'ENVIAR ARTE'), 'Enviar Arte', 'grafia antiga em maiúsculas');
igual(contexto.calcular([alteracao], '', 'Pendente Informação'), 'Pendente Informação', 'informação pendente permanece até nova direção');
igual(contexto.calcular([aprovado], 'CORRIGIR', 'Pendente Informação'), 'Corrigir Dados', 'correção de dados vence informação pendente');

async function testarRetornoDaCorrecaoComModeloLegado() {
    const linha = {
        id: 'arte-20942',
        status: 'Dados Pendentes',
        entrega_dados: 'CORRIGIR',
        observacoes: { existente: true }
    };
    const atualizacoes = [];
    const banco = {
        from() {
            const consulta = { payload: null };
            return {
                select() { return this; },
                update(payload) { consulta.payload = payload; return this; },
                eq() { return this; },
                order() { return Promise.resolve({ data: [linha], error: null }); },
                single() {
                    atualizacoes.push(consulta.payload);
                    Object.assign(linha, consulta.payload);
                    return Promise.resolve({ data: { ...linha }, error: null });
                }
            };
        }
    };
    const ctx = { supabaseClient: banco, state: {
        modelosGlobais: { 20942: [{ status_arte: 'APROVADA_CLIENTE' }] }, todasArtes: []
    } };
    vm.createContext(ctx);
    vm.runInContext(
        trechoConst('ARTE_REPROVADOS') + '\n' +
        trechoConst('ARTE_APROVADOS') + '\n' +
        trechoFuncao('calcularStatusConsolidadoPedidoArte') + '\n' +
        trechoFuncao('sincronizarStatusConsolidadoPedidoArte') + '\n' +
        'this.sincronizar = sincronizarStatusConsolidadoPedidoArte;',
        ctx
    );

    igual(await ctx.sincronizar(20942), 'Corrigir Dados', 'entrada na correção');
    igual(linha.observacoes.status_antes_correcao_dados, 'Dados Pendentes', 'preserva aprovação das artes');
    linha.entrega_dados = 'APROVADO';
    igual(await ctx.sincronizar(20942), 'APROVADO', 'atendimento conclui a correção');
    igual(linha.status, 'APROVADO', 'pedido legado sai de Corrigir Dados');
    if (atualizacoes.length !== 2) throw new Error('esperava duas atualizações consolidadas');
}

async function testarConfirmacaoDaGravacao() {
    const montar = resposta => ({
        from() {
            return {
                update() { return this; },
                eq() { return this; },
                select() { return Promise.resolve(resposta); }
            };
        }
    });
    for (const resposta of [
        { data: [], error: null },
        { data: null, error: { message: 'RLS recusou' } }
    ]) {
        const ctx = { supabaseClient: montar(resposta) };
        vm.createContext(ctx);
        vm.runInContext(trechoFuncao('atualizarPedidoArteConfirmado')
            + '\nthis.atualizar = atualizarPedidoArteConfirmado;', ctx);
        let falhou = false;
        try { await ctx.atualizar(22192, { entrega_dados: 'APROVADO' }); }
        catch (_) { falhou = true; }
        igual(falhou, true, 'resposta vazia ou recusada não vira sucesso');
    }
}

async function testarReconciliacaoComModelosDoBanco() {
    const linha = {
        id: 'arte-22192', status: 'Corrigir Dados', entrega_dados: 'APROVADO',
        observacoes: { status_antes_correcao_dados: 'Dados Pendentes' }
    };
    let consultouModelos = 0;
    const banco = {
        from(tabela) {
            if (tabela === 'pedidos_modelos') {
                return {
                    select() { return this; },
                    eq() {
                        consultouModelos++;
                        return Promise.resolve({ data: [{ id: 1, status_arte: 'APROVADA_CLIENTE' }], error: null });
                    }
                };
            }
            const q = { payload: null };
            return {
                select() { return this; }, update(p) { q.payload = p; return this; }, eq() { return this; },
                order() { return Promise.resolve({ data: [linha], error: null }); },
                single() { Object.assign(linha, q.payload); return Promise.resolve({ data: { ...linha }, error: null }); }
            };
        }
    };
    const ctx = { supabaseClient: banco, state: { modelosGlobais: {}, todasArtes: [] } };
    vm.createContext(ctx);
    vm.runInContext(
        trechoConst('ARTE_REPROVADOS') + '\n' + trechoConst('ARTE_APROVADOS') + '\n'
        + trechoFuncao('calcularStatusConsolidadoPedidoArte') + '\n'
        + trechoFuncao('sincronizarStatusConsolidadoPedidoArte') + '\n'
        + 'this.sincronizar = sincronizarStatusConsolidadoPedidoArte;', ctx);
    igual(await ctx.sincronizar(22192), 'APROVADO', 'reconcilia com modelos persistidos');
    igual(consultouModelos, 1, 'consulta modelos quando a memória está vazia');
    igual(linha.status, 'APROVADO', 'remove Corrigir Dados persistido');
}

async function testarReconciliacaoDaLista() {
    const chamadas = [];
    const ctx = {
        supabaseClient: {},
        state: {
            ordens: [
                { id: 'vibe_1', numero: 1 },
                { id: 'vibe_2', numero: 2, status_interno: 'EM PRODUCAO' },
                { id: 'vibe_3', numero: 3, status_interno: 'EM PRODUCAO' },
                { id: 'vibe_4', numero: 4, status_interno: 'CANCELADO' }
            ],
            todasArtes: [
                { id_int: 2, status: 'Em Alteração' },
                { id_int: 3, status: 'APROVADO' }
            ],
            modelosGlobais: { 1: [{ id: 11 }], 2: [{ id: 22 }] }
        },
        temSessaoDoSupabase: async () => true,
        pedidoCancelado: os => os.status_interno === 'CANCELADO',
        pedidoSaiuDaArte: os => os.status_interno === 'EM PRODUCAO',
        sincronizarStatusConsolidadoPedidoArte: async (numero, modelos) => chamadas.push([numero, modelos.length]),
        console: { warn() {} }
    };
    vm.createContext(ctx);
    vm.runInContext(trechoFuncao('reconciliarStatusPersistidosDaListaArte')
        + '\nthis.reconciliar = reconciliarStatusPersistidosDaListaArte;', ctx);
    const resultado = await ctx.reconciliar();
    igual(resultado.verificados, 2, 'reconcilia ativos e correções que saíram da arte');
    igual(JSON.stringify(chamadas), JSON.stringify([[1, 1], [2, 1]]),
        'não varre concluídos normais nem cancelados');
}

Promise.all([
    testarRetornoDaCorrecaoComModeloLegado(),
    testarConfirmacaoDaGravacao(),
    testarReconciliacaoComModelosDoBanco(),
    testarReconciliacaoDaLista()
]).then(() => {
    console.log('status pedidos_artes: 22 casos OK');
}).catch(erro => {
    console.error(erro);
    process.exit(1);
});
