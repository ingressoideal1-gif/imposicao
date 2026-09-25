'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const PDFLib = require('pdf-lib');
const source = fs.readFileSync('frontend/script.js', 'utf8').replace(/\r\n/g, '\n');
function extract(name) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    const original = await PDFLib.PDFDocument.create();
    original.addPage([100 * 72 / 25.4, 50 * 72 / 25.4]).drawText('ARTE ORIGINAL', { x: 10, y: 20 });
    const bytes = await original.save();
    let count = 0;
    async function scenario(items, failUrl) {
        let result; const requests = [], messages = [];
        const btn = { disabled: false, innerHTML: 'Exportar' };
        const ctx = { Blob, Uint8Array, ArrayBuffer, setTimeout, clearTimeout, console: { error() {} },
            state: { amostrasOSAtivo: 'os', ordens: [], formatos: [{ id: 'f', width_mm: 100, height_mm: 50 }], cores: [], numeracoes: [],
                osItens: { os: items.map((item, i) => ({ id: i + 1, formato_id: 'f', ...item })) } },
            document: { getElementById: id => id === 'btn-export-pdf-arte' ? btn : null, createElement: () => ({ click() {} }) },
            URL: { createObjectURL(blob) { result = blob; return 'blob:teste'; }, revokeObjectURL() {} },
            fetch: async url => { requests.push(url); if (url === failUrl) throw Error('Falha sintética'); return { ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }; },
            modeloTemVerso: item => !!item.verso,
            toast: (message, type) => messages.push({ message, type }) };
        ctx.window = ctx; vm.createContext(ctx);
        vm.runInContext(fs.readFileSync(require.resolve('pdf-lib/dist/pdf-lib.js'), 'utf8'), ctx);
        vm.runInContext(['arteParaImpor', 'arrayBufferHeaderIsPdf', 'adicionarArteOriginalAoPdf', 'formatoDoProduto', 'formatoDoModelo', 'exportarPdfSomenteArte'].map(extract).join('\n'), ctx);
        await ctx.exportarPdfSomenteArte();
        assert.equal(btn.disabled, false);
        assert.equal(btn.innerHTML, 'Exportar');
        return { doc: result ? await PDFLib.PDFDocument.load(await result.arrayBuffer()) : null, requests, messages };
    }
    const sample = 'data:application/pdf;base64,' + Buffer.from(bytes).toString('base64');
    const hasContent = page => !!page.node.get(PDFLib.PDFName.of('Contents'));
    for (const item of [
        { amostra_arte_base64: sample },
        { arte_url: 'https://synthetic.invalid/amostras_renderizadas/frente.jpg', amostra_arte_base64: sample },
        { verso: true, amostra_arte_base64: sample, verso_amostra_arte_base64: sample }
    ]) {
        const r = await scenario([item]);
        assert(r.doc, JSON.stringify(r.messages)); assert.equal(r.doc.getPageCount(), item.verso ? 2 : 1);
        assert(r.doc.getPages().every(p => !hasContent(p)), 'amostra nunca vira conteúdo');
        assert.equal(r.requests.length, 0); assert(r.messages.some(m => m.type === 'warning')); count++;
    }
    for (const face of ['frente', 'verso']) {
        const r = await scenario([{ arte_url: 'frente', verso: true, verso_arte_url: 'verso', amostra_arte_base64: sample, verso_amostra_arte_base64: sample }], face);
        assert.equal(r.doc, null, 'falha impede arquivo parcial');
        assert(r.messages.some(m => m.type === 'error' && m.message.includes(face)), JSON.stringify(r.messages)); count++;
    }
    const r = await scenario([{ arte_url: 'frente', verso: true, verso_arte_url: 'verso', amostra_arte_base64: sample }]);
    assert.equal(r.doc.getPageCount(), 2); assert(r.doc.getPages().every(hasContent));
    assert.deepEqual(r.requests, ['frente', 'verso']);
    for (const p of r.doc.getPages()) { assert(Math.abs(p.getWidth() - 100 * 72 / 25.4) < 1e-9); assert(Math.abs(p.getHeight() - 50 * 72 / 25.4) < 1e-9); }
    count++;
    console.log(`OK: ${count} cenários com PDF real: originais preservados, amostras excluídas, frente/verso e falha sem download parcial.`);
})().catch(e => { console.error(e); process.exitCode = 1; });
