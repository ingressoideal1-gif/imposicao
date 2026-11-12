// Regressões offline: nenhuma conexão com Supabase ou estação.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const fonte = fs.readFileSync('frontend/script.js', 'utf8');
function funcao(nome) {
    const inicio = fonte.indexOf('async function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
function contexto(extra = {}) {
    const ctx = { window: {}, state: { todasArtes: [], modelosGlobais: {} }, ...extra };
    vm.createContext(ctx);
    for (const nome of ['carregarArtesParaReconciliacao', 'sincronizarStatusConsolidadoPedidoArte', 'consultarFotosProdutosComSessao']) {
        vm.runInContext(funcao(nome), ctx);
    }
    return ctx;
}
async function lotes() {
    const chamadas = [];
    const linhas = Array.from({ length: 501 }, (_, i) => ({ id: 'a' + i, id_int: 1, updated_at: null }));
    const ctx = contexto({ supabaseClient: { from(tabela) {
        assert.equal(tabela, 'pedidos_artes');
        let ids;
        return {
            select() { return this; }, order() { return this; },
            in(campo, valores) { assert.equal(campo, 'id_int'); ids = valores; return this; },
            async range(inicio, fim) {
                chamadas.push({ ids: [...ids], inicio, fim });
                return { data: ids.includes(1) ? linhas.slice(inicio, fim + 1) : [] };
            }
        };
    } } });
    const ids = Array.from({ length: 101 }, (_, i) => i + 1);
    const mapa = await ctx.carregarArtesParaReconciliacao([...ids, 1]);
    assert.equal(mapa.size, 101);
    assert.equal(mapa.get(1).length, 501);
    assert.equal(mapa.get(101).length, 0);
    assert.equal(chamadas.length, 3);
    assert.deepEqual(chamadas.map(c => c.ids.length), [100, 100, 1]);
    assert.equal(chamadas[1].inicio, 500);
    linhas[0].id_int = 999;
    await assert.rejects(ctx.carregarArtesParaReconciliacao([1]), /inconsistente/);
    linhas[0].id_int = 1;
    linhas[1].id = linhas[0].id;
    await assert.rejects(ctx.carregarArtesParaReconciliacao([1]), /inconsistente/);
    let consultas = 0;
    const falha = contexto({ supabaseClient: { from() {
        consultas++;
        return { select() { return this; }, in() { return this; }, order() { return this; },
            async range() { return { error: new Error('RLS recusou') }; } };
    } } });
    assert.equal((await falha.carregarArtesParaReconciliacao([])).size, 0);
    assert.equal(consultas, 0);
    await assert.rejects(falha.carregarArtesParaReconciliacao([1]), /RLS recusou/);
}
async function concorrencia() {
    const chamadas = [];
    const ctx = contexto({ confirmarTransicaoDaArte: async (...args) => {
        chamadas.push(args); return { confirmado: true, status: 'Corrigir Dados' };
    } });
    const status = await ctx.sincronizarStatusConsolidadoPedidoArte(1,
        [{status_arte:'APROVADA'}], [{id:'a',status:'APROVADO'}]);
    assert.equal(status,'Corrigir Dados');
    assert.deepEqual(chamadas,[[1,'reconciliar']], 'nenhum modelo ou status antigo e enviado para gravacao');
    ctx.confirmarTransicaoDaArte = async () => { throw Error('conflito'); };
    await assert.rejects(ctx.sincronizarStatusConsolidadoPedidoArte(1), /conflito/);
}
async function fotos() {
    let consultas = 0;
    let sessao = null;
    const ctx = contexto({ vibeClient: {
        auth: { async getSession() { return { data: { session: sessao } }; } },
        from(tabela) {
            assert.equal(tabela, 'vw_produto_fotos'); consultas++;
            return { select() { return this; }, order() { return this; },
                then(resolve) { resolve({ data: [{ foto_id: 'foto' }] }); } };
        }
    } });
    assert.equal((await ctx.consultarFotosProdutosComSessao()).data.length, 0);
    assert.equal(consultas, 0);
    sessao = { user: { id: 'operador' } };
    assert.equal((await ctx.consultarFotosProdutosComSessao()).data[0].foto_id, 'foto');
    assert.equal(consultas, 1);
    ctx.vibeClient.auth.getSession = async () => ({ error: new Error('sessão indisponível') });
    await assert.rejects(ctx.consultarFotosProdutosComSessao(), /sessão indisponível/);
    assert.equal(consultas, 1);
}
async function origemEIntegridade() {
    const marcas = [];
    const ctx = contexto({
        confirmarTransicaoDaArte: async () => ({status:'APROVADO'}),
        supabaseClient: { from() {
            return {
                select() { return this; }, eq() { return this; }, in() { return this; },
                order() { return this; }, range() { return this; },
                setHeader(nome, valor) { assert.equal(nome, 'x-client-info'); marcas.push(valor); return this; },
                then(resolve) { return Promise.resolve({ data: [{ id: 'a', id_int: 1, status: 'APROVADO' }] }).then(resolve); },
                update() { throw new Error('Nao deve gravar status inalterado'); }
            };
        } }
    });
    const modelos = [{ status_arte: 'APROVADA' }];
    const lote = await ctx.carregarArtesParaReconciliacao([1]);
    await ctx.sincronizarStatusConsolidadoPedidoArte(1, modelos, lote.get(1));
    assert.deepEqual(marcas, ['imposition-artes/2 lote']);
    await ctx.sincronizarStatusConsolidadoPedidoArte(1, modelos);
    await ctx.sincronizarStatusConsolidadoPedidoArte(1, modelos, [{ id: 'a', status: 'ENVIAR ARTE' }]);
    assert.deepEqual(marcas, ['imposition-artes/2 lote']);

    let consolidacoes = 0;
    ctx.state.ordens = [{ numero: 1 }, { numero: 2 }];
    Object.assign(ctx, {
        temSessaoDoSupabase: async () => true, pedidoCancelado: () => false,
        pedidoIgnoradoNosPaineis: () => false, pedidoSaiuDaArte: () => false,
        carregarArtesParaReconciliacao: async () => new Map([[1, []]]),
        sincronizarStatusConsolidadoPedidoArte: async () => { consolidacoes++; }
    });
    vm.runInContext(funcao('reconciliarStatusPersistidosDaListaArte'), ctx);
    await ctx.reconciliarStatusPersistidosDaListaArte();
    assert.equal(consolidacoes, 0, 'lote incompleto falha antes de qualquer pedido');
    ctx.carregarArtesParaReconciliacao = async () => new Map([[1, []], [2, []]]);
    await ctx.reconciliarStatusPersistidosDaListaArte();
    assert.equal(consolidacoes, 0, 'ausencia confirmada de artes e valida');
}
(async () => {
    await lotes();
    await concorrencia();
    await fotos();
    await origemEIntegridade();
    console.log('consultas seguras: lotes, paginação, falhas, concorrência e sessão OK');
})().catch(e => { console.error(e); process.exitCode = 1; });
