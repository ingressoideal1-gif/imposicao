// Concorrencia, ordem e falha parcial: funcoes reais e rede/relogio simulados.
const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name) {
    const i = source.search(new RegExp('\\n(?:async )?function ' + name + '\\('));
    assert(i >= 0, name);
    return source.slice(i, source.indexOf('\n}', i) + 2);
}
const tick = () => new Promise(resolve => setImmediate(resolve));
(async () => {
    const c = { console };
    vm.createContext(c); vm.runInContext(extract('lerLotesDaLista'), c);
    const ids = Array.from({ length: 650 }, (_, i) => i + 1);
    let active = 0, max = 0, sizes = [], releases = [];
    const result = c.lerLotesDaLista(ids, lote => {
        active++; max = Math.max(max, active); sizes.push(lote.length);
        return new Promise(resolve => releases.push(() => { active--; resolve(lote); }));
    });
    await tick(); assert.equal(releases.length, 3);
    for (let wave = 0; wave < 3; wave++) {
        releases.splice(0).reverse().forEach(resolve => resolve()); await tick();
    }
    assert.deepEqual(Array.from(await result), ids, 'ordem preservada mesmo com respostas invertidas');
    assert.deepEqual(sizes, [100, 100, 100, 100, 100, 100, 50]); assert.equal(max, 3);
    assert.equal((await c.lerLotesDaLista([], () => assert.fail('lote vazio'))).length, 0);

    let calls = 0, settled = false; releases = [];
    const failure = c.lerLotesDaLista(ids, lote => {
        calls++;
        if (lote[0] === 101) throw Error('falha sintetica');
        return new Promise(resolve => releases.push(() => resolve(lote)));
    }).then(() => assert.fail('nao pode aceitar resultado parcial'), error => { settled = true; return error; });
    await tick(); assert.equal(calls, 3); assert.equal(settled, false, 'aguarda todos os lotes iniciados');
    releases.forEach(resolve => resolve());
    assert.match((await failure).message, /falha sintetica/);
    assert.equal(calls, 3, 'nenhum novo lote depois da falha');
    assert.deepEqual(Array.from(await c.lerLotesDaLista(ids, async lote => lote)), ids, 'retry independente');

    const timers = new Map(); let timerId = 0, paints = 0;
    Object.assign(c, {
        setTimeout(fn, ms) { assert.equal(ms, 50); const id = ++timerId; timers.set(id, fn); return id; },
        clearTimeout(id) { timers.delete(id); }, renderOrdens() { paints++; },
        state: { ordens: [] }, mostrarEstadoCargaLista() {}, conferirNovosPedidosDoUsuario() {}
    });
    vm.runInContext('let _cargaOrdensEmAndamento = null;\n' + extract('iniciarComplementoLista') + '\n' + extract('recorteDaCargaDeOrdens') + '\n' + extract('loadOrdens'), c);
    await Promise.all(['a', 'b', 'c', 'd'].map(n => c.iniciarComplementoLista(n, async () => {})));
    assert.equal(timers.size, 1); assert.equal(paints, 0);
    function fire() { const fns = [...timers.values()]; timers.clear(); fns.forEach(fn => fn()); }
    fire(); assert.equal(paints, 1, 'quatro complementos geram um desenho');
    await c.iniciarComplementoLista('e', async () => {}); fire(); assert.equal(paints, 2);
    let release;
    c.carregarOrdensDados = () => new Promise(resolve => { release = resolve; });
    await c.iniciarComplementoLista('antes', async () => {});
    const load = c.loadOrdens(); fire(); assert.equal(paints, 2, 'timer nao desenha durante outra carga');
    await c.iniciarComplementoLista('durante', async () => {});
    assert.equal(timers.size, 0); release(true); await load;
    assert.equal(paints, 3, 'fim da carga aplica o redesenho pendente');
    await c.iniciarComplementoLista('apos', async () => {});
    const second = c.loadOrdens(); release(false); await second;
    assert.equal(timers.size, 0, 'fim cancela o timer anterior');
    assert.equal(paints, 4); fire(); assert.equal(paints, 4, 'sem pintura duplicada');
    console.log('OK: lotes de 100, maximo tres, ordem, falha parcial, retry e redesenho agrupado.');
})().catch(e => { console.error(e); process.exitCode = 1; });
