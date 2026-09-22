const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const raiz = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(raiz, 'frontend/script.js'), 'utf8');
const pedido = fs.readFileSync(path.join(raiz, 'frontend/pedido.js'), 'utf8');
function extrair(fonte, nome) {
    const inicio = fonte.indexOf('async function ' + nome + '(');
    assert.ok(inicio >= 0, nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}
(async () => {
    const item = { id: 42, qtd: 8, quantidade: 8, arte_url: 'arte.pdf', amostra_arte_base64: 'amostra', status_arte: 'APROVADA' };
    const outro = { id: 43, qtd: 20, quantidade: 20 };
    let resposta = { data: [
        { id: 42, quantidade: 1250, numeracao_inicio: 1, numeracao_fim: 1250 },
        { id: 43, quantidade: 20, numeracao_inicio: 1, numeracao_fim: 20 }
    ] };
    let consultas = 0;
    const state = { osItens: { vibe_123: [item, outro] }, modelosGlobais: { 123: [{ id: 42, quantidade: 8 }] }, activeOSItem: { itemId: 42, osId: 'vibe_123' } };
    const ctx = vm.createContext({ state, console, supabaseClient: {
        from(tabela) {
            if (tabela === 'pedidos_artes') return { select: () => ({ eq: async () => ({ data: [] }) }) };
            assert.equal(tabela, 'pedidos_modelos');
            return { select(colunas) {
                assert.equal(colunas, 'id,quantidade,numeracao_inicio,numeracao_fim');
                return { async eq(campo, valor) {
                    consultas++;
                    assert.equal(campo, 'id_int'); assert.equal(valor, 123);
                    return resposta;
                } };
            } };
        }
    } });
    for (const nome of ['atualizarQuantidadesDoERP', 'autoSaveOSItemField', 'saveActiveOSItemField', 'impQueueUpdateField']) {
        vm.runInContext(extrair(script, nome), ctx);
    }
    vm.runInContext(extrair(pedido, 'pedQueueUpdateField'), ctx);
    await ctx.atualizarQuantidadesDoERP('vibe_123', 123);
    assert.equal(item.qtd, 1250);
    assert.equal(item.num_final, 1250);
    assert.equal(outro.qtd, 20); // Não replica o total de um produto nos demais modelos.
    assert.equal(item.arte_url, 'arte.pdf');
    assert.equal(item.amostra_arte_base64, 'amostra');
    assert.equal(item.status_arte, 'APROVADA');
    assert.equal(state.modelosGlobais[123][0].quantidade, 1250);
    item._dbLoaded = outro._dbLoaded = true;
    state.ordens = [{ id: 'vibe_123', numero: 123 }];
    ctx.renderOSItens = () => {};
    ctx.toast = mensagem => { throw new Error(mensagem); };
    vm.runInContext(extrair(script, 'loadOSItens'), ctx);
    resposta.data[0].quantidade = 1500;
    resposta.data[0].numeracao_fim = 1500;
    await ctx.loadOSItens('vibe_123');
    assert.equal(item.qtd, 1500, 'Reabrir itens já carregados relê o ERP');
    assert.equal(item.amostra_arte_base64, 'amostra');
    resposta.data[0].quantidade = 0;
    resposta.data[0].numeracao_fim = 0;
    await ctx.atualizarQuantidadesDoERP('vibe_123', 123);
    assert.equal(item.qtd, 0);
    const antes = JSON.stringify(state);
    for (const field of ['qtd', 'quantidade']) {
        await ctx.autoSaveOSItemField(42, 'vibe_123', field, 8);
        await ctx.saveActiveOSItemField(field, 8);
        await ctx.impQueueUpdateField(42, 'vibe_123', field, 8);
        await ctx.pedQueueUpdateField(42, 'vibe_123', field, 8);
    }
    assert.equal(JSON.stringify(state), antes);
    assert.equal(consultas, 3);
    let resumos = 0;
    ctx.updateImpSummary = () => resumos++;
    for (const nome of ['onImposicaoStartInput', 'onImposicaoEndInput']) {
        const inicio = script.indexOf('function ' + nome + '(');
        vm.runInContext(script.slice(inicio, script.indexOf('\n}', inicio) + 2), ctx);
        ctx[nome](8);
    }
    assert.equal(resumos, 2);
    assert.equal(JSON.stringify(state), antes, 'Faixa temporária do PDF não altera modelo');
    for (const falha of [{ data: [] }, { error: new Error('rede indisponível') }, { data: [{ id: 42, quantidade: 900 }] }]) {
        resposta = falha;
        await assert.rejects(ctx.atualizarQuantidadesDoERP('vibe_123', 123));
        assert.equal(JSON.stringify(state), antes, 'Falha não pode aplicar resposta parcial');
    }
    console.log('OK: atualização por modelo, preservação de artes, zero, bloqueio de gravações e falhas de consulta.');
})().catch(e => { console.error(e); process.exitCode = 1; });
