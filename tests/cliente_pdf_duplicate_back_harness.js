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
    tela.getContext = () => ({ canvas: tela, drawImage(origem) { tela.pagina = origem.pagina; } });
    return tela;
}

(async () => {
    const item = { id: 'm1', modo_pdf: true, amostra_num_id: 'n1', qtd: 3 };
    const num = { id: 'n1', print_mode: 'pdf_duplicate_back', elements: [] };
    const state = { osItens: { os1: [item] }, numeracoes: [num] };
    const chamadas = [];
    const pdf = { numPages: 3, async getPage(numero) {
        chamadas.push(numero);
        return {
            getViewport: () => ({ width: 100, height: 50 }),
            render: ({ canvasContext }) => {
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
        'resolverBancoDoCliente',
        [extrair('pdfParesNoPortal'), extrair('pdfCopiaNoPortal'), extrair('desenharPaginaDoPdf'),
            'return desenharPaginaDoPdf;'].join('\n'))(
        state, pdfViewerState, { osId: 'os1' }, document,
        { PortalBancos: { ativo: () => false } }, (_item, numeracao) => numeracao);

    await executar(0, 2);
    assert.deepEqual(chamadas, [2, 2]);
    assert.equal(frente.pagina, 2);
    assert.equal(verso.pagina, 2);
    assert.match(info.textContent, /Peça 2 \/ 3/);

    chamadas.length = 0;
    num.print_mode = 'front';
    await executar(0, 3);
    assert.deepEqual(chamadas, [3]);
    assert.match(info.textContent, /Página 3 \/ 3/);
    console.log('OK: portal duplica a página no verso e preserva o modo Frente');
})().catch(erro => { console.error(erro); process.exitCode = 1; });
