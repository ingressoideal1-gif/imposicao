'use strict';
const assert = require('node:assert/strict');
const T = require('../frontend/teatro-banco.js');
const S = require('../frontend/teatro-snapshot.js');
const mapa = { id: 'mapa-teste', name: 'Teste', config: { setores: [{ id: 'setor-teste', nome: 'Plateia', cadeiras: {
    '0,0': { prefixo: 'K', num: '009', bloco: 'A', tipo: 'Normal' },
    '1,0': { prefixo: 'A', num: '002', tipo: 'Normal' },
    '2,0': { prefixo: 'A', num: '003', tipo: 'Normal' },
    '3,0': { prefixo: 'L', num: '010', bloco: 'A', tipo: 'Normal' },
    '0,2': { prefixo: 'K', num: '001', tipo: 'Normal' }
} }] } };
async function executar() {
    const revisao = await T.revisao(mapa);
    const plano = T.preparar(mapa, revisao), rows = plano.setores[0].rows;
    assert.deepEqual(rows.map(r => [r.Fila, r.Numero, r.Bloco]), [
        ['K', '009', 'A'], ['A', '002', 'A'], ['A', '003', 'A'], ['L', '010', 'A'], ['K', '001', 'K']]);
    assert.deepEqual(T.grupos(rows).blocos.map(b => [b.fila, b.quantidade]), [['A', 4], ['K', 1]]);
    assert.equal(T.capa(rows, 0, 3).titulo, 'Fila A');
    const modelo = { id: 'modelo-teste', quantidade: 5, mapa_teatro_id: mapa.id, mapa_teatro_setor_id: 'setor-teste',
        mapa_teatro_revisao: revisao, mapa_teatro_snapshot: { versao: 1, mapa: {id: mapa.id, nome: mapa.name},
            setor: {id: 'setor-teste', nome: 'Plateia'}, tiposAssento: [],
            cadeiras: Object.entries(mapa.config.setores[0].cadeiras).map(([chave, c]) => ({chave, ...c})) } };
    assert.deepEqual(S.banco(modelo).csv_data, rows);
    const form = new FormData();
    form.set('payload', JSON.stringify({numeracao: {tipo: 'TEATRO', csv_data: rows, elements: [{type: 'TEATRO_COMBO'}]}}));
    const originalFetch = global.fetch;
    try {
        global.fetch = async () => ({ok: true, json: async () => ({capabilities: ['teatro_vertical_modelo_v1']})});
        await assert.rejects(T.conferirMotor(form, 'http://motor-simulado'), /bloco original/);
        global.fetch = async () => ({ok: true, json: async () => ({capabilities: ['teatro_vertical_modelo_v1', 'teatro_bloco_independente_v1']})});
        await T.conferirMotor(form, 'http://motor-simulado');
    } finally { global.fetch = originalFetch; }
    if (process.argv.includes('--payload')) console.log(JSON.stringify({rows, modelo}));
    else console.log('OK: lugar K-009 no bloco A, snapshot, capa, ordem e bloqueio do motor antigo.');
}
executar().catch(e => {console.error(e); process.exitCode = 1;});
