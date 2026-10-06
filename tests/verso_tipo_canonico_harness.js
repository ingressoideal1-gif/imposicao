// Código real; somente dados sintéticos e persistência simulada, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const VersoDoModelo = require('../frontend/cor-numeracao-do-modelo.js').VersoDoModelo;
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.search(new RegExp('^(?:async )?function ' + name + '\\(', 'm'));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const expected = {
    front: 'SÓ FRENTE', duplex: 'FRENTE E VERSO', pdf_duplicate_back: 'FRENTE E VERSO',
    duplex_unico: 'VERSO FIXO', pdf_odd_even: 'VERSO VARIÁVEL'
};
function scenario(mode, options = {}) {
    const item = { id: 1, id_int: 123, amostra_num_id: 'n', verso_tipo: 'FxVerso', verso: true };
    const row = { ...item };
    const calls = [], notices = [];
    const ctx = { window: {}, VersoDoModelo, console: { error() {} },
        state: { osItens: { vibe_123: [item] }, numeracoes: mode ? [{ id: 'n', print_mode: mode }] : [] },
        bloqueioDeModeloAprovado: () => null, resolveItemCorNumIds: () => ({}),
        findOSInState: () => ({ numero: 123 }), sincronizarNumeracaoDoItem(i, id) { i.amostra_num_id = id; i.numeracao_id = id; },
        toast: (...args) => notices.push(args), API_BASE_URL: 'http://synthetic.invalid',
        async fetch(url, options) { calls.push({ body: JSON.parse(options.body), url }); return { ok: true }; },
        supabaseClient: options.local ? null : { from(table) {
            let patch; const filters = [];
            const q = { update(p) { patch = p; return q; }, eq(k, v) { filters.push([k, v]); return q; }, select() { return q; },
                then(resolve, reject) {
                    calls.push({ table, body: patch, filters });
                    if (options.fail) return Promise.resolve({ error: { message: 'falha simulada' } }).then(resolve, reject);
                    if (options.empty) return Promise.resolve({ data: [], error: null }).then(resolve, reject);
                    Object.assign(row, patch);
                    return Promise.resolve({ data: [{ ...row }], error: null }).then(resolve, reject);
                }
            }; return q;
        } }
    };
    ctx.vibeClient = ctx.supabaseClient;
    vm.createContext(ctx);
    vm.runInContext(extract('autoSaveOSItemField') + extract('saveAmostraToDB'), ctx);
    return { ctx, item, row, calls, notices };
}
(async () => {
    for (const [mode, label] of Object.entries(expected)) {
        assert.equal(VersoDoModelo.doModo(mode), label);
        for (const old of ['Frente', 'SÓ FRENTE', 'FxVerso', 'VERSO COMUM', 'FRENTE E VERSO', 'VERSO FIXO', 'VERSO VARIÁVEL', null]) {
            const item = { amostra_num_id: 'n', verso_tipo: old, verso: true };
            const num = { id: 'n', print_mode: mode };
            const patch = VersoDoModelo.payload({ verso_tipo: old }, item, [num]);
            assert.equal(patch.verso_tipo, label);
            assert.equal(patch.frente_verso, mode !== 'front');
            assert.equal(item.verso_tipo, old, 'construir payload não modifica o modelo');
            assert.equal(VersoDoModelo.modo(item, num), mode === 'pdf_odd_even' ? 'duplex' : mode);
        }
        for (const local of [false, true]) {
            const s = scenario(mode, { local });
            await s.ctx.autoSaveOSItemField(1, 'vibe_123', 'verso_tipo', 'FxVerso');
            if (local) {
                assert.equal(s.calls.length, 0, 'rota antiga não confirma escrita moderna');
                assert.equal(s.notices.length, 1);
                continue;
            }
            assert.equal(s.calls[0].body.verso_tipo, label);
            assert.equal(s.calls[0].body.frente_verso, mode !== 'front');
        }
        const s = scenario(mode);
        await s.ctx.saveAmostraToDB(1, 'vibe_123', { amostra_num_id: 'n', verso_tipo: 'FxVerso' });
        assert.equal(s.row.verso_tipo, label);
        assert.equal(s.row.frente_verso, mode !== 'front');
        assert.equal(s.item.verso_tipo, label);
        assert.deepEqual(s.calls[0].filters, [['id', 1], ['id_int', 123]]);
    }
    for (const mode of [null, 'desconhecido']) {
        const s = scenario(mode);
        await s.ctx.autoSaveOSItemField(1, 'vibe_123', 'verso_tipo', 'Frente');
        assert.equal(s.calls.length, 0, 'não sobrescrever resumo sem modo conhecido');
        assert.equal(s.item.verso_tipo, 'FxVerso');
    }
    const removed = scenario('duplex');
    await removed.ctx.saveAmostraToDB(1, 'vibe_123', { amostra_num_id: null });
    assert.equal(removed.row.amostra_num_id, null);
    assert.equal(removed.row.verso_tipo, 'FxVerso');
    assert(!('verso_tipo' in removed.calls[0].body));
    const other = scenario('duplex');
    await other.ctx.saveAmostraToDB(1, 'vibe_123', { modo_pdf: true });
    assert(!('verso_tipo' in other.calls[0].body), 'edição não relacionada não converte histórico');
    const failed = scenario('front', { fail: true });
    await assert.rejects(failed.ctx.saveAmostraToDB(1, 'vibe_123', { verso_tipo: 'FxVerso' }));
    assert.equal(failed.item.verso_tipo, 'FxVerso');
    assert.equal(failed.row.verso_tipo, 'FxVerso');
    for (const options of [{ fail: true }, { empty: true }]) {
        const s = scenario('front', options);
        await s.ctx.autoSaveOSItemField(1, 'vibe_123', 'verso_tipo', 'Frente');
        assert.equal(s.notices.length, 1, 'falha ou zero linhas devem avisar');
        assert.equal(s.item.verso_tipo, 'FxVerso', 'falha restaura o resumo local');
    }
    const changed = scenario('duplex_unico');
    changed.item.amostra_num_id = 'anterior';
    await changed.ctx.autoSaveOSItemField(1, 'vibe_123', 'numeracao_id', 'n');
    assert.equal(changed.calls.length, 1, 'vínculo e resumo no mesmo UPDATE');
    assert.equal(changed.calls[0].body.amostra_num_id, 'n');
    assert.equal(changed.calls[0].body.verso_tipo, 'VERSO FIXO');
    assert.equal(VersoDoModelo.temVerso('SÓ FRENTE'), false);
    assert.equal(VersoDoModelo.temVerso('VERSO FIXO'), true);
    for (const html of ['index.html', 'producao.html', 'cliente.html']) {
        const s = fs.readFileSync(path.join(__dirname, '../frontend', html), 'utf8');
        assert(s.indexOf('cor-numeracao-do-modelo.js?') < s.indexOf(html === 'cliente.html' ? '/cliente.js?' : 'script.js?'));
    }
    console.log('OK: cinco modos; legados; payload real e bloqueio de rota legada; confirmação; falha; desvinculação; carga HTML.');
})().catch(error => { console.error(error); process.exitCode = 1; });
