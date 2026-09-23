const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const fonte = fs.readFileSync(path.join(__dirname, '../frontend/cliente.js'), 'utf8');
function extrair(nome) {
    let inicio = fonte.indexOf('\nasync function ' + nome + '(');
    if (inicio < 0) inicio = fonte.indexOf('\nfunction ' + nome + '(');
    if (inicio < 0) throw new Error('Função ausente: ' + nome);
    return fonte.slice(inicio, fonte.indexOf('\n}', inicio) + 2);
}

function canvas() {
    const tela = { width: 0, height: 0, style: {}, pagina: null };
    tela.getContext = () => ({
        canvas: tela, fillRect() {},
        drawImage(origem) { tela.pagina = origem.pagina; }
    });
    return tela;
}

(async () => {
    const MM = 2.8346;
    const item = { id: 'm1', modo_pdf: true, amostra_num_id: 'n1', qtd: 3,
        arte_escala_h: 100, arte_escala_v: 100 };
    const num = { id: 'n1', formato_id: 'f1', print_mode: 'pdf_duplicate_back',
        elements: [{ type: 'FIXED', face: 'both' }] };
    const state = { osItens: { os1: [item] }, numeracoes: [num],
        formatos: [{ id: 'f1', width_mm: 105, height_mm: 148 }], cores: [] };
    const chamadas = [], renders = [], carimbos = [];
    const pdf = { numPages: 3, async getPage(numero) {
        chamadas.push(numero);
        return {
            getViewport: ({ scale }) => ({ width: 98 * MM * scale, height: 152 * MM * scale }),
            render: ({ canvasContext, transform }) => {
                renders.push({ numero, transform, largura: canvasContext.canvas.width,
                    altura: canvasContext.canvas.height });
                canvasContext.canvas.pagina = numero;
                return { promise: Promise.resolve() };
            },
        };
    } };
    const pdfViewerState = { 0: { pdf, osId: 'os1', totalPages: 3, currentPage: 1 } };
    const frente = canvas(), verso = canvas();
    const info = { textContent: '' }, nav = { style: {} };
    const vazios = { style: {} };
    const elementos = {
        'amostra-pdf-canvas-0': frente, 'amostra-item-canvas-verso-0': verso,
        'amostra-pdf-page-info-0': info, 'amostra-pdf-nav-0': nav,
        'amostra-item-empty-0': vazios, 'amostra-item-empty-pdf-0': vazios,
        'amostra-item-empty-verso-0': vazios,
    };
    const document = { createElement: () => canvas(), getElementById: id => elementos[id] || null };
    const executar = new Function('state', 'pdfViewerState', 'clienteState', 'document', 'window',
        'resolverBancoDoCliente', 'linhasDaAmostra', 'precarregarArtesDosElementos',
        'fontesDosElementos', 'garantirFontesCarregadas', 'drawNumeracaoElementsOverCanvas',
        [extrair('pdfParesNoPortal'), extrair('pdfCopiaNoPortal'),
            extrair('formatoDaAmostraPdfNoPortal'), extrair('escalaDaArtePdfNoPortal'),
            extrair('desenharPaginaDoPdf'),
            'return desenharPaginaDoPdf;'].join('\n'))(
        state, pdfViewerState, { osId: 'os1' }, document,
        { PortalBancos: { ativo: () => false } }, (_item, numeracao) => numeracao,
        () => [], async () => {}, () => [], async () => {},
        (_ctx, _num, _item, _page, largura, altura, face) => carimbos.push({ largura, altura, face }));

    await executar(0, 2);
    assert.deepEqual(chamadas, [2, 2]);
    assert.equal(frente.pagina, 2);
    assert.equal(verso.pagina, 2);
    const larguraCelula = Math.round(105 * MM * 2), alturaCelula = Math.round(148 * MM * 2);
    assert.equal(frente.width, larguraCelula);
    assert.equal(frente.height, alturaCelula);
    assert.equal(verso.width, larguraCelula);
    assert.equal(verso.height, alturaCelula);
    assert.deepEqual(carimbos.map(c => [c.largura, c.altura, c.face]),
        [[larguraCelula, alturaCelula, undefined], [larguraCelula, alturaCelula, 'back']]);
    assert.deepEqual(renders.map(r => r.numero), [2, 2]);
    for (const render of renders) {
        assert.equal(render.largura, larguraCelula);
        assert.equal(render.altura, alturaCelula);
        assert.equal(render.transform[0], 1);
        assert.equal(render.transform[3], 1);
        assert.ok(Math.abs(render.transform[4] - (105 - 98) * MM) < 0.01);
        assert.ok(Math.abs(render.transform[5] - (148 - 152) * MM) < 0.01);
    }
    assert.match(info.textContent, /Peça 2 \/ 3/);

    item.arte_escala_h = 80;
    item.arte_escala_v = 120;
    renders.length = 0;
    await executar(0, 1);
    assert.deepEqual(renders.map(r => r.transform.slice(0, 4)),
        [[0.8, 0, 0, 1.2], [0.8, 0, 0, 1.2]]);
    assert.equal(frente.width, larguraCelula);
    assert.equal(verso.height, alturaCelula);

    chamadas.length = 0;
    num.print_mode = 'pdf_odd_even';
    pdf.numPages = 6;
    await executar(0, 2);
    assert.deepEqual(chamadas, [3, 4]);
    assert.equal(frente.pagina, 3);
    assert.equal(verso.pagina, 4);
    assert.equal(frente.width, verso.width);
    assert.match(info.textContent, /frente p\. 3 · verso p\. 4/);

    chamadas.length = 0;
    num.print_mode = 'front';
    pdf.numPages = 3;
    await executar(0, 3);
    assert.deepEqual(chamadas, [3]);
    assert.match(info.textContent, /Página 3 \/ 3/);

    state.formatos = [];
    num.print_mode = 'pdf_duplicate_back';
    await executar(0, 1);
    assert.equal(frente.style.display, 'none');
    assert.equal(verso.style.display, 'none');
    assert.match(vazios.textContent, /Sem formato/);
    console.log('OK: portal enquadra frente e verso na célula, respeita a escala e avisa sem formato');
})().catch(erro => { console.error(erro); process.exitCode = 1; });
