// Diagnostico reproduzivel: fluxo real, dados sinteticos, nenhuma rede/escrita.
// node tests/diagnostico_lista_arte_abertura.js
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { performance } = require('node:perf_hooks');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.join(__dirname, '..');
// Referencia historica opcional, somente leitura; terceiro argumento limita o volume.
const source = process.argv[2] ? execFileSync('git', ['show', process.argv[2] + ':frontend/script.js'],
    { cwd: root, encoding: 'utf8', maxBuffer: 8e6 }) : fs.readFileSync(path.join(root, 'frontend/script.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'frontend/supabase-config.js'), 'utf8');
function extract(name, text = source) {
    const start = text.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(start >= 0, name);
    return text.slice(start, text.indexOf('\n}', start) + 2);
}
async function measure(total) {
    let calls = [], renders = [], active = {}, max = {}, usersDelay = 0;
    const products = Array.from({ length: total }, (_, i) => ({ id: i + 1, id_int: i + 1 }));
    async function read(table, data, extra = 0) {
        active[table] = (active[table] || 0) + 1;
        max[table] = Math.max(max[table] || 0, active[table]);
        const event = { table, start: performance.now() };
        calls.push(event);
        await new Promise(resolve => setTimeout(resolve, 20 + extra));
        event.end = performance.now(); active[table]--;
        return { data, error: null };
    }
    const client = { from(table) {
        let ids = [];
        return {
            select() { return this; }, order() { return this; },
            in(_column, values) { ids = values; return this; },
            abortSignal() { return this; },
            then(resolve, reject) {
                let data = [];
                if (table === 'produtos_proposta') data = products;
                if (table === 'propostas_os') data = ids.map(id_int => ({ id_int, data_termino: '2026-09-30' }));
                if (table === 'propostas_os_setores') data = ids.map(id_int => ({ id_int, hora: '12:00' }));
                return read(table, data).then(resolve, reject);
            }
        };
    }};
    const c = {
        state: { ordens: [], osItens: {}, todasArtes: [] },
        window: { location: { hostname: 'imposition.ai-ideal.com.br', protocol: 'https:' } },
        SERVIDA_PELA_NUVEM: true, supabaseClient: client, vibeClient: client,
        console: { log() {}, warn() {}, error(...args) { throw Error(args.map(String).join(' ')); } },
        AbortController, setTimeout, clearTimeout,
        carregarArtesGlobais: () => read('artes', []),
        carregarLinksExistentes: () => read('links', []),
        carregarTemposNoCard: () => read('tempos', []),
        loadUsuarios: () => read('usuarios', [], usersDelay),
        aplicarNomesPreferenciaisDasPropostas: async () => {},
        arteFoiLancada: () => true, SINAIS_SAIU_DA_ARTE: ['EM PRODUCAO'],
        pedidosJaNaGrafica: () => new Set(), pedidoEntraNoPainel: () => true,
        lerStatusOverride: () => null, nomePreferencialDaProposta: () => 'Sintetico',
        mapVibecodeProdutoToOSItem: p => ({ id: p.id }),
        aplicarRegraProdutoPrateleira() {}, normalizarStatusImpressao: x => x,
        conferirColunasQrIdealDosPedidos() {}, iniciarComplementoLista() {},
        completarDadosDaLista() {}, mostrarEstadoCargaLista() {}, toast() {},
        renderOrdens: () => renders.push(performance.now()),
        requisitarPropostas: async (_action, body) => {
            const data = body.tipo === 'numeros' && body.offset === 0
                ? body.numeros.map(id_int => ({ id_int })) : [];
            return (await read('propostas:' + body.tipo, data)).data;
        }
    };
    vm.createContext(c);
    vm.runInContext([...(source.includes('function lerLotesDaLista(') ? ['lerLotesDaLista'] : []),
        'lerDadosLista', 'carregarOrdensDados', 'loadOrdensFromVibecode',
        'carregarModelosGlobais', 'carregarHorasDosPrazos', 'comporPrazoDoERP']
        .map(n => extract(n)).join('\n') + '\n' + extract('consultarPropostas', config), c);
    const reports = [];
    for (const phase of ['abertura', 'atualizacao', 'usuarios_lentos']) {
        calls = []; renders = []; active = {}; max = {};
        usersDelay = phase === 'usuarios_lentos' ? 150 : 0;
        const start = performance.now();
        assert.equal(await c.carregarOrdensDados(), true);
        assert.equal(c.state.ordens.length, total);
        assert.equal(renders.length, 1);
        const tables = {};
        for (const event of calls) {
            const record = tables[event.table] ||= { calls: 0, max: max[event.table], startMs: Math.round(event.start - start), endMs: 0 };
            record.calls++;
            record.endMs = Math.round(event.end - start);
        }
        const parallel = source.includes('function lerLotesDaLista(');
        assert.equal(tables.propostas_os.max, parallel ? Math.min(3, Math.ceil(total / 100)) : 1);
        assert.equal(tables.propostas_os_setores.max, parallel ? Math.min(3, Math.ceil(total / 100)) : 1);
        assert.equal(tables['propostas:numeros'].calls, 2 * Math.ceil(total / 200));
        assert(tables['propostas:numeros'].startMs >= tables.usuarios.endMs - 1);
        reports.push({ phase, orders: total, requests: calls.length, firstFreshRenderMs: Math.round(renders[0] - start), tables });
    }
    assert.equal(reports[0].requests, reports[1].requests, 'atualizar repete todas as leituras');
    return reports;
}
(async () => {
    for (const total of process.argv[3] ? [Number(process.argv[3])] : [100, 500, 1000]) console.log(JSON.stringify(await measure(total)));
    const pending = [], c = { console, setTimeout, clearTimeout, renderOrdens: () => pending.push('render') };
    vm.createContext(c);
    vm.runInContext('let _cargaOrdensEmAndamento = null;\n' + extract('iniciarComplementoLista'), c);
    await Promise.all(['pagamentos', 'status', 'links', 'origem-aprovacao'].map(n => c.iniciarComplementoLista(n, async () => {})));
    await new Promise(resolve => setTimeout(resolve, 70));
    assert.equal(pending.length, source.includes('relogioRedesenho') ? 1 : 4);
    console.log(JSON.stringify({ complementos: 4, rendersAdicionais: pending.length }));
})().catch(error => { console.error(error); process.exitCode = 1; });
