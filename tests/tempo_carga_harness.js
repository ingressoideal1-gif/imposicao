// Regressao: uma resposta limitada nao pode zerar relogios antigos.
// Somente dados sinteticos, sem rede ou credenciais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const rows = Array.from({ length: 1205 }, (_, i) => ({
    id_int: i + 1, card: 'fila', desde: '2026-09-20T12:00:00Z',
    credito_segundos: 0, saiu_da_fila_em: null,
}));
function context({ failPage = -1, session = true } = {}) {
    const calls = [], writes = [];
    const ctx = {
        state: { temposNoCard: {}, temposNoCardAtivo: true },
        console: { log() {}, warn() {} },
        temSessaoDoSupabase: async () => session,
        lerDadosLista: async promise => await promise,
        gravarTemposNoCard: async batch => { writes.push(...batch); return true; },
        TEMPO_VOLTA_SEM_PERDER_SEG: 3600,
        supabaseClient: { from(table) {
            assert.equal(table, 'imposition_tempo_no_card');
            let start = 0, end = 999;
            return {
                select() { return this; },
                order(column) { assert.equal(column, 'id_int'); return this; },
                range(a, b) { start = a; end = b; return this; },
                then(resolve, reject) {
                    calls.push([start, end]);
                    return Promise.resolve(calls.length === failPage
                        ? { data: null, error: new Error('falha sintetica') }
                        : { data: rows.slice(start, end + 1), error: null }).then(resolve, reject);
                },
            };
        } },
    };
    vm.createContext(ctx);
    vm.runInContext(extract('carregarTemposNoCard') + extract('anotarTempoNoCard'), ctx);
    return { ctx, calls, writes };
}
(async () => {
    const { ctx, calls, writes } = context();
    await ctx.carregarTemposNoCard();
    assert.equal(Object.keys(ctx.state.temposNoCard).length, 1205, 'todos os relogios devem ser carregados');
    assert.deepEqual(calls, [[0, 499], [500, 999], [1000, 1499]]);
    await ctx.anotarTempoNoCard([{ numero: '1205', _fila_arte: 'fila' }]);
    assert.equal(ctx.state.temposNoCard[1205].desde, rows[1204].desde);
    assert.equal(writes.length, 0, 'pedido alem da primeira pagina nao pode reiniciar');

    const partial = context({ failPage: 2 });
    const previous = { ...rows[0], desde: '2026-09-01T12:00:00Z' };
    partial.ctx.state.temposNoCard[1] = previous;
    await partial.ctx.carregarTemposNoCard();
    assert.equal(partial.ctx.state.temposNoCard[1], previous, 'falha parcial preserva memoria anterior');
    assert.equal(Object.keys(partial.ctx.state.temposNoCard).length, 1);
    assert.equal(partial.ctx.state.temposNoCardAtivo, false);
    await partial.ctx.anotarTempoNoCard([{ numero: '1205', _fila_arte: 'fila' }]);
    assert.equal(partial.writes.length, 0, 'carga incompleta nao pode gravar novos inicios');
    await partial.ctx.carregarTemposNoCard();
    assert.equal(partial.ctx.state.temposNoCardAtivo, true, 'nova carga completa reativa os relogios');
    assert.equal(Object.keys(partial.ctx.state.temposNoCard).length, 1205);
    await partial.ctx.anotarTempoNoCard([{ numero: '1205', _fila_arte: 'fila' }]);
    assert.equal(partial.writes.length, 0, 'recuperacao mantem o inicio persistido');

    const anonymous = context({ session: false });
    await anonymous.ctx.carregarTemposNoCard();
    assert.equal(anonymous.calls.length, 0);
    assert.equal(anonymous.ctx.state.temposNoCardAtivo, false);
    console.log('OK: carga de 1205 relogios, preservacao do inicio, falha parcial e ausencia de sessao.');
})().catch(error => { console.error(error); process.exitCode = 1; });
