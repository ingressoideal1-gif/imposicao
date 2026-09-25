'use strict';
// Executa as exportações reais com arquivos/dados sintéticos, sem rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('frontend/script.js', 'utf8').replace(/\r\n/g, '\n');
const CorMargens = require('../frontend/cor-margens.js');
function extract(name) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
(async () => {
    for (const name of ['exportarPdfModelos', 'exportarPdfSomenteArte', 'exportarPdfGabarito']) {
        const pages = [], messages = [], downloads = [];
        const format = { id: 'f', width_mm: 100, height_mm: 50 };
        const cor = { id: 'c', formato_id: 'f', width_mm: 999, height_mm: 999,
            margem_esquerda_mm: 3.5, margem_direita_mm: 7, margem_superior_mm: 2, margem_inferior_mm: 9 };
        const button = { innerHTML: 'Exportar', disabled: false };
        const canvas = { style: {}, toDataURL: () => 'data:image/png;base64,AQ==' };
        const pdfDoc = { addPage(size) { pages.push(Array.from(size)); return { drawImage() {} }; },
            getPages: () => pages.map(() => ({ drawImage() {} })), embedPng: async () => ({}),
            context: { obj: x => x }, catalog: { set() {} }, save: async () => new Uint8Array([1]) };
        const ctx = { CorMargens, Blob, Uint8Array, console,
            state: { amostrasOSAtivo: 'os', ordens: [], formatos: [format], cores: [cor], numeracoes: [],
                osItens: { os: [{ id: 'm', formato_id: 'f', amostra_cor_id: 'c', amostra_arte_base64: 'data:image/png;base64,AQ==' }] } },
            document: { getElementById: id => id.startsWith('btn-export') ? button : id === 'amostra-item-canvas-0' ? canvas : null,
                createElement: () => ({ click() { downloads.push('download'); } }) },
            URL: { createObjectURL: () => 'blob:synthetic', revokeObjectURL() {} },
            modeloTemVerso: () => false, prepararTelaParaOPdfProva: async () => [],
            PDFLib: { PDFDocument: { create: async () => pdfDoc }, PDFName: { of: x => x }, PDFString: { of: x => x }, PDFNumber: { of: x => x } },
            jspdf: { jsPDF: class { constructor(opts) { pages.push(opts.format); this.outline = { add() {} }; }
                addImage() {} save() { downloads.push('download'); } } },
            toast: (message, type) => messages.push({ message, type }) };
        ctx.window = ctx; vm.createContext(ctx);
        vm.runInContext(['arteParaImpor', 'adicionarArteOriginalAoPdf', 'formatoDoProduto', 'formatoDoModelo', name].map(extract).join('\n'), ctx);
        await ctx[name]();
        assert(!messages.some(m => m.type === 'error'), JSON.stringify(messages));
        assert.equal(downloads.length, 1, name + ' conclui');
        assert.equal(pages.length, 1, name);
        const expected = name === 'exportarPdfModelos' ? [110.5, 61] : [100 * 72 / 25.4, 50 * 72 / 25.4];
        pages[0].forEach((n, i) => assert(Math.abs(n - expected[i]) < 1e-9, name + ': dimensão ' + i));
        assert.equal(format.width_mm, 100); assert.equal(format.height_mm, 50);
        assert.equal(button.disabled, false);
        console.log('OK:', name, 'dimensões', pages[0]);
    }
})().catch(e => { console.error(e); process.exitCode = 1; });
