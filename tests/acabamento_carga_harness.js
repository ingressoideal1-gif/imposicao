// Leituras reais, relógio controlado e banco sintético; nenhuma rede ou escrita.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const acabamento = fs.readFileSync('frontend/acabamento.js', 'utf8');
const script = fs.readFileSync('frontend/script.js', 'utf8');
function extract(name, source, indent = '') {
    const start = source.search(new RegExp('\\n' + indent + '(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n' + indent + '}', start) + indent.length + 2);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function environment(numbers = [1]) {
    const pending = [], timers = new Map(), notices = [], queries = [];
    let serial = 0, concurrent = 0, maxConcurrent = 0;
    const c = { tela: { prazo: 'geral', acabamento: { antigo: { status: 'Pronto' } }, numerosNoMapa: new Set() },
        numbers, hold: false, renders: 0, console: { warn() {} }, AbortController,
        setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
        clearTimeout(id) { timers.delete(id); },
        pedidosDoPainel: () => c.numbers.map(numero => ({ numero })),
        faltamEstagiosNaLista: () => c.numbers.some(n => !c.tela.numerosNoMapa.has(String(n))),
        render: () => c.renders++, renderDetalhe() {}, toast: message => notices.push(message) };
    c.fn = name => typeof c[name] === 'function' ? c[name] : null;
    c.supabaseClient = { from() {
        let ids;
        return { select() { return this; }, in(_key, values) { ids = values; return this; },
            then(resolve, reject) {
                queries.push([...ids]); concurrent++; maxConcurrent = Math.max(maxConcurrent, concurrent);
                const finish = () => { concurrent--; resolve({ data: ids.map(id => ({ id, id_int: id, acabamento_status: 'Pronto' })) }); };
                if (c.hold) pending.push(finish); else finish();
                return Promise.resolve().then(undefined, reject);
            } };
    } };
    vm.createContext(c);
    vm.runInContext(extract('lerDadosLista', script) + '\n'
        + ['carregarAcabamentoDosModelos', 'completarEstagiosDaLista'].map(n => extract(n, acabamento, '    ')).join('\n'), c);
    return { c, pending, timers, notices, queries, maxConcurrent: () => maxConcurrent };
}
(async () => {
    let checks = 0;
    const ok = (condition, message) => { checks++; assert(condition, message); };
    const batches = environment(Array.from({ length: 601 }, (_, i) => i + 1)); batches.c.hold = true;
    const read = batches.c.carregarAcabamentoDosModelos(); await tick();
    ok(batches.queries.length === 3 && batches.maxConcurrent() === 3, 'no máximo três lotes simultâneos');
    batches.pending.splice(0).forEach(finish => finish()); await tick();
    ok(batches.queries.length === 4, 'último lote depois dos três anteriores');
    batches.pending.splice(0).forEach(finish => finish()); await read;
    ok(Object.keys(batches.c.tela.acabamento).length === 601, 'todos os estágios aplicados juntos');
    const timeout = environment(); timeout.c.hold = true;
    const oldMap = timeout.c.tela.acabamento;
    const stalled = timeout.c.carregarAcabamentoDosModelos(); await tick();
    const timer = [...timeout.timers.values()][0]; ok(timer.ms === 30000, 'prazo da leitura é 30 segundos');
    timer.fn(); await stalled;
    ok(timeout.c.tela.acabamento === oldMap && timeout.c.tela.erroAcabamento, 'timeout preserva o mapa anterior');
    ok(timeout.notices[0].includes('Atualize') && !timeout.notices[0].includes('administrador'), 'falha de rede oferece retry sem pedir migração');
    timeout.c.hold = false; await timeout.c.carregarAcabamentoDosModelos();
    ok(timeout.c.tela.acabamento['1'].status === 'Pronto' && !timeout.c.tela.erroAcabamento, 'retry recupera leitura');
    timeout.pending.splice(0).forEach(finish => finish()); await tick();
    ok(timeout.c.tela.acabamento['1'].status === 'Pronto', 'resposta tardia do timeout não reaplica estado');
    const stale = environment(); stale.c.hold = true;
    const first = stale.c.carregarAcabamentoDosModelos(); await tick();
    stale.c.tela.prazo = 'expedicao'; stale.c.numbers = [9]; stale.c.hold = false;
    await stale.c.carregarAcabamentoDosModelos(); stale.pending.splice(0).forEach(finish => finish()); await first;
    ok(stale.c.tela.acabamento['9'] && !stale.c.tela.acabamento['1'], 'resposta de outro recorte não substitui mapa novo');
    const changed = environment(); changed.c.hold = true; changed.c.completarEstagiosDaLista(); await tick();
    changed.c.numbers = [9]; changed.c.hold = false;
    changed.pending.splice(0).forEach(finish => finish()); await tick(); await tick();
    ok(changed.c.tela.acabamento['9'] && !changed.c.tela.buscandoEstagios, 'fila alterada durante a leitura retoma estágios faltantes');
    console.log(JSON.stringify({ checks, maxConcurrent: batches.maxConcurrent(), syntheticModels: 601 }));
})().catch(error => { console.error(error); process.exitCode = 1; });
