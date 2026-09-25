'use strict';
// Gera uma página isolada com o formulário e os compositores reais; banco/PDF simulados.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8').replace(/\r\n/g, '\n');
const main = read('frontend/script.js'), portal = read('frontend/cliente.js');
function extract(source, name) {
    const start = source.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'));
    if (start < 0) throw Error(name);
    return source.slice(start, source.indexOf('\n}', start) + 2);
}
const harness = read('tests/cores_margens_browser_harness.js');
const setupStart = harness.indexOf('await page.evaluate(() => {') + 'await page.evaluate(() => {'.length;
const setupEnd = harness.indexOf('\n        });\n        const funcs', setupStart);
if (setupEnd < 0) throw Error('Setup de teste não encontrado');
const setup = harness.slice(setupStart, setupEnd);
const sourceHtml = read('frontend/index.html');
const start = sourceHtml.indexOf('<section id="view-cores"');
const section = sourceHtml.slice(start, sourceHtml.indexOf('</section>', start) + 10).replace('class="view-section"', 'class="view-section active"');
const names = ['api', 'apiSemConfirmacao', 'valorDoFormatoConfere', 'garantirPdfDaCor', 'atualizarFormatoDaCor', 'onCorFormatoSelect', 'saveCor', 'editCor', 'cancelCorEdit', 'duplicateCor'];
const code = read('frontend/cor-margens.js') + '\n' + setup + '\nconst _pdfDeCorEmVoo = new Map();\n'
    + names.map(n => extract(main, n)).join('\n') + '\n'
    + extract(main, 'drawAmostraFace').replace('function drawAmostraFace(', 'function desenharPainel(') + '\n'
    + extract(portal, 'arteDaFaceParaComposicao') + '\n'
    + extract(portal, 'drawAmostraFace').replace('function drawAmostraFace(', 'function desenharPortal(') + `
window.toast = (message, type) => { document.getElementById('resultado').textContent = message; };
window.garantirFontesCarregadas = async () => {};
window.fontesDosElementos = () => [];
window.rasterDaAmostra = async (_key, create) => create();
window.escalaDaArteDoModelo = () => ({ h: 100, v: 100 });
window.pdfjsLib = { GlobalWorkerOptions: {}, getDocument() { return {
    destroy: async () => {}, promise: Promise.resolve({ numPages: 1, getPage: async () => ({
        getViewport: ({ scale }) => ({ width: 300 * scale, height: 180 * scale }),
        render: ({ canvasContext, viewport }) => { canvasContext.fillStyle = '#f5cc60'; canvasContext.fillRect(0, 0, viewport.width, viewport.height); return { promise: Promise.resolve() }; }
    }) })
}; } };
function imagemTeste(fmt, face) {
    const c = document.createElement('canvas'); c.width = fmt.width_mm * 3; c.height = fmt.height_mm * 3;
    const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = '#162b50'; x.lineWidth = 3; x.strokeRect(2, 2, c.width-4, c.height-4);
    x.fillStyle = '#162b50'; x.font = 'bold 18px Arial'; x.fillText(face + ' — ARTE DE TESTE', 14, 32);
    x.font = '16px Arial'; x.fillText(fmt.width_mm + ' × ' + fmt.height_mm + ' mm', 14, 58);
    return c.toDataURL();
}
let drawing = Promise.resolve();
function atualizarPrevia() {
    drawing = drawing.then(async () => {
        const fmt = state.formatos.find(f => f.id === document.getElementById('cor-formato').value);
        let cor; try { cor = CorMargens.lerFormulario(fmt); } catch (_) { return; }
        if (cor.width_mm > 500 || cor.height_mm > 500) { toast('Este demonstrador limita a prévia a 500 mm.'); return; }
        cor.id = 'visual'; cor.pdf_base64 = 'data:application/pdf;base64,QQ==';
        const item = { id: 'modelo', _dbLoaded: true, arte_url: imagemTeste(fmt, 'FRENTE'), verso_arte_url: imagemTeste(fmt, 'VERSO') };
        state.osItens = { teste: [item] };
        for (const [prefix, draw] of [['painel', desenharPainel], ['portal', desenharPortal]]) {
            for (const face of ['front', 'back']) await draw(item, face, document.getElementById(prefix + '-' + face), null, fmt, cor, null, 0, 'teste', 3);
        }
    }).catch(e => toast(e.message));
}
document.getElementById('cor-name').value = 'Cor de teste local';
document.getElementById('cor-formato').value = 'f1';
for (const [lado, valor] of Object.entries({ esquerda: '3,5', direita: '7', superior: '2', inferior: '9' })) document.getElementById('cor-margem-' + lado).value = valor;
document.getElementById('view-cores').addEventListener('input', atualizarPrevia);
document.getElementById('cor-formato').addEventListener('change', atualizarPrevia);
document.getElementById('reabrir').onclick = async () => { if (state.cores.length) { await editCor(state.cores[state.cores.length-1].id); atualizarPrevia(); } else toast('Salve a Cor de teste primeiro.'); };
// O demonstrador usa papel e arte fictícios; uploads reais não fazem parte deste teste.
for (const input of document.querySelectorAll('input[type=file]')) input.disabled = true;
for (const button of document.querySelectorAll('button')) if (/UPLOAD/.test(button.textContent)) button.disabled = true;
atualizarFormatoDaCor(); atualizarPrevia();
`;
const cards = ['painel', 'portal'].flatMap(prefix => ['front', 'back'].map(face => `<article><h3>${prefix === 'painel' ? 'Painel de Arte' : 'Link do cliente'} · ${face === 'front' ? 'Frente' : 'Verso'}</h3><canvas id="${prefix}-${face}"></canvas></article>`)).join('');
const html = `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'"><title>Validação local — margens da Cor</title><style>${read('frontend/style.css')} body{padding:24px}.view-section,header,main{max-width:1100px;margin:0 auto}header{padding:20px;background:#203448;margin-bottom:20px}main{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(330px,1fr))}article{padding:15px;background:#1d2939;overflow:auto}canvas{max-width:100%;height:auto}button{cursor:pointer}#resultado{color:#fde68a;margin:12px 0}</style><header><h1>Teste local das margens da Cor</h1><p>Dados fictícios. Salvar mantém os dados apenas nesta aba; atualizar a página apaga o teste. Sem acesso ao banco ou à impressora.</p><p>Edite as quatro margens e compare as prévias abaixo. Amarelo representa a Cor; a borda marca a peça.</p><button id="reabrir" class="btn">Reabrir última Cor salva neste teste</button><p id="resultado" role="status"></p></header>${section}<main>${cards}</main><script>${code.replace(/<\/script/gi, '<\\/script')}</script></html>`;
const output = path.join(root, 'tmp-cores-margens'); fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, 'index.html'), html);
console.log(path.join(output, 'index.html'));
