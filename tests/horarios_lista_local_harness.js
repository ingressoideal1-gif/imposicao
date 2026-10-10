const fs = require('node:fs'), assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
function extract(name) {
    const start = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
(async () => {
    // Mesmo bloco executado antes de construir a lista. A rede de horas nunca
    // responde; as datas devem ficar disponiveis sem esperar essa rede.
    const start = source.indexOf('        // A data e a hora são campos distintos');
    const end = source.indexOf('        // pedidosComerciais ignorado', start);
    let chamadas = 0;
    const ler = new AsyncFunction('SERVIDA_PELA_NUVEM', 'opcoes', 'prazosPorPedido', 'carregarHorasDosPrazos',
        'vibeClient', 'lerDadosLista', 'comporPrazoDoERP', source.slice(start, end) + '\nreturn prazosPorPedido;');
    const datas = {1: '2026-10-10'};
    const result = await ler(false, {}, datas, () => { chamadas++; return new Promise(() => {}); }, {},
        callback => callback(), (_data, _hora) => '2026-10-10');
    assert.equal(result[1], '2026-10-10'); assert.equal(chamadas, 0);

    const state = {ordens: [{numero: 1, prazo_entrega: '2026-10-10'}]}, window = {_acessoLocal: 'operador'};
    const pedidos = [];
    const completar = new Function('state', 'window', 'vibeClient', 'carregarHorasDosPrazos',
        'iniciarComplementoLista', extract('comporPrazoDoERP') + extract('completarHorasDaLista') + '\nreturn completarHorasDaLista;')(
        state, window, {}, (_c, ids, signal) => new Promise(resolve => pedidos.push({ids, signal, resolve})),
        (_nome, executar) => executar());
    const primeira = state.ordens;
    const p1 = completar(primeira, datas);
    state.ordens = [{numero: 2, prazo_entrega: '2026-10-11'}];
    const p2 = completar(state.ordens, {2:'2026-10-11'});
    assert(pedidos[0].signal.aborted);
    pedidos[0].resolve({1:'15:00:00'}); pedidos[1].resolve({2:'16:00:00'});
    await Promise.all([p1,p2]);
    assert.equal(primeira[0].prazo_entrega, '2026-10-10');
    assert.equal(state.ordens[0].prazo_entrega, '2026-10-11T16:00:00');
    const p3 = completar(state.ordens, {2:'2026-10-11'});
    window._acessoLocal = 'outro'; pedidos[2].resolve({2:'17:00:00'}); await p3;
    assert.equal(state.ordens[0].prazo_entrega, '2026-10-11T16:00:00');

    const controle = new AbortController(); let enviadas = 0;
    const local = new Function('SERVIDA_PELA_NUVEM', 'fetch', 'console', extract('carregarHorasDosPrazos') + '\nreturn carregarHorasDosPrazos;')(
        false, (_url, {signal}) => { enviadas++; return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('abort')))); }, {warn(){}});
    const lenta = local({}, Array.from({length:100}, (_,i)=>i+1), controle.signal);
    assert.equal(enviadas, 4); controle.abort(); await lenta; assert.equal(enviadas, 4);
    console.log('OK: lista sem espera pelas horas; cancelamento; recorte e usuario protegidos.');
})().catch(error => { console.error(error); process.exitCode=1; });
