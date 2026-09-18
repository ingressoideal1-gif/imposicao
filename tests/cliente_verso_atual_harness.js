// Regressões: numeração só frente com verso_tipo antigo e duplex_unico no portal.
// Código real, dados sintéticos e persistência simulada; nenhuma rede.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const ler = nome => fs.readFileSync(path.join(root, 'frontend', nome), 'utf8').replace(/\r\n/g, '\n');
const cliente = ler('cliente.js');
const painel = ler('script.js');
function extrair(src, nome) {
    const inicio = src.search(new RegExp('^(?:async )?function ' + nome + '\\(', 'm'));
    assert.ok(inicio >= 0, nome);
    const fim = src.indexOf('\n}', inicio);
    assert.ok(fim > inicio, nome + ': fim');
    return src.slice(inicio, fim + 2);
}
const contexto = { window: {} };
vm.createContext(contexto);
vm.runInContext(extrair(cliente, 'numeracaoTemVersoNoPortal')
    + extrair(cliente, 'deveDesenharVersoAoVivo')
    + extrair(cliente, 'arteDaFaceParaComposicao'), contexto);
const { numeracaoTemVersoNoPortal, deveDesenharVersoAoVivo, arteDaFaceParaComposicao } = contexto;
const isNumeracaoDuplex = numeracaoTemVersoNoPortal;
const { reconciliarCorNumDoModelo } = require('../frontend/cor-numeracao-do-modelo.js');
const inicioMap = cliente.indexOf('itensCarregados = prodItems.map(item => {');
const fimMap = cliente.indexOf('\n                });', inicioMap);
assert.ok(inicioMap > 0 && fimMap > inicioMap);
const mapear = new Function('prodItems', 'state', 'reconciliarCorNumDoModelo', 'numeracaoTemVersoNoPortal',
    'const propData = []; const osId = "os-teste"; let itensCarregados;\n'
    + cliente.slice(inicioMap, fimMap) + '\n}); return itensCarregados[0];');
const frente = { id: 'n1', name: 'Personalizada', is_custom: true,
    print_mode: 'front', elements: [{ type: 'FOTO', face: 'front' }] };
const bruto = tipo => ({ id: 501, nome_modelo: 'Foto sintética', verso_tipo: tipo,
    amostra_num_id: frente.id, gabarito_operacional: 'Gabarito antigo',
    arte_url: 'https://example.invalid/frente.pdf',
    verso_arte_url: 'https://example.invalid/verso.pdf',
    verso_amostra_arte_base64: 'previa-antiga', quantidade: 100, num_inicial: '001' });
function carregar(tipo, num) {
    const item = bruto(tipo);
    const antes = structuredClone(item);
    const result = mapear([item], { cores: [], numeracoes: num ? [num] : [] },
        reconciliarCorNumDoModelo, numeracaoTemVersoNoPortal);
    assert.deepEqual(item, antes, 'abrir o portal não modifica o registro original');
    assert.equal(result.arte_url, item.arte_url);
    assert.equal(result.verso_arte_url, item.verso_arte_url, 'preservar o arquivo do verso');
    assert.equal(result.verso_amostra_arte_base64, item.verso_amostra_arte_base64);
    assert.equal(result.quantidade, 100);
    assert.equal(result.num_inicial, '001');
    return result;
}
const tipos = ['FRENTE E VERSO', 'FxVerso', 'VERSO COMUM', 'VERSO VARIÁVEL', 'VERSO VARIAVEL'];
for (const tipo of tipos) {
    const atual = carregar(tipo, frente);
    assert.equal(atual.verso, false, tipo + ': numeração atual vence');
    assert.equal(atual.verso_tipo, 'Frente', 'booleano e texto coerentes');
    assert.equal(carregar(tipo, null).verso, true, 'sem numeração, preservar ' + tipo);
}
for (const tipo of ['Frente', 'SÓ FRENTE', 'SO FRENTE', '', null]) {
    assert.equal(carregar(tipo, null).verso, false);
}
for (const num of [
    { ...frente, print_mode: 'duplex' },
    { ...frente, print_mode: 'duplex_unico' },
    { ...frente, elements: [{ type: 'TEXT', face: 'back' }] }
]) {
    assert.equal(carregar('Frente', num).verso, true, 'verso legítimo permanece');
}
// O HTML efetivamente entregue ao cliente deixa de criar o bloco do verso.
const htmlArte = new Function('pdfParesNoPortal', 'pdfCopiaNoPortal', extrair(cliente, 'blocoDeArteDoCliente')
    + '\nreturn blocoDeArteDoCliente;')(
        item => item?.amostra_num_id === 'pair-num',
        item => item?.amostra_num_id === 'copy-num');
const ctx = { desenhoAoVivo: true, arteVisivel: true, versoVisivel: true, paginaCsv: false };
const htmlFrente = htmlArte(carregar('FRENTE E VERSO', frente), 0, ctx);
assert.ok(htmlFrente.includes('amostra-item-canvas-0'));
assert.ok(!htmlFrente.includes('amostra-item-canvas-verso-0'));
const htmlDuplex = htmlArte(carregar('Frente', { ...frente, print_mode: 'duplex_unico' }), 0, ctx);
assert.ok(htmlDuplex.includes('amostra-item-canvas-verso-0'));

// PDF paginado: a frente conserva o folheador e o verso ganha canvas próprio,
// pois a imagem estática não recebe os elementos atuais da numeração.
const pdfDuplex = { ...carregar('Frente', { ...frente, print_mode: 'duplex_unico' }), modo_pdf: true };
assert.equal(deveDesenharVersoAoVivo(pdfDuplex), true);
assert.equal(arteDaFaceParaComposicao(pdfDuplex, 'back'), pdfDuplex.verso_amostra_arte_base64,
    'verso paginado compõe sobre a amostra atual, não sobre arquivo bruto antigo');
assert.equal(arteDaFaceParaComposicao(pdfDuplex, 'front'), pdfDuplex.arte_url);
const htmlPdfDuplex = htmlArte(pdfDuplex, 0, { ...ctx, desenhoAoVivo: false, versoAoVivo: true });
assert.ok(htmlPdfDuplex.includes('amostra-pdf-canvas-0'), 'frente mantém o folheador PDF');
assert.ok(htmlPdfDuplex.includes('amostra-item-canvas-verso-0'), 'verso PDF é composto ao vivo');
assert.ok(!htmlPdfDuplex.includes('amostra-item-img-verso-0'), 'verso não usa snapshot estático');
const pdfPares = { ...carregar('Frente', frente), modo_pdf: true,
    amostra_num_id: 'pair-num', verso: false };
const htmlPdfPares = htmlArte(pdfPares, 0, { ...ctx, desenhoAoVivo: false, versoAoVivo: false });
assert.ok(htmlPdfPares.includes('amostra-pdf-canvas-0')
    && htmlPdfPares.includes('amostra-item-canvas-verso-0'),
    'PDF em pares tem duas janelas mesmo sem arquivo separado do verso');
const pdfCopia = { ...pdfPares, amostra_num_id: 'copy-num' };
const htmlPdfCopia = htmlArte(pdfCopia, 0, { ...ctx, desenhoAoVivo: false, versoAoVivo: false });
assert.ok(htmlPdfCopia.includes('amostra-pdf-canvas-0')
    && htmlPdfCopia.includes('amostra-item-canvas-verso-0'),
    'Duplicar para Verso tem duas janelas mesmo sem arquivo separado');

// Troca pelo seletor: verificar o payload real e a preservação dos originais.
function selecionar(tipo, num) {
    const item = { ...bruto(tipo), verso: true };
    const saves = [];
    const box = {
        state: { osItens: { os: [item] }, numeracoes: num ? [num] : [] },
        document: { getElementById: () => ({ value: num ? num.id : '' }) },
        pintarSelectDeNumeracao() {}, sincronizarNumeracaoDoItem() {},
        isNumeracaoDuplex, pdfViewerState: {}, toast() {},
        renderAmostrasOSItens() {}, renderItemAmostraCombinada() {},
        saveAmostraToDB(id, os, data) { saves.push(data); return Promise.resolve(); }
    };
    vm.createContext(box);
    vm.runInContext(extrair(painel, 'onItemNumSelect'), box);
    box.onItemNumSelect(0, 'os', item.id);
    assert.equal(saves.length, 1);
    assert.equal(item.verso_arte_url, bruto(tipo).verso_arte_url);
    assert.ok(!('verso_arte_url' in saves[0]));
    assert.ok(!('arte_url' in saves[0]));
    return { item, payload: saves[0] };
}
for (const tipo of tipos) {
    const { item, payload } = selecionar(tipo, frente);
    assert.equal(item.verso, false);
    assert.equal(payload.verso_tipo, 'Frente', tipo + ': salvar a face corrigida');
    assert.equal(payload.verso_amostra_arte_base64, null);
    const semNum = selecionar(tipo, null);
    assert.equal(semNum.item.verso, true, 'limpar seletor preserva verso');
    assert.ok(!('verso_amostra_arte_base64' in semNum.payload));
}
assert.equal(selecionar('Frente', { ...frente, print_mode: 'duplex_unico' }).item.verso, true);

// A recomposição do canvas não pode reativar o campo antigo após a seleção.
const render = extrair(painel, 'renderItemAmostraCombinada');
const inicio = render.indexOf('const numIsDuplex =');
const fim = render.indexOf('\n    if (num) {\n        preloadAmostraItemPdfElements', inicio);
assert.ok(inicio > 0 && fim > inicio);
const atualizarCanvas = new Function('item', 'num', 'isNumeracaoDuplex',
    render.slice(inicio, fim));
for (const tipo of tipos) {
    const item = { ...bruto(tipo), verso: true };
    atualizarCanvas(item, frente, isNumeracaoDuplex);
    assert.equal(item.verso, false);
    assert.equal(item.verso_tipo, 'Frente');
    const semNum = { ...bruto(tipo), verso: true };
    atualizarCanvas(semNum, null, isNumeracaoDuplex);
    assert.equal(semNum.verso, true);
}
console.log('OK: portal, HTML, seleção/persistência e canvas; frente, legados, duplex e numeração ausente.');

module.exports = { htmlFrente, htmlDuplex };
