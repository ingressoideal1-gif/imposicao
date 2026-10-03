'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {scenario, extract} = require('./impressao_combinada_harness.js');
const script = fs.readFileSync('frontend/script.js', 'utf8');
const {sandbox: c, elements, items} = scenario('sequencial', 'aproveitar', [82, 515, 12], {context: true});
vm.runInContext(fs.readFileSync('frontend/teatro-banco.js', 'utf8'), c);
c.state.formatos[0].rows = 4;
c.state.saidas[0].height_mm = 120;
items.forEach((item, idx) => {
    delete item.formato_id;
    item.cutstack_modo = 'independent';
    item.bloco = 50;
    const num = c.state.numeracoes[idx];
    num.tipo = 'TEATRO';
    num.elements = [{type: 'TEATRO_COMBO', x_mm: 5, y_mm: 10, font_size: 10, face: 'both'}];
    num.csv_data = Array.from({length: item.qtd}, (_, i) => ({
        Origem: 'Mapa de Teatro', Mapa_ID: 'mapa', Setor_ID: item.id, Revisao_Mapa: 'a'.repeat(64),
        Setor: 'Setor ' + item.id, Conjunto: idx === 0 ? 'Mesa' : 'Fila',
        Fila: String(Math.floor(i / 3) + 1), Bloco: String(Math.floor(i / 3) + 1), Numero: String(i % 3 + 1)
    }));
});
c.numeracaoDoModelo = item => item && c.state.numeracoes.find(n => n.id === item.numeracao_id);
c.bancoTeatroDoModelo = item => item ? {csv_data: c.numeracaoDoModelo(item).csv_data} : null;
c.quantidadeContratada = item => item.qtd;
c.linhasDoModeloNoPayload = item => c.numeracaoDoModelo(item).csv_data;
vm.runInContext(extract(script, 'bancoDeDadosIncompletoDoModelo'), c);
for (const item of items) {
    assert.equal(c.modoDeImpressaoDoModelo(item), 'blocado');
    assert.equal(c.bancoDeDadosIncompletoDoModelo(item), null);
}
assert.equal(c.esquemaDaSelecaoCombinada(), 'cut_stack');
// A janela aberta já recebe o formato resolvido; a validação acima usa o registro sem esse campo.
items.forEach(item => { item.formato_id = 'f'; });
c.drawPedPreview();
assert.deepEqual(Array.from(c.currentAssemblySets, s => s.num_sheets), [65, 11, 2]);
assert.equal(c.currentAssemblySets.reduce((n, s) => n + s.num_sheets, 0), 78);
for (const set of c.currentAssemblySets) {
    const impressos = Array.from(set.cell_allocations).flat().filter(Boolean);
    assert.equal(new Set(impressos.map(i => i.arte_index)).size, 1);
    for (let p = 0; p < 8; p++) {
        const locais = Array.from(set.cell_allocations[p]).filter(Boolean).map(i => i.local_index);
        assert.deepEqual(locais, Array.from({length: locais.length}, (_, i) => p * set.num_sheets + i));
    }
}
const antes = items.map(i => ({...i}));
c.state.selectedOSItems = [];
c.state.csvData = c.numeracaoDoModelo(items[0]).csv_data;
elements['ped-numeracao'] = {value: items[0].numeracao_id};
c.drawPedPreview();
assert.equal(c.currentAssemblySets[0].num_sheets, 11);
assert.deepEqual(items, antes);
items[0].qtd = 81;
assert.match(c.bancoDeDadosIncompletoDoModelo(items[0]).texto, /quantidade/);
console.log('OK: TEATRO automático, PRONTO sem falso bloqueio, 82/515 lugares, prévia por modelo e quantidade divergente recusada.');
