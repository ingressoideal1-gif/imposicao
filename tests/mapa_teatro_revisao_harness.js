'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const JCS = require('../frontend/mapa-teatro-revisao.js');
const T = require('../frontend/teatro-banco.js');

async function executar() {
    const vetores = [
        [{ '2': 2, '10': 10, a: [{ z: 1, a: 2 }, false, null] }, '{"10":10,"2":2,"a":[{"a":2,"z":1},false,null]}'],
        [[333333333.33333329, 1e30, 4.50, 2e-3, 1e-27, -0], '[333333333.3333333,1e+30,4.5,0.002,1e-27,0]'],
        [[5e-324, 1.7976931348623157e308, 1e20, 1e21, 1e-6, 1e-7], '[5e-324,1.7976931348623157e+308,100000000000000000000,1e+21,0.000001,1e-7]'],
        ['ação 😀\b\t\n\f\r\u0000\u000f"\\/', '"ação 😀\\b\\t\\n\\f\\r\\u0000\\u000f\\"\\\\/"'],
        [{ '\ufb33': 7, '😀': 6, '€': 5, 'ö': 4, '\u0080': 3, '1': 2, '\r': 1 }, '{"\\r":1,"1":2,"\u0080":3,"ö":4,"€":5,"😀":6,"\ufb33":7}'],
        [{ __proto__: null, e: 'e\u0301', a: 'é' }, '{"a":"é","e":"e\u0301"}'],
    ];
    for (const [entrada, esperado] of vetores) {
        assert.equal(JCS.canonicalizar(entrada), esperado);
        assert.equal(await JCS.revisao(entrada), createHash('sha256').update(esperado, 'utf8').digest('hex'));
    }
    for (const invalido of [NaN, Infinity, -Infinity, '\ud800', '\udc00', { '\ud800': 1 }, undefined, [undefined], Array(1), 1n, new Date()]) {
        assert.throws(() => JCS.canonicalizar(invalido));
    }
    const circular = {}; circular.circular = circular;
    assert.throws(() => JCS.canonicalizar(circular), /circular/);
    const compartilhado = { x: 1 };
    assert.equal(JCS.canonicalizar([compartilhado, compartilhado]), '[{"x":1},{"x":1}]');
    const mapa = { id: 'm1', name: 'Mapa sintético', config: { setores: [{ id: 's1', nome: 'Plateia', cadeiras: {} }], '2': 2, '10': 10 } };
    const original = structuredClone(mapa), rev = await T.revisao(mapa);
    assert.equal(rev, await JCS.revisao(mapa.config));
    assert.match(rev, /^[a-f0-9]{64}$/);
    assert.deepEqual(mapa, original);
    assert.equal(await T.revisao({ ...mapa, id: 'm2', name: 'Nome novo' }), rev);
    mapa.config.setores[0].nome = 'Setor renomeado';
    assert.notEqual(await T.revisao(mapa), rev); // Nome do setor pertence à config inteira.
    const a = { setores: [{ id: 'a' }, { id: 'b' }] };
    assert.notEqual(await JCS.revisao(a), await JCS.revisao({ setores: a.setores.slice().reverse() }));
    // Executa o gerador real com PDF-lib, sem DOM, serviços externos ou arquivos de saída.
    const contexto = { MapaTeatroRevisao: JCS, TextEncoder, TextDecoder };
    contexto.window = contexto; vm.createContext(contexto);
    for (const arquivo of ['pdf-lib.min.js', 'mapas-teatro-logo.js', 'mapas-teatro-pdf.js']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend', arquivo), 'utf8'), contexto);
    }
    const pdfMapa = { id: 'pdf-m1', name: 'Teatro sintético', config: { setores: [{ id: 's1', nome: 'Plateia',
        cadeiras: { '0,0': { prefixo: 'A', num: '1', tipo: 'Normal' }, '1,0': { tipo: 'Apagado' } } }] } };
    const [pdf, repetido] = await Promise.all([contexto.MapasTeatroPdf.gerar(pdfMapa), contexto.MapasTeatroPdf.gerar(pdfMapa)]);
    assert.equal(pdf, repetido); // A deduplicação em voo também permanece.
    assert.equal(pdf.revisao, await T.revisao(pdfMapa));
    assert.equal(pdf.total, 1); assert.equal(pdf.arquivos.length, 1);
    assert.equal((await contexto.PDFLib.PDFDocument.load(pdf.bytes)).getPageCount(), 1);
    const renomeado = await contexto.MapasTeatroPdf.gerar({ ...pdfMapa, name: 'Outro nome' });
    assert.equal(renomeado.revisao, pdf.revisao);
    assert.equal((await contexto.PDFLib.PDFDocument.load(renomeado.bytes)).getTitle(), 'Outro nome — Ingresso Ideal');
    console.log('OK: JCS, UTF-8/SHA-256, Unicode, números, arrays, inválidos, bancos e PDFs reais da mesma config');
}
executar().catch(e => { console.error(e); process.exitCode = 1; });
