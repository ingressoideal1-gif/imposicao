// PDFs reais; Storage e persistencia simulados, sem rede nem dados reais.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const PDFLib = require('pdf-lib');
const source = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8');
function extract(name, prefix = '') {
    const start = source.indexOf(`\n${prefix}function ${name}(`);
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const model = (id, status = 'EM ALTERACAO', extra = {}) => ({
    id, amostra_status: status, arte_url: `original-${id}`, verso_arte_url: `verso-${id}`, ...extra
});

async function run(items, pageCount, options = {}) {
    const pdf = await PDFLib.PDFDocument.create();
    // A largura identifica cada pagina depois de fatiada e enviada.
    for (let i = 1; i <= pageCount; i++) pdf.addPage([200 + i, 300]);
    const bytes = await pdf.save();
    const uploads = [], saves = [], confirmations = [], messages = [];
    const inputs = new Map();
    const btn = { innerHTML: 'Importar PDF Artes', disabled: false };
    const before = structuredClone(items);
    let reads = 0, renders = 0;
    const context = {
        window: { PDFLib }, Blob, console: { error() {} },
        state: { amostrasOSAtivo: 'pedido', ordens: [{ id: 'pedido' }], osItens: { pedido: items } },
        document: { getElementById(id) {
            if (id === 'btn-import-pdf-arte') return btn;
            if (!inputs.has(id)) inputs.set(id, { value: 'original' });
            return inputs.get(id);
        } },
        confirm(message) { confirmations.push(message); return options.confirm !== false; },
        toast(message, kind) { messages.push({ message, kind }); },
        renderAmostrasOSItens() { renders++; },
        saveAmostraToDB: async (id, osId, fields) => {
            assert.equal(osId, 'pedido');
            const item = items.find(i => i.id === id);
            assert.equal(context.modeloEstaAprovado(item), false, 'Nunca tentar salvar aprovado');
            if (options.failSave) throw new Error('Falha sintetica de persistencia');
            saves.push({ id, fields });
            if (options.afterSave) options.afterSave(items);
        },
        supabaseClient: { storage: { from(bucket) {
            assert.equal(bucket, 'artes');
            return {
                async upload(name, blob) {
                    const doc = await PDFLib.PDFDocument.load(await blob.arrayBuffer());
                    assert.equal(doc.getPageCount(), 1);
                    const [, face, id] = /^arte_(frente|verso)_pedido_([^_]+)_/.exec(name);
                    assert.equal(context.modeloEstaAprovado(items.find(i => String(i.id) === id)), false);
                    uploads.push({ id: Number(id), face, page: doc.getPage(0).getWidth() - 200 });
                    return { error: null };
                },
                getPublicUrl(name) { return { data: { publicUrl: `https://example.invalid/${name}` } }; }
            };
        } } }
    };
    // Mesmo contexto de tipos do pdf-lib: copyPages valida indices com instanceof Array.
    Object.assign(context, new Function(...Object.keys(context),
        extract('modeloEstaAprovado') + extract('modeloTemVerso') + extract('importarPdfMultipage', 'async ')
        + '\nreturn { modeloEstaAprovado, importarPdfMultipage };')(...Object.values(context)));
    const target = { value: 'arquivo.pdf', files: [{ async arrayBuffer() { reads++; return bytes; } }] };
    await context.importarPdfMultipage({ target });
    if (!options.failSave) assert.ok(!messages.some(m => m.kind === 'error'), JSON.stringify(messages));
    assert.equal(target.value, '');
    assert.equal(btn.disabled, false);
    for (let idx = 0; idx < items.length; idx++) {
        if (!context.modeloEstaAprovado(before[idx])) continue;
        assert.deepEqual(items[idx], before[idx], 'Modelo aprovado deve permanecer intacto');
        assert.equal(inputs.has(`amostra-item-arte-${idx}`), false);
        assert.equal(inputs.has(`amostra-item-arte-verso-${idx}`), false);
    }
    return { uploads, saves, confirmations, messages, reads, renders };
}

(async () => {
    let count = 0;
    for (const status of ['APROVADA', 'APROVADO', 'APROVADA_CLIENTE', 'ARTE_APROVADA']) {
        const result = await run([model(1), model(2), model(3, status), model(4)], 4);
        assert.deepEqual(result.uploads, [1, 2, 4].map(id => ({ id, face: 'frente', page: id })));
        assert.deepEqual(result.saves.map(s => s.id), [1, 2, 4]);
        assert.match(result.confirmations[0], /preservados: 3/);
        assert.match(result.messages.at(-1).message, /preservados: 3/);
        count++;
    }
    const duplex = await run([model(1, 'APROVADA', { verso: true }), model(2, '', { status_arte: 'APROVADA_CLIENTE' }), model(3, '', { verso_tipo: 'FxVerso' }), model(4)], 6);
    assert.deepEqual(duplex.uploads, [
        { id: 3, face: 'frente', page: 4 }, { id: 3, face: 'verso', page: 5 }, { id: 4, face: 'frente', page: 6 }
    ]);
    count++;
    const normal = await run([model(1), model(2, '', { verso_tipo: 'FxVerso' })], 3);
    assert.deepEqual(normal.uploads, [{ id: 1, face: 'frente', page: 1 }, { id: 2, face: 'frente', page: 2 }, { id: 2, face: 'verso', page: 3 }]);
    assert.equal(normal.messages.at(-1).message, 'PDF fatiado e importado com sucesso!');
    count++;
    const all = await run([model(1, 'APROVADA'), model(2, 'APROVADO')], 2);
    assert.equal(all.reads, 0);
    assert.equal(all.uploads.length + all.saves.length + all.confirmations.length + all.renders, 0);
    assert.match(all.messages.at(-1).message, /Todos os modelos estão aprovados/);
    count++;
    const cancelled = await run([model(1), model(2, 'APROVADA')], 2, { confirm: false });
    assert.equal(cancelled.uploads.length + cancelled.saves.length, 0);
    count++;
    const short = await run([model(1), model(2, 'APROVADA', { verso: true }), model(3)], 2);
    assert.match(short.confirmations[0], /exatamente 4 páginas/);
    assert.deepEqual(short.uploads, [{ id: 1, face: 'frente', page: 1 }]);
    count++;
    const extra = await run([model(1, 'APROVADA'), model(2)], 3);
    assert.match(extra.confirmations[0], /exatamente 2 páginas/);
    assert.deepEqual(extra.uploads, [{ id: 2, face: 'frente', page: 2 }]);
    count++;
    const changed = await run([model(1), model(2), model(3)], 3, { afterSave(items) { items[1].amostra_status = 'APROVADA'; } });
    assert.deepEqual(changed.uploads, [{ id: 1, face: 'frente', page: 1 }, { id: 3, face: 'frente', page: 3 }]);
    count++;
    const failure = await run([model(1), model(2, 'APROVADA')], 2, { failSave: true });
    assert.equal(failure.messages.at(-1).kind, 'error');
    assert.ok(!failure.messages.some(m => m.kind === 'success'));
    count++;
    console.log(`${count} cenarios OK: paginas reais, aprovados intactos, frente/verso, cancelamento, limites e erro.`);
})().catch(error => { console.error(error); process.exitCode = 1; });
