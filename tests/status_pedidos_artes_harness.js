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
    const chamadas = [];
    const linha = { id_int: 20942, status: 'Corrigir Dados' };
    const ctx = { window: {}, state: { todasArtes: [linha] }, supabaseClient: {
        async rpc(nome, args) {
            chamadas.push([nome, args]);
            return { data: nome === 'arte_transicao_ler' ? { revisao: 'r1' }
                : { confirmado: true, status: 'APROVADO' } };
        }, from() { throw Error('PATCH direto proibido'); }
    } };
    vm.createContext(ctx);
    vm.runInContext(trechoFuncao('confirmarTransicaoDaArte') + '\n'
        + trechoFuncao('sincronizarStatusConsolidadoPedidoArte'), ctx);
    igual(await ctx.sincronizarStatusConsolidadoPedidoArte(20942, [{ status_arte: 'REPROVADA_CLIENTE' }]), 'APROVADO', 'usa decisao do banco');
    igual(chamadas.length, 2, 'leitura e confirmacao');
    igual(chamadas[1][1].p_revisao, 'r1', 'envia revisao lida');
    igual(linha.status, 'APROVADO', 'memoria acompanha recibo');
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
    let tentativas = 0;
    const linha = { id_int: 22192, status: 'Enviar Arte' };
    const ctx = { window: {}, state: { todasArtes: [linha] }, supabaseClient: {
        async rpc(nome) {
            if (nome === 'arte_transicao_ler') return { data: { revisao: 'antiga' } };
            tentativas++; return { error: { code: '40001', message: 'O pedido mudou em outra tela' } };
        }, from() { throw Error('Nao pode usar fallback'); }
    } };
    vm.createContext(ctx);
    vm.runInContext(trechoFuncao('confirmarTransicaoDaArte') + '\n'
        + trechoFuncao('sincronizarStatusConsolidadoPedidoArte'), ctx);
    let falhou = false;
    try { await ctx.sincronizarStatusConsolidadoPedidoArte(22192, [{ status_arte: 'REPROVADA_CLIENTE' }]); }
    catch (e) { falhou = /outra tela/.test(e.message); }
    igual(falhou, true, 'conflito pede nova conferencia');
    igual(tentativas, 1, 'sem retry automatico');
    igual(linha.status, 'Enviar Arte', 'falha preserva memoria');
}

async function testarReconciliacaoDaLista() {
    let chamadas = 0;
    const ctx = { state: { ordens: [{ numero: 1 }], modelosGlobais: {1:[{status_arte:'REPROVADA_CLIENTE'}]} },
        supabaseClient: { from() { chamadas++; throw Error('Escrita na carga'); }, rpc() { chamadas++; throw Error('RPC na carga'); } } };
    vm.createContext(ctx);
    for (const nome of ['reconciliarStatusPersistidosDaListaArte','sincronizarPedidosProntosParaEnvio','sincronizarStatusOrdensDinamico']) {
        vm.runInContext(trechoFuncao(nome), ctx); await ctx[nome]();
    }
    igual(chamadas, 0, 'carga da aba antiga nao grava');
    igual(ctx.state.modelosGlobais[1][0].status_arte, 'REPROVADA_CLIENTE', 'teste conserva memoria antiga');
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
