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
// A capa percorre FILAS; o miolo mantém sua montagem vertical original.
c.state.formatos[0].has_cover = true;
elements['ped-preview-part-input'] = {value:'capa',style:{},options:['miolo','capa','contracapa'].map(value=>({value}))};
const textosCapa = [];
elements['ped-preview-canvas'].getContext('2d').fillText = texto => textosCapa.push(texto);
c.currentPreviewPage = 1;
c.drawPedPreview();
assert.match(elements['ped-preview-sheet-num'].textContent, /Folha 1 de 4/);
assert.deepEqual(textosCapa.filter(t => /^Mesa \d+$/.test(t)), Array.from({length:8}, (_,i)=>'Mesa '+(i+1)));
assert.equal(c.pedRefazerTotalFolhas, 11);
textosCapa.length = 0;
c.currentPreviewPage = 4;
c.drawPedPreview();
assert.deepEqual(textosCapa.filter(t => /^Mesa \d+$/.test(t)), ['Mesa 25','Mesa 26','Mesa 27','Mesa 28']);
assert.ok(textosCapa.includes(' - Setor 96 - de 1 a 1 (1 lugares)'));
// Trocar modelo não reutiliza nomes/arte das capas de outro setor.
c.state.selectedOSItems = items.map(item=>({osId:'vibe_22247',itemId:item.id}));
elements['ped-preview-set-input'].value = '1';
c.currentPreviewPage = 22;
textosCapa.length = 0;
c.drawPedPreview();
assert.match(elements['ped-preview-sheet-num'].textContent, /Folha 22 de 22/);
assert.deepEqual(textosCapa.filter(t => /^Fila \d+$/.test(t)), ['Fila 169','Fila 170','Fila 171','Fila 172']);
elements['ped-preview-set-input'].value = '2';
c.drawPedPreview();
assert.equal(c.currentPreviewPage, 4);
assert.match(elements['ped-preview-sheet-num'].textContent, /Folha 4 de 4/);
elements['ped-preview-part-input'].value = 'miolo';
c.drawPedPreview();
assert.deepEqual(Array.from(c.currentAssemblySets, s => s.num_sheets), [65,11,2]);
// A prévia manual da Imposição usa as mesmas folhas e rótulos de capas.
c.state.selectedOSItems = [];
c.state.impMultiArtes = [];
c.state.impArtPdfDoc = c.state.pedArtPdfDoc;
c.state.impArtWidth = c.state.pedArtWidth;
c.state.impArtHeight = c.state.pedArtHeight;
c.state.impArtPagesCache = {};
c.state.impArtPagesRendering = {};
c.atualizarRestricaoModoVibe = () => {};
for (const [nome, valor] of Object.entries({
    'imp-formato':'f','imp-saida':'s','imp-numeracao':items[0].numeracao_id,
    'imp-print-mode':'front','imp-schema':'cut_stack','imp-cutstack-mode':'strict_assembly',
    'imp-start':'1','imp-end':'82','imp-sheets-per-block':'50',
    'preview-sheet-num':'','preview-page-input':'4'
})) elements[nome] = {value:valor,style:{}};
elements['preview-part-input'] = {value:'capa',style:{},options:['miolo','capa','contracapa'].map(value=>({value}))};
elements['preview-canvas'] = elements['ped-preview-canvas'];
vm.runInContext(extract(script, 'drawPreview'), c);
textosCapa.length = 0;
c.currentPreviewPage = 4;
c.drawPreview();
assert.match(elements['preview-sheet-num'].textContent, /Folha 4 de 4/);
assert.deepEqual(textosCapa.filter(t => /^Mesa \d+$/.test(t)), ['Mesa 25','Mesa 26','Mesa 27','Mesa 28']);
items[0].qtd = 81;
assert.match(c.bancoDeDadosIncompletoDoModelo(items[0]).texto, /quantidade/);
console.log('OK: TEATRO automático, PRONTO sem falso bloqueio, 82/515 lugares, prévia por modelo e quantidade divergente recusada.');
