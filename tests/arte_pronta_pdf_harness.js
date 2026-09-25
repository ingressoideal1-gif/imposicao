'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert/strict');
const path = require('path');
const main = fs.readFileSync(path.join(__dirname, '../frontend/script.js'), 'utf8').replace(/\r\n/g, '\n');
const pedido = fs.readFileSync(path.join(__dirname, '../frontend/pedido.js'), 'utf8').replace(/\r\n/g, '\n');
function extract(source, name) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
function fixture(mode, pages, changes = {}) {
    const item = { id: 1, modo_pdf: true, qtd: 7, amostra_num_id: 'n', arte_url: 'original.pdf', ...changes };
    const calls = [], notices = [];
    const ctx = { state: { osItens: { os: [item] }, numeracoes: [{ id: 'n', print_mode: mode }] },
        document: { getElementById: () => null }, console: { error() {} },
        numeracaoIdDoItem: i => i.amostra_num_id,
        arteParaImpor: url => url?.includes('amostras_renderizadas') ? null : url,
        fetch: async () => { calls.push('fetch'); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
        pdfjsLib: { getDocument: () => ({ promise: Promise.resolve({ numPages: pages }), destroy: async () => calls.push('destroy') }) },
        garantirTabelasDaAmostra: async () => {}, toast: message => notices.push(message),
        distribuicaoOrfaDoModelo: () => null, divergenciaDeCelulasDoModelo: () => null,
        bancoDeDadosIncompletoDoModelo: () => null, fonteSemGlifoDoModelo: () => null,
        ESCALA_DA_AMOSTRA: 1, regenerarAmostraDoModelo: async () => calls.push('snapshot'),
        buscarModeloPersistidoDaDecisao: async () => ({}), modeloEmCorrecaoDeArte: () => false,
        // Interrompe após registrar a tentativa de persistência, sem banco real.
        saveAmostraToDB: async () => { calls.push('save'); throw new Error('fim simulado'); },
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const name of ['temVerso', 'versoUnico', 'modoDeVersoDoModelo']) vm.runInContext(extract(pedido, name), ctx);
    for (const name of ['assinaturaDoPdfParaPronto', 'validarPaginasDoPdfParaPronto', 'decisionAmostraItem']) vm.runInContext(extract(main, name), ctx);
    return { ctx, item, calls, notices };
}
(async () => {
    let cases = 0;
    for (const [mode, expected] of [['front', 7], ['duplex_unico', 7], ['duplex', 14], ['pdf_odd_even', 14], ['pdf_duplicate_back', 7]]) {
        for (const pages of [expected - 1, expected, expected + 1]) {
            const f = fixture(mode, pages);
            await f.ctx.decisionAmostraItem(1, 'os', 'PRONTO', { emLote: cases % 2 === 0 });
            assert.equal(f.calls.includes('save'), pages === expected, `${mode}: ${pages}`);
            assert.equal(f.calls.includes('snapshot'), pages === expected);
            assert(f.calls.includes('destroy'));
            if (pages !== expected) assert(f.notices.some(n => n.includes(`${pages} páginas; esperado: ${expected}`)));
            cases++;
        }
    }
    for (const changes of [{ qtd: 0 }, { qtd: 1.5 }, { arte_url: '' }, { arte_url: 'amostras_renderizadas/preview.pdf' }]) {
        const f = fixture('front', 7, changes);
        await f.ctx.decisionAmostraItem(1, 'os', 'PRONTO');
        assert(!f.calls.includes('save')); cases++;
    }
    for (const fail of ['fetch', 'parse', 'numeracao', 'mutation']) {
        const f = fixture('front', 7);
        if (fail === 'fetch') f.ctx.fetch = async () => ({ ok: false });
        if (fail === 'parse') f.ctx.pdfjsLib.getDocument = () => ({ promise: Promise.reject(new Error('invalid PDF')), destroy: async () => {} });
        if (fail === 'numeracao') f.ctx.state.numeracoes = [];
        if (fail === 'mutation') f.ctx.regenerarAmostraDoModelo = async () => { f.item.qtd = 8; };
        await f.ctx.decisionAmostraItem(1, 'os', 'PRONTO');
        assert(!f.calls.includes('save'), fail); cases++;
    }
    const conventional = fixture('front', 1, { modo_pdf: false });
    await conventional.ctx.decisionAmostraItem(1, 'os', 'PRONTO');
    assert(conventional.calls.includes('save'));
    assert(!conventional.calls.includes('fetch')); cases++;
    console.log(`${cases} casos OK`);
})().catch(e => { console.error(e); process.exitCode = 1; });
