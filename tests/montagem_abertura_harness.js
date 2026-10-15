const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(process.argv[2] || path.join(__dirname, '../frontend/montagem.js'), 'utf8').replace(/\r/g, '');
function extract(name) {
    const start = source.search(new RegExp('(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
async function test(result, rejects = false) {
    const fields = Object.fromEntries(['mtg-formato', 'mtg-pedido'].map(id => [id, { value: '', innerHTML: '', disabled: false }]));
    let complete, calls = 0, renders = 0, errors = 0;
    const waiting = new Promise(resolve => { complete = resolve; });
    const state = { montagem: { celulas: [{ id: 'preservada' }], modelos: [], abertura: 0 }, ordens: [], modelosGlobais: {}, osItens: {}, formatos: [{id: 'F1', name: 'Ingresso'}] };
    const ctx = { state, document: {getElementById: id => fields[id]}, window: {_mtgRedesenhoLigado: true},
        loadOrdens: async options => { assert.equal(options.completa, true); calls++; await waiting;
            if (rejects) throw new Error('rede');
            if (result) { state.ordens = [{id: 'os', numero: 1, status_interno: 'Em Produção'}]; state.modelosGlobais = {1: [{id:'modelo', formato_id:'F1', status_impressao:'Aguardando'}]}; }
            return result;
        }, formatoDoItem: item => state.formatos.find(f => f.id === item.formato_id), escapeHtml: String,
        onMontagemPedidoChange: async () => {}, _mtgLigarArrasto: () => {}, _mtgLigarTeclado: () => {},
        onMontagemPosicoesChange: () => {}, renderMontagem: () => { renders++; }, encherPastasDaMontagem: () => {}, toast: () => { errors++; }};
    vm.createContext(ctx);
    vm.runInContext(['pedidoEmProducaoNaMontagem', 'produtoDoModeloNaMontagem', 'formatoDoModeloNaMontagem', 'modelosDoPedidoNaMontagem', 'modeloDisponivelNaMontagem', 'pedidoDisponivelNaMontagem', 'pedidosParaMontagem', 'encherFormatosDaMontagem', 'encherPedidosDaMontagem', 'abrirMontagem'].map(extract).join('\n'), ctx);
    const opening = ctx.abrirMontagem();
    assert.equal(calls, 1, 'abrir deve carregar pedidos mesmo com estado vazio');
    assert.equal(fields['mtg-formato'].disabled, false, 'formato continua interativo durante a carga');
    assert.match(fields['mtg-formato'].innerHTML, /Ingresso/);
    complete(); await opening;
    assert.equal(state.montagem.celulas[0].id, 'preservada');
    if (result && !rejects) {
        assert.match(fields['mtg-formato'].innerHTML, /Ingresso/);
        assert.match(fields['mtg-pedido'].innerHTML, /value="os"/);
        assert.equal(fields['mtg-formato'].disabled, false);
        assert.equal(renders, 1);
    } else {
        assert.match(fields['mtg-formato'].innerHTML, /Ingresso/);
        assert.equal(fields['mtg-formato'].disabled, false);
        assert.match(fields['mtg-pedido'].innerHTML, /Falha ao carregar/);
        assert.equal(errors, 1);
        assert.equal(renders, 0);
    }
}
(async () => { await test(true); await test(false); await test(false, true); console.log('Montagem: abertura direta, espera da carga e falhas OK'); })().catch(e => { console.error(e); process.exitCode = 1; });
