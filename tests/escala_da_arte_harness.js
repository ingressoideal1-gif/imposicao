// A ESCALA DA CAMADA DE ARTE, NA JANELA DO MODO PDF MULTI-PAGINA (31/08/2026).
//
// Pedido do usuario: dois campos, % horizontal e % vertical, que esticam SO a
// arte e a mantem centralizada na celula — na tela e no papel. O papel ja tem
// medicao propria em `tests/test_escala_da_arte.py`, que impoe de verdade e mede
// a tinta. Este harness cuida do outro lado: a JANELA.
//
// Ele recorta as funcoes do proprio script.js e as executa com um DOM de
// mentira. Nada aqui e copia da regra — se alguem mudar a conta no script.js
// sem mudar aqui, o teste quebra.
//
// O que ele trava:
//
//   1. O canvas da janela e a CELULA, e nao a pagina da arte. Enquanto era a
//      pagina, escalar nao tinha como aparecer: a moldura crescia junto.
//   2. A arte entra centralizada, e continua centralizada em qualquer escala.
//   3. Os dois eixos sao independentes (o `transform` do pdf.js leva os dois).
//   4. A numeracao e carimbada sobre a CELULA — ela nao estica com a arte.
//   5. Valor invalido (zero, negativo, texto, acima do maximo) vira algo seguro,
//      e o campo na tela passa a mostrar o valor aparado.
//   6. A gravacao vai para as colunas certas de `pedidos_modelos`.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}
function perto(a, b, tol) {
    return Math.abs(a - b) <= (tol === undefined ? 0.5 : tol);
}

function recortar(fonte, assinatura, nome) {
    const i = fonte.indexOf('\n' + assinatura);
    if (i < 0) throw new Error('nao achei ' + (nome || assinatura));
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

// ─── O DOM de mentira ────────────────────────────────────────────────────────

function domFalso() {
    const elementos = {};
    const criar = (id) => {
        const el = {
            id, value: '', style: {}, dataset: {}, disabled: false,
            width: 0, height: 0,
            _pintou: [],
            getContext() {
                return {
                    clearRect() {}, fillRect(...a) { el._pintou.push(a); },
                    set fillStyle(v) { el._fill = v; }, get fillStyle() { return el._fill; },
                    save() {}, restore() {}, beginPath() {}, rect() {}, clip() {},
                    translate() {}, rotate() {}, drawImage() {}, fillText() {},
                    measureText() { return { width: 10 }; },
                };
            },
        };
        elementos[id] = el;
        return el;
    };
    return {
        elementos, criar,
        getElementById: (id) => elementos[id] || null,
        querySelector: () => null,
        activeElement: null,
    };
}

// A pagina do PDF: 180 x 50 mm, o tamanho natural do arquivo.
const MM = 2.8346;
const ARTE_W_MM = 180, ARTE_H_MM = 50;

function paginaFalsa() {
    const chamadas = [];
    return {
        chamadas,
        getViewport({ scale }) {
            return { width: ARTE_W_MM * MM * scale, height: ARTE_H_MM * MM * scale, scale };
        },
        render(opcoes) {
            chamadas.push(opcoes);
            return { promise: Promise.resolve() };
        },
    };
}

function montarJanela({ formatos, item, num }) {
    const doc = domFalso();
    const pagina = paginaFalsa();
    const state = {
        formatos: formatos || [],
        cores: [],
        numeracoes: num ? [num] : [],
        osItens: { 'os-1': [item] },
        amostrasContainerId: 'amostras-itens-container',
        activeOSItem: null,
    };
    const carimbos = [];
    const pdfViewerState = {
        'os-1_0': { pdf: { getPage: async () => pagina }, currentPage: 1, totalPages: 4, osId: 'os-1', idx: 0 },
    };

    const corpo =
        'const ESCALA_ARTE_MIN = 1, ESCALA_ARTE_MAX = 400;\n'
        + recortar(SCRIPT, 'function escalaDaArteDoModelo(', 'escalaDaArteDoModelo')
        + recortar(SCRIPT, 'function formatoDoModelo(', 'formatoDoModelo')
        + recortar(SCRIPT, 'async function renderPdfViewerPage(', 'renderPdfViewerPage')
        + '\nreturn renderPdfViewerPage;';

    const janela = {};
    const fn = new Function(
        'state', 'document', 'pdfViewerState', 'console', 'window',
        'precarregarArtesDosElementos', 'drawNumeracaoElementsOverCanvas', 'linhasDaPagina',
        corpo)(
        state, doc, pdfViewerState, { warn() {}, error(...a) { console.error('[janela]', ...a); } }, janela,
        async () => {},
        (ctx, n, it, pg, w, h) => carimbos.push({ w, h }),
        () => []);

    return { fn, doc, pagina, carimbos, state };
}

const FORMATO = { id: 'f1', width_mm: 200, height_mm: 60 };
const NUM = { id: 'n1', name: 'Seq', formato_id: 'f1', elements: [{ type: 'TEXT', x_mm: 10, y_mm: 10 }] };

function itemBase(extra) {
    return Object.assign({
        id: 'it-0', modo_pdf: true, amostra_num_id: 'n1', arte_url: 'x.pdf',
    }, extra || {});
}

// ─── 1. O canvas e a celula, e a arte entra centralizada ─────────────────────

(async () => {
    {
        const j = montarJanela({ formatos: [FORMATO], item: itemBase(), num: NUM });
        const canvas = j.doc.criar('amostra-pdf-canvas-0');
        j.doc.criar('amostra-pdf-nav-0');
        j.doc.criar('amostra-pdf-escala-0');
        j.doc.criar('amostra-pdf-escala-h-0');
        j.doc.criar('amostra-pdf-escala-v-0');
        j.doc.criar('amostra-pdf-page-info-0');
        j.doc.criar('amostra-item-empty-0');

        await j.fn('os-1_0', 1, 0);

        const escalaTela = 2.0;
        ok(perto(canvas.width, FORMATO.width_mm * MM * escalaTela, 1),
            'o canvas tem a largura da CELULA, nao a da pagina da arte',
            'canvas.width=' + canvas.width + ' esperado=' + (FORMATO.width_mm * MM * escalaTela));
        ok(perto(canvas.height, FORMATO.height_mm * MM * escalaTela, 1),
            'o canvas tem a altura da CELULA',
            'canvas.height=' + canvas.height);

        const t = j.pagina.chamadas[0].transform;
        ok(Array.isArray(t) && t.length === 6, 'a arte e desenhada com transform proprio', JSON.stringify(t));
        ok(t[0] === 1 && t[3] === 1, 'a 100% a arte sai no tamanho natural', JSON.stringify(t));
        const sobraX = (FORMATO.width_mm - ARTE_W_MM) * MM * escalaTela / 2;
        const sobraY = (FORMATO.height_mm - ARTE_H_MM) * MM * escalaTela / 2;
        ok(perto(t[4], sobraX, 1), 'a arte entra centralizada na horizontal', 't[4]=' + t[4] + ' esperado=' + sobraX);
        ok(perto(t[5], sobraY, 1), 'a arte entra centralizada na vertical', 't[5]=' + t[5] + ' esperado=' + sobraY);

        ok(j.carimbos.length === 1 && perto(j.carimbos[0].w, canvas.width, 0.001)
            && perto(j.carimbos[0].h, canvas.height, 0.001),
            'a numeracao e carimbada sobre a CELULA, e nao sobre a arte',
            JSON.stringify(j.carimbos));

        ok(j.doc.getElementById('amostra-pdf-escala-0').style.display === 'flex',
            'os campos de escala aparecem quando o PDF entra na tela');
    }

    // ─── 2. A escala estica so a arte, e o centro nao se move ────────────────
    {
        const j = montarJanela({ formatos: [FORMATO], item: itemBase({ arte_escala_h: 50, arte_escala_v: 120 }), num: NUM });
        const canvas = j.doc.criar('amostra-pdf-canvas-0');
        j.doc.criar('amostra-pdf-nav-0');
        j.doc.criar('amostra-pdf-escala-0');
        j.doc.criar('amostra-pdf-escala-h-0');
        j.doc.criar('amostra-pdf-escala-v-0');

        await j.fn('os-1_0', 1, 0);

        const t = j.pagina.chamadas[0].transform;
        ok(perto(t[0], 0.5, 0.001), 'a escala horizontal chega ao desenho', 't[0]=' + t[0]);
        ok(perto(t[3], 1.2, 0.001), 'a escala vertical chega ao desenho, sozinha', 't[3]=' + t[3]);

        const escalaTela = 2.0;
        const larguraArte = ARTE_W_MM * MM * escalaTela * 0.5;
        const alturaArte = ARTE_H_MM * MM * escalaTela * 1.2;
        ok(perto(t[4] + larguraArte / 2, canvas.width / 2, 1),
            'com escala, a arte continua centralizada na celula (horizontal)');
        ok(perto(t[5] + alturaArte / 2, canvas.height / 2, 1),
            'com escala, a arte continua centralizada na celula (vertical)');

        ok(perto(canvas.width, FORMATO.width_mm * MM * escalaTela, 1),
            'a celula NAO muda de tamanho quando a arte muda');

        ok(j.doc.getElementById('amostra-pdf-escala-h-0').value === 50
            && j.doc.getElementById('amostra-pdf-escala-v-0').value === 120,
            'os campos mostram a escala gravada ao redesenhar');
    }

    // ─── 3. Sem formato cadastrado, a janela volta a ser a pagina da arte ────
    {
        const j = montarJanela({ formatos: [], item: itemBase(), num: null });
        const canvas = j.doc.criar('amostra-pdf-canvas-0');
        await j.fn('os-1_0', 1, 0);
        ok(perto(canvas.width, ARTE_W_MM * MM * 2.0, 1),
            'sem formato, o canvas continua sendo a pagina da arte (como antes)',
            'canvas.width=' + canvas.width);
    }

    // ─── 4. Valores impossiveis nao chegam ao papel ──────────────────────────
    {
        const fn = new Function('window',
            'const ESCALA_ARTE_MIN = 1, ESCALA_ARTE_MAX = 400;\n'
            + recortar(SCRIPT, 'function escalaDaArteDoModelo(', 'escalaDaArteDoModelo')
            + '\nreturn escalaDaArteDoModelo;')({});
        ok(fn({}).h === 100 && fn({}).v === 100, 'sem nada gravado, 100 e 100');
        ok(fn({ arte_escala_h: 0 }).h === 100, 'escala zero vira 100 (arte invisivel nao e opcao)');
        ok(fn({ arte_escala_h: -5 }).h === 100, 'escala negativa vira 100');
        ok(fn({ arte_escala_h: 'abc' }).h === 100, 'texto vira 100');
        ok(fn({ arte_escala_h: 9000 }).h === 400, 'acima do maximo, para no maximo');
        ok(fn({ arte_escala_h: '87,5' }).h === 87.5 || fn({ arte_escala_h: 87.5 }).h === 87.5,
            'a casa decimal sobrevive');
        ok(fn({ arte_escala_h: 100, arte_escala_v: 55 }).v === 55, 'os dois eixos sao lidos separados');
    }

    // ─── 5. A gravacao vai para as colunas certas ────────────────────────────
    {
        const gravado = [];
        const doc = domFalso();
        const campoH = doc.criar('amostra-pdf-escala-h-0');
        const campoV = doc.criar('amostra-pdf-escala-v-0');
        campoH.value = '  95,5 ';   // virgula e espaco, como o operador digita
        campoV.value = '900';       // acima do maximo

        const item = { id: 'it-0', arte_escala_h: 100, arte_escala_v: 100 };
        const state = { osItens: { 'os-1': [item] } };
        const pdfViewerState = {};
        const corpo =
            recortar(SCRIPT, 'async function salvarEscalaDaArte(', 'salvarEscalaDaArte')
            + '\nreturn salvarEscalaDaArte;';
        const salvar = new Function(
            'state', 'document', 'pdfViewerState', 'console', 'window',
            'saveAmostraToDB', 'toast', 'renderPdfViewerPage',
            'const ESCALA_ARTE_MIN = 1, ESCALA_ARTE_MAX = 400;\n'
            + recortar(SCRIPT, 'function escalaDaArteDoModelo(', 'escalaDaArteDoModelo')
            + corpo)(
            state, doc, pdfViewerState, { error() {} }, {},
            async (itemId, osId, dados) => { gravado.push({ itemId, osId, dados }); },
            () => {}, async () => {});

        await salvar(0, 'os-1', 'it-0');

        ok(gravado.length === 1, 'gravou uma vez', JSON.stringify(gravado));
        const dados = gravado[0] ? gravado[0].dados : {};
        ok(dados.arte_escala_h === 95.5, 'a virgula do teclado brasileiro e aceita', JSON.stringify(dados));
        ok(dados.arte_escala_v === 400, 'o valor acima do maximo e aparado antes de gravar', JSON.stringify(dados));
        ok(Object.keys(dados).length === 2, 'grava so as duas colunas da escala', JSON.stringify(dados));
        ok(campoH.value === 95.5 && campoV.value === 400,
            'o campo na tela passa a mostrar o valor aparado, e nao o que foi digitado');
        ok(item._needsSnapshot === true, 'a arte de aprovacao e marcada para refazer');

        // De novo, sem mudar nada: nao pode gravar outra vez.
        await salvar(0, 'os-1', 'it-0');
        ok(gravado.length === 1, 'digitar o mesmo valor nao gera gravacao nova');
    }

    // ─── 6. A escala chega ao motor pelos dois caminhos ──────────────────────
    {
        const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
        for (const [nome, fonte] of [['script.js', SCRIPT], ['pedido.js', PEDIDO]]) {
            ok(/arte_escala_h:/.test(fonte) && /arte_escala_v:/.test(fonte),
                'o payload da imposicao do ' + nome + ' leva a escala ao motor');
            ok(/escala_h: arte\._escalaH/.test(fonte),
                'cada arte da folha combinada leva a PROPRIA escala no ' + nome);
        }
        const APP = fs.readFileSync(path.join(RAIZ, 'app.py'), 'utf8');
        ok(/arte_escala_h=data\.get\("arte_escala_h"/.test(APP),
            'o app.py repassa a escala ao ImpositionConfig');
        const ENGINE = fs.readFileSync(path.join(RAIZ, 'engine.py'), 'utf8');
        ok(/def _arte_na_celula\(/.test(ENGINE), 'o motor tem a funcao que posiciona a arte');
        const colagens = (ENGINE.match(/_arte_na_celula\(/g) || []).length - 1;
        ok(colagens === 7,
            'as SETE colagens de arte do motor passam pela mesma conta (frente e verso, '
            + 'com e sem giro, uma folha ou varios modelos)',
            'achei ' + colagens);
        ok(!/rect_art_temp, current_doc_base, page_idx_\w+, clip=/.test(ENGINE),
            'nenhuma colagem de arte ficou com o retangulo antigo, sem escala');
    }

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' conferencias falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' conferencias da escala da arte.');
})();
