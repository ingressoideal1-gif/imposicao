import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../frontend/idgen-contexto.js', import.meta.url), 'utf8');
function contexto(query = '') {
    const chamadas = [], values = new Map([['ideal_arte_url_1_frente', 'ERP-preservar'], ['sb-ref-auth-token', 'synthetic']]);
    class Storage {
        getItem(k) { return values.get(k) ?? null; }
        setItem(k, v) { values.set(k, String(v)); }
        removeItem(k) { values.delete(k); }
        clear() { values.clear(); }
    }
    class XHR { open(m, u) { chamadas.push([m, u]); } send() {} }
    const c = { URL, Request, Promise, WeakMap, Map, Object, String, Error, location: { href: 'https://imposicao.pages.dev/' + query, origin: 'https://imposicao.pages.dev' },
        fetch: async (...args) => { chamadas.push(args); return {}; }, XMLHttpRequest: XHR, Storage,
        HTMLFormElement: class { submit() { chamadas.push('form'); } }, navigator: {},
        document: { addEventListener() {}, documentElement: { classList: { add() {} } } },
        indexedDB: { open: n => chamadas.push(n), deleteDatabase: n => chamadas.push(n) },
    };
    c.window = c; const original = c.fetch; vm.runInNewContext(source, c);
    return { c, chamadas, values, original, local: new Storage() };
}
const id = '00000000-0000-4000-8000-000000000002';
test('navegação normal não troca transporte, storage ou autenticação', () => {
    const { c, local, original } = contexto();
    assert.equal(c.fetch, original); assert.equal(c.IDGEN_CONTEXTO, undefined);
    assert.equal(local.getItem('ideal_arte_url_1_frente'), 'ERP-preservar');
});
test('contexto bloqueia REST, bucket, motor, XHR, beacon, websocket e formulário legados', async () => {
    const { c, chamadas } = contexto('?idgen=' + id);
    for (const path of ['https://vwbtitjlpelrcnsytzqw.supabase.co/rest/v1/pedidos_modelos', 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/artes/a.pdf', '/api/print']) {
        await assert.rejects(c.fetch(path, { method: 'POST' }), /bloqueada/);
    }
    assert.throws(() => new c.XMLHttpRequest().open('POST', '/api/print'), /bloqueada/);
    assert.throws(() => new c.WebSocket('wss://example.invalid'), /bloqueada/);
    assert.throws(() => new c.HTMLFormElement().submit(), /bloqueada/);
    assert.equal(c.navigator.sendBeacon('/api/print', ''), false);
    assert.deepEqual(chamadas, []);
    await c.fetch(c.IDGEN_CONTEXTO.endpoint, { method: 'POST' });
    assert.equal(chamadas.length, 1);
});
test('caches IdGen não leem nem alteram caches ERP; sessão existente é preservada', () => {
    const { c, local, values, chamadas } = contexto('?idgen=' + id);
    assert.equal(local.getItem('ideal_arte_url_1_frente'), null);
    local.setItem('ideal_arte_url_1_frente', 'IdGen-em-memoria');
    assert.equal(local.getItem('ideal_arte_url_1_frente'), 'IdGen-em-memoria');
    assert.equal(values.get('ideal_arte_url_1_frente'), 'ERP-preservar');
    assert.equal(local.getItem('sb-ref-auth-token'), 'synthetic');
    assert.throws(() => local.clear(), /bloqueada/);
    c.indexedDB.open('fotos'); c.indexedDB.deleteDatabase('fotos');
    assert.deepEqual(chamadas, ['idgen:' + id + ':fotos', 'idgen:' + id + ':fotos']);
});
test('ID inválido mantém as proteções e não cai no modo legado', async () => {
    const { c } = contexto('?idgen=invalido');
    assert.equal(c.IDGEN_CONTEXTO.valido, false);
    await assert.rejects(c.fetch('/api/print', { method: 'POST' }), /bloqueada/);
});
