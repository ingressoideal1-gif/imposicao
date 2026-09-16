const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const start = source.search(new RegExp(`\\n(?:async )?function ${name}\\(`));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const names = ['comporPrazoDoERP', 'carregarHorasDosPrazos', '_prazoDoPedido',
    'pedidoEstaAtrasado', 'pedidoEhParaHoje', 'formatPrazoBadge'];
const api = new Function(names.map(extract).join('\n') + `\nreturn {${names}};`)();
const inicio = source.indexOf('        let prazosPorPedido = {};');
const fim = source.indexOf('        // pedidosComerciais ignorado', inicio);
assert.ok(inicio > 0 && fim > inicio);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const carregar = new AsyncFunction('vibeClient', 'produtos', 'propostas', 'console',
    names.map(extract).join('\n') + source.slice(inicio, fim) + '\nreturn prazosPorPedido;');

function client(os, setores, error = null) {
    const calls = [];
    return { calls, from(table) {
        return { select(columns) {
            calls.push({ table, columns });
            return { async in(field, ids) {
                assert.equal(field, 'id_int');
                if (table === 'propostas_os_setores') {
                    assert.equal(columns, 'id_int, hora');
                    assert.ok(ids.length <= 100);
                } else {
                    assert.equal(table, 'propostas_os');
                }
                return { data: (table === 'propostas_os' ? os : setores)
                    .filter(row => ids.some(id => String(id) === String(row.id_int))),
                    error: table === 'propostas_os_setores' ? error : null };
            } };
        } };
    } };
}

(async () => {
    // Dados sintéticos: primeira linha nula, hora espelhada e outro pedido sem hora.
    const os = [{ id_int: 1, data_termino: '2026-09-16T00:00:00' },
        { id_int: 2, data_termino: '2026-09-17T00:00:00' },
        { id_int: 3, data_termino: null }];
    const setores = [{ id_int: 1, hora: null }, { id_int: 1, hora: '16:00:00' },
        { id_int: 1, hora: '16:00:00' }, { id_int: 2, hora: null },
        { id_int: 3, hora: '15:30:00' }];
    const logs = [];
    const logger = { warn: (...args) => logs.push(args) };
    const result = await carregar(client(os, setores), [], os, logger);
    assert.equal(result[1], '2026-09-16T16:00:00');
    assert.equal(result[2], '2026-09-17');
    assert.equal(result[3], undefined);
    assert.ok(api.formatPrazoBadge({ prazo_entrega: result[1] }).includes('>16/09 16:00</span>'));
    assert.ok(api.formatPrazoBadge({ prazo_entrega: result[2] }).includes('>17/09</span>'));
    assert.equal(api.comporPrazoDoERP(null, '16:00:00'), null);
    assert.equal(api.comporPrazoDoERP('2026-09-16T00:00:00', '00:00:00'), '2026-09-16T00:00:00');
    assert.equal(api.comporPrazoDoERP('2026-09-16', '25:00:00'), '2026-09-16');
    assert.equal(api.comporPrazoDoERP('2026-09-16', '15:30:00'), '2026-09-16T15:30:00');
    const failed = await carregar(client(os, [], new Error('falha simulada')), [], os, logger);
    assert.equal(failed[1], '2026-09-16');
    assert.equal(logs.length, 1);
    const empty = client([], []);
    assert.deepEqual(await carregar(empty, [], [], logger), {});
    assert.equal(empty.calls.length, 0);
    const many = Array.from({ length: 251 }, (_, id_int) => ({ id_int, hora: '15:00:00' }));
    const paged = client([], many);
    const hours = await api.carregarHorasDosPrazos(paged, many.map(row => row.id_int));
    assert.equal(Object.keys(hours).length, 251);
    assert.equal(paged.calls.length, 3);
    assert.match(source.slice(source.indexOf('tbodyArte.innerHTML = arteNaTela.map')), /formatPrazoBadge\(os\)/);
    console.log('OK: prazo do ERP, setores, ausencia, falha e lotes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
