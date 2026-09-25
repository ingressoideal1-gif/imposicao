const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const source = process.argv.includes('--baseline') ? execFileSync('git', ['show', 'HEAD:frontend/criador-arte.js'], { encoding: 'utf8' }) : fs.readFileSync('frontend/criador-arte.js', 'utf8');
const start = source.indexOf('async function salvarArteDoEditor()');
const code = source.slice(start, source.indexOf('\n}', start) + 2);
const pdf = new TextEncoder().encode('%PDF-1.7 sintetico para transporte');
function scenario(opts = {}) {
    const item = { id: 1, arte_url: 'antiga', verso_arte_url: 'verso-antigo' };
    const events = [], cache = new Map();
    const editorState = { activeItem: item, activeItemIdx: 0, osId: 'vibe_123', currentFace: opts.face || 'frente',
        format: { width_mm: 180, height_mm: 50 }, fabricCanvas: { toJSON: () => ({ objects: [] }), toDataURL: () => 'data:image/png;base64,AQ==' } };
    const window = { editorState, PDFLib: opts.noPdf ? null : { PDFDocument: { create: async () => ({
        embedPng: async () => ({}), addPage: () => ({ drawImage() {} }), save: async () => pdf
    }) } } };
    const ctx = { window, Blob, Uint8Array, AbortController, setTimeout, clearTimeout, atob, console: { error() {}, warn() {} },
        toast: (message, type) => events.push({ type, message }),
        uploadToStorage: async () => { events.push({ type: 'upload' }); if (opts.duringUpload) await opts.duringUpload(editorState); return opts.upload ?? 'https://synthetic.invalid/novo.pdf'; },
        fetch: async () => { if (opts.fetchError) throw new Error('offline'); return { ok: opts.http !== false, arrayBuffer: async () => opts.corrupt ? new Uint8Array([0]).buffer : pdf.buffer }; },
        saveAmostraToDB: async (id, os, data) => { events.push({ type: 'save', data }); assert.equal(item.arte_url, 'antiga');
            if (opts.dbError) throw new Error('banco indisponivel');
            return opts.noReceipt ? undefined : { confirmado: true, modelo: data }; },
        localStorage: { setItem(k, v) { if (opts.quota) throw new Error('quota'); cache.set(k, v); } },
        document: { getElementById: () => null }, fecharCriadorDeArte: () => events.push({ type: 'close' }),
        renderItemAmostraCombinada: async () => {}, forceRegenerateSnapshots: async () => {} };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    return { run: () => ctx.salvarArteDoEditor(), events, cache, item, editorState };
}
(async () => {
    for (const opts of [{ upload: 'data:application/pdf;base64,AQ==' }, { upload: '' }, { noPdf: true },
        { fetchError: true }, { http: false }, { corrupt: true }, { dbError: true }, { noReceipt: true },
        { duringUpload: async e => { e.currentFace = 'verso'; } }]) {
        const s = scenario(opts); await s.run();
        assert.ok(s.events.some(e => e.type === 'error'), JSON.stringify(opts));
        assert.ok(!s.events.some(e => ['success', 'close'].includes(e.type)), 'falha nao anuncia sucesso/fecha');
        assert.equal(s.item.arte_url, 'antiga'); assert.equal(s.cache.size, 0);
        assert.equal(s.editorState._salvando, false);
    }
    for (const opts of [{}, { face: 'verso' }, { quota: true }]) {
        const s = scenario(opts); await s.run();
        assert.ok(s.events.some(e => e.type === 'success')); assert.ok(s.events.some(e => e.type === 'close'));
        assert.equal(s.item[opts.face === 'verso' ? 'verso_arte_url' : 'arte_url'], 'https://synthetic.invalid/novo.pdf');
        assert.ok(!s.events.some(e => e.type === 'error'));
    }
    let release;
    const wait = new Promise(resolve => { release = resolve; });
    const s = scenario({ duringUpload: async () => wait });
    const first = s.run(); await s.run(); release(); await first;
    assert.equal(s.events.filter(e => e.type === 'save').length, 1);
    console.log('OK: editor so confirma PDF remoto e modelo persistido; falhas preservam arte e edicao aberta');
})().catch(e => { console.error(e); process.exitCode = 1; });
