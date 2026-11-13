const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.search(new RegExp(`\n(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
// Executa o encerramento real da carga: a lista preparada tambem deve disparar
// o complemento, sem aguardar rede para devolver a lista ao operador.
const load = extract('loadOrdensFromVibecode');
const start = load.indexOf('        console.log(`[Vibecode]');
const end = load.indexOf('        return true;', start);
assert.ok(start >= 0 && end > start);
const finish = new Function('opcoes', 'SERVIDA_PELA_NUVEM', 'state', 'prazosPorPedido',
    'completarHorasDaLista', 'console', 'produtos', load.slice(start, end) + 'return true;');
for (const localPreparado of [true, false]) {
    let calls = 0;
    const orders = [{ numero: '99', prazo_entrega: '2026-11-13' }];
    const dates = { 99: '2026-11-13' };
    assert.equal(finish({ localPreparado }, false, { ordens: orders }, dates,
        (received, data) => {
            calls++;
            assert.equal(received, orders);
            assert.equal(data, dates);
            return new Promise(() => {});
        }, { log() {} }, []), true);
    assert.equal(calls, 1, `complemento da lista localPreparado=${localPreparado}`);
}
finish({}, true, { ordens: [] }, {}, () => assert.fail('web nao usa complemento local'), { log() {} }, []);

(async () => {
    const state = { ordens: [{ numero: '99', prazo_entrega: '2026-11-13' }] };
    const window = { _acessoLocal: 'sintetico' };
    let resolve;
    let redraws = 0;
    const complete = new Function('state', 'window', 'vibeClient', 'carregarHorasDosPrazos',
        'iniciarComplementoLista', extract('comporPrazoDoERP') + extract('completarHorasDaLista')
        + '\nreturn completarHorasDaLista;')(state, window, {},
        () => new Promise(r => { resolve = r; }), async (_, task) => { await task(); redraws++; });
    const task = complete(state.ordens, { 99: '2026-11-13' });
    assert.equal(state.ordens[0].prazo_entrega, '2026-11-13');
    resolve({ 99: '16:30:00' });
    await task;
    assert.equal(state.ordens[0].prazo_entrega, '2026-11-13T16:30:00');
    assert.equal(redraws, 1);
    const previous = state.ordens;
    const stale = complete(previous, { 99: '2026-11-13' });
    state.ordens = [];
    resolve({ 99: '18:00:00' });
    await stale;
    assert.equal(previous[0].prazo_entrega, '2026-11-13T16:30:00');
    const empty = complete(state.ordens = [{ numero: '99', prazo_entrega: '2026-11-13' }], { 99: '2026-11-13' });
    resolve({});
    await empty;
    assert.equal(state.ordens[0].prazo_entrega, '2026-11-13');
    console.log('OK: lista preparada completa horas sem bloquear; sem hora e resposta antiga preservadas.');
})().catch(error => { console.error(error); process.exitCode = 1; });
