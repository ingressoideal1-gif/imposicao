const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const begin = source.indexOf('async function saveAmostraToDB(');
const code = source.slice(begin, source.indexOf('\n}', begin) + 2);
function scenario(options = {}) {
    const rows = options.rows || [{ id: 1, id_int: 123, ordem: 1, arte_url: 'antiga' }, { id: 2, id_int: 123, ordem: 2, arte_url: 'outra' }];
    const item = { id: options.id ?? 1, id_int: 123, ordem: 99, _dbLoaded: true, ...options.item };
    const calls = [];
    const client = { from(table) {
        let changes, action, filters = [];
        const q = {
            update(data) { action = 'update'; changes = data; return q; },
            insert(data) { action = 'insert'; changes = data; return q; },
            eq(key, value) { filters.push([key, value]); return q; },
            select() { return q; },
            then(resolve, reject) {
                return Promise.resolve().then(() => {
                    calls.push({ table, action, filters, changes });
                    if (options.error) return { data: null, error: { message: 'falha simulada' } };
                    const selected = (table === 'produtos_proposta' ? options.products || [] : rows).filter(row => filters.every(([k, v]) => String(row[k]) === String(v)));
                    if (action === 'update') selected.forEach(row => Object.assign(row, changes));
                    if (table === 'produtos_proposta' && options.productError) return { data: null, error: { message: 'falha no espelho' } };
                    return { data: options.response ? options.response(selected) : structuredClone(selected), error: null };
                }).then(resolve, reject);
            }
        };
        return q;
    } };
    const state = { osItens: { vibe_123: [item] } };
    const ctx = { state, supabaseClient: client, vibeClient: client, console: { log() {}, warn() {}, error() {} },
        bloqueioDeModeloAprovado: () => options.block || null, resolveItemCorNumIds: () => ({}),
        findOSInState: () => ({ numero: 123 }), sincronizarNumeracaoDoItem() {}, normalizarStatusImpressao: s => s,
        toast() {}, localStorage: { getItem: () => null, setItem() {} } };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    return { rows, item, calls, save: data => ctx.saveAmostraToDB(item.id, 'vibe_123', data) };
}
(async () => {
    let s = scenario({ id: 99 });
    await assert.rejects(s.save({ arte_url: 'nova' }));
    assert.equal(s.rows[0].arte_url, 'antiga'); assert.equal(s.rows[1].arte_url, 'outra');
    assert.equal(s.calls.length, 1, 'nao tenta outro alvo depois de falha');
    s = scenario();
    const receipt = await s.save({ arte_url: 'nova', quantidade: 900 });
    assert.equal(receipt.confirmado, true); assert.equal(s.rows[0].arte_url, 'nova');
    assert.equal(s.rows[1].arte_url, 'outra'); assert.equal(s.rows[0].quantidade, undefined);
    assert.equal(s.item.arte_url, 'nova');
    assert.deepEqual(s.calls[0].filters, [['id', 1], ['id_int', 123]]);
    s = scenario({ rows: [{ id: 1, id_int: 456, arte_url: 'outro pedido' }] });
    await assert.rejects(s.save({ arte_url: 'nova' })); assert.equal(s.rows[0].arte_url, 'outro pedido');
    for (const options of [{ error: true }, { response: () => [] }, { response: r => [r[0], r[0]] },
        { response: r => [{ ...r[0], arte_url: 'divergente' }] }, { block: { motivo: 'Aprovado' } },
        { item: { _source: 'vibecode', _dbLoaded: false } }]) {
        s = scenario(options); await assert.rejects(s.save({ arte_url: 'nova' }));
        assert.equal(s.item.arte_url, undefined, 'falha nao confirma memoria local');
        assert.ok(s.calls.length <= 1, 'sem fallback/insert');
    }
    s = scenario({ id: '1invalido' }); await assert.rejects(s.save({ arte_url: 'nova' }));
    assert.equal(s.calls.length, 0);
    s = scenario({ block: { silencioso: true } });
    assert.equal((await s.save({ amostra_arte_base64: 'preview' })).confirmado, false);
    assert.equal(s.calls.length, 0);
    const rows = [{ id: 1, id_int: 123, id_produto_proposta_origem: 44, arte_url: 'antiga' }];
    const products = [{ id: 1, id_int: 123, arte_url: 'nao tocar' }, { id: 44, id_int: 123, arte_url: 'antiga' }];
    s = scenario({ rows, products }); await s.save({ arte_url: 'nova' });
    assert.equal(products[0].arte_url, 'nao tocar'); assert.equal(products[1].arte_url, 'nova');
    assert.deepEqual(s.calls[1].filters, [['id', 44], ['id_int', 123]]);
    s = scenario({ rows, products, productError: true });
    await assert.rejects(s.save({ arte_url: 'terceira' }), /Modelo salvo, mas o espelho/);
    assert.equal(s.item.arte_url, undefined); assert.equal(s.calls.length, 2);
    s = scenario({ rows, products: [{ id: 44, id_int: 456, arte_url: 'nao tocar' }] });
    await assert.rejects(s.save({ arte_url: 'quarta' }), /espelho/);
    assert.equal(s.calls.length, 2);
    console.log('OK: salvamento isolado por modelo/pedido, sem fallback, com recibo exato e erro bloqueante');
})().catch(e => { console.error(e); process.exitCode = 1; });
