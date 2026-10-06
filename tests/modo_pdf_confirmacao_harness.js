const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extract(name) {
    const start = source.indexOf('async function ' + name + '(');
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function scenario(failModel = false, initial = false) {
    const item = { id: 1, id_int: 123, _dbLoaded: true, modo_pdf: initial,
        amostra_cor_id: 'cor', amostra_num_id: 'numero' };
    const persisted = { ...item, id_produto_proposta_origem: 44 };
    const calls = [], messages = [];
    let renders = 0;
    const client = { from(table) {
        let changes;
        const filters = [];
        const query = {
            update(value) { changes = value; return query; },
            eq(key, value) { filters.push([key, value]); return query; },
            async select() {
                calls.push({ table, changes, filters });
                if (table === 'produtos_proposta') {
                    return { data: null, error: { message: 'edicao comercial negada' } };
                }
                if (failModel) return { data: null, error: { message: 'edicao do modelo negada' } };
                Object.assign(persisted, changes);
                return { data: [{ ...persisted }], error: null };
            }
        };
        return query;
    } };
    const context = { VersoDoModelo: require('../frontend/cor-numeracao-do-modelo.js').VersoDoModelo,
        window: {}, state: { osItens: { vibe_123: [item] } },
        supabaseClient: client, vibeClient: client, console: { error() {} },
        bloqueioDeModeloAprovado: () => null,
        resolveItemCorNumIds: () => ({ corId: 'cor', numId: 'numero' }),
        findOSInState: () => ({ numero: 123 }),
        renderAmostrasOSItens: () => renders++,
        toast: (message, type) => messages.push({ message, type }) };
    vm.createContext(context);
    vm.runInContext(extract('saveAmostraToDB') + '\n' + extract('toggleModoPdf'), context);
    return { item, persisted, calls, messages, renders: () => renders,
        toggle: () => context.toggleModoPdf(0, 'vibe_123', 1) };
}
(async () => {
    for (const initial of [false, true]) {
        const s = scenario(false, initial);
        await s.toggle();
        assert.equal(s.persisted.modo_pdf, !initial);
        assert.equal(s.item.modo_pdf, !initial, 'tela deve refletir o modelo salvo');
        assert.equal(s.messages.some(m => m.type === 'error'), false, 'nao anunciar falha depois de salvar');
        assert.equal(s.calls.length, 1, 'modo PDF nao altera o item comercial');
        assert.deepEqual(s.calls[0].filters, [['id', 1], ['id_int', 123]]);
        assert.equal(s.renders(), 1);
    }
    const failed = scenario(true);
    await failed.toggle();
    assert.equal(failed.persisted.modo_pdf, false);
    assert.equal(failed.item.modo_pdf, false);
    assert.equal(failed.messages.some(m => m.type === 'error'), true);
    assert.equal(failed.renders(), 0);
    console.log('OK: modo PDF confirmado sem escrita comercial; falha real preserva estado anterior');
})().catch(error => { console.error(error); process.exitCode = 1; });
