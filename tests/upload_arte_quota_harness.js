const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name, prefix = '') {
    const start = source.indexOf(`\n${prefix}function ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
async function run(face, quota, pdf, failure) {
    const item = { id: '1005004', modo_pdf: pdf, arte_json: {}, verso_arte_json: {} };
    const cacheKey = `ideal_arte_url_${item.id}_${face}`;
    const aliasKey = `ideal_arte_url_24182_0_${face}`;
    const cache = new Map([[cacheKey, 'old'], [aliasKey, 'old'], ['unrelated', 'keep']]);
    const saves = [], messages = [];
    const url = 'https://example.invalid/arte.pdf';
    const ctx = {
        state: { osItens: { 24182: [item] } }, window: {},
        document: {
            getElementById: () => ({ files: [{ name: 'arte.pdf', type: 'application/pdf', arrayBuffer: async () => new ArrayBuffer(0) }], style: {} }),
            createElement: () => ({ getContext: () => ({}), toDataURL: () => 'synthetic-snapshot' })
        },
        localStorage: {
            setItem: (key, value) => {
                if (quota) { const e = new Error('full'); e.name = quota; throw e; }
                cache.set(key, value);
            },
            removeItem: key => cache.delete(key)
        },
        supabaseClient: { storage: { from: () => ({
            upload: async () => ({ error: failure === 'upload' ? new Error('upload rejected') : null }),
            getPublicUrl: () => ({ data: { publicUrl: url } })
        }) } },
        saveAmostraToDB: async (...args) => { if (failure === 'db') throw new Error('db rejected'); saves.push(args); },
        toast: (message, kind) => messages.push({ message, kind }),
        console: { warn() {}, error() {} },
        resolveItemCorNumIds() {}, atualizarMarcasDeArteCompartilhada() {},
        renderItemAmostraCombinada() {}, initPdfViewer() {}, pdfViewerState: {},
        pdfjsLib: { getDocument: () => ({ promise: Promise.resolve({ getPage: async () => ({
            getViewport: () => ({ width: 1, height: 1 }), render: () => ({ promise: Promise.resolve() })
        }) }) }) }
    };
    vm.createContext(ctx);
    vm.runInContext(extract('invalidarArteVetorial') + extract('onItemArteUpload', 'async '), ctx);
    await ctx.onItemArteUpload(0, '24182', item.id, face);
    assert.equal(cache.get('unrelated'), 'keep');
    if (failure) {
        assert.equal(messages.at(-1).kind, 'error');
        assert.ok(!messages.some(m => m.kind === 'success'));
        assert.equal(saves.length, 0);
        return;
    }
    const field = face === 'verso' ? 'verso_arte_url' : 'arte_url';
    assert.ok(saves.some(args => args[0] === item.id && args[1] === '24182' && args[2][field] === url));
    assert.equal(item[field], url);
    assert.equal(item[face === 'verso' ? 'verso_arte_json' : 'arte_json'], null);
    assert.equal(messages.at(-1).kind, 'success');
    for (const key of [cacheKey, aliasKey]) assert.equal(cache.get(key), quota ? undefined : url);
}
(async () => {
    let count = 0;
    for (const face of ['frente', 'verso']) {
        for (const quota of [null, 'QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']) {
            for (const pdf of [false, true]) { await run(face, quota, pdf); count++; }
        }
    }
    for (const failure of ['upload', 'db']) { await run('frente', 'QuotaExceededError', false, failure); count++; }
    console.log(`${count} cenarios OK: upload, quota, frente/verso, PDF e erros remotos simulados.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
