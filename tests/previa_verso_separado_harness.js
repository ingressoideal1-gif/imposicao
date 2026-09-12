// A janela do Pedido deve mostrar a mesma face que o motor usa no duplex.
const fs = require('fs');
const path = require('path');
const PEDIDO = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, nome) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome);
}
function extrair(nome) {
    const inicio = PEDIDO.indexOf('\nfunction ' + nome + '(');
    if (inicio < 0) throw new Error('funcao ausente: ' + nome);
    return PEDIDO.slice(inicio, PEDIDO.indexOf('\n}', inicio) + 2);
}
function api(estado) {
    const versoUnico = modo => modo === 'duplex_unico';
    return new Function('state', 'versoUnico', extrair('pdfDaFaceNaPreviaPedido')
        + '\nreturn pdfDaFaceNaPreviaPedido;')(estado, versoUnico);
}

const frente = { nome: 'frente', numPages: 1 };
const verso = { nome: 'verso', numPages: 1 };

(function duplexSeparado() {
    const escolher = api({ pedArtPdfDoc: frente, pedArtVersoPdfDoc: verso, printMode: 'duplex' });
    const faceFrente = escolher(false, 'cut_stack', 0);
    const faceVerso = escolher(true, 'cut_stack', 0);
    ok(faceFrente.documento === frente && faceFrente.pagina === 1,
        'frente continua na pagina 1 do arquivo da frente');
    ok(faceVerso.documento === verso && faceVerso.pagina === 1,
        'verso separado usa a pagina 1 do arquivo do verso');
})();

(function duplexEmbutido() {
    const duasFaces = { nome: 'frente-e-verso', numPages: 2 };
    const escolher = api({ pedArtPdfDoc: duasFaces, pedArtVersoPdfDoc: null, printMode: 'duplex' });
    const faceVerso = escolher(true, 'sequential', 0);
    ok(faceVerso.documento === duasFaces && faceVerso.pagina === 2,
        'PDF com verso embutido continua usando a pagina 2');
})();

(function pdfPaginadoPreservaRegraDoMotor() {
    const paginado = { nome: 'paginado', numPages: 8 };
    const escolher = api({ pedArtPdfDoc: paginado, pedArtVersoPdfDoc: verso, printMode: 'duplex' });
    const faceVerso = escolher(true, 'pdf_multiple', 2);
    ok(faceVerso.documento === paginado && faceVerso.pagina === 6,
        'duplex paginado continua usando as paginas pares do arquivo principal');
})();

(function versoUnicoPaginado() {
    const escolher = api({ pedArtPdfDoc: frente, pedArtVersoPdfDoc: verso, printMode: 'duplex_unico' });
    const faceVerso = escolher(true, 'pdf_multiple', 3);
    ok(faceVerso.documento === verso && faceVerso.pagina === 1,
        'FxVersoUnico continua usando o arquivo separado');
})();

ok(PEDIDO.includes('const pdfDaFace = pdfDaFaceNaPreviaPedido(isBack, schema, item_index);'),
    'drawPedPreview usa a selecao testada');
ok(PEDIDO.includes('const pageNum = isMultiArtePdf ? (isBack ? 2 : 1) : pdfDaFace.pagina;'),
    'drawPedPreview usa a pagina testada');

if (falhas) process.exit(1);
console.log('OK: previa do verso separado -- ' + total + ' verificacoes.');
