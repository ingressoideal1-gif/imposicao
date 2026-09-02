// O folheador de paginas do PDF Paginado na PAGINA DO CLIENTE (01/09/2026).
//
// Roda em node, sem navegador: `node tests/cliente_pdf_paginado_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// A funcao e LIDA do `cliente.js` e avaliada aqui -- nao copiada. Uma copia
// continuaria passando depois de o original mudar.
//
// ## O defeito que este arquivo prende
//
// Modelo em PDF Paginado tem a frente num arquivo de N paginas, uma por peca, e
// -- no FxVersoUnico -- o verso em OUTRO arquivo, de uma pagina so. O
// `drawAmostraFace` e chamado duas vezes, uma por face, e as duas chamadas
// escreviam no MESMO `pdfViewerState[idx]`.
//
// Resultado no pedido 21408, relatado pelo usuario: a chamada da face `back`
// chegava depois, trocava o estado do folheador pelo verso e redesenhava o
// canvas da FRENTE com ele. O `totalPages` caia de 25 para 1, o rodape virava
// "Pagina 1 / 1" e as setas paravam de andar -- o cliente ficava sem como
// conferir as 24 credenciais restantes antes de aprovar.
//
// O painel ganhou a guarda em 31/08/2026 (`usaVisualizadorPaginado`, no
// `script.js`), e o `cliente.js` -- que tem a sua propria copia da mesma funcao
// -- ficou para tras. Na pagina do cliente o verso nem precisa do folheador: ele
// ja tem imagem propria (`amostra-item-img-verso-N`, alimentada por
// `verso_amostra_arte_base64`).

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra, null, 2) : ''));
}

function extrairFuncao(src, nome) {
    let i = src.indexOf('\nasync function ' + nome + '(');
    if (i < 0) i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const FRENTE = 'https://exemplo/artes/arte_frente_vibe_21408_1000739.pdf';
const VERSO = 'https://exemplo/artes/arte_verso_vibe_21408_1000739.pdf';
const PAGINAS = { [FRENTE]: 25, [VERSO]: 1 };

/** Um elemento de mentira, com o bastante para o codigo mexer no estilo. */
function elementoFalso(id) {
    return { id, style: {}, width: 0, height: 0, querySelector: () => null };
}

/**
 * Roda as DUAS faces, na mesma ordem em que a pagina do cliente as chama
 * (`renderItemAmostra`: front e depois back), e devolve o estado final do
 * folheador mais o que cada face pediu ao visualizador.
 */
async function rodarAsDuasFaces(arquivo) {
    const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
    const corpo = extrairFuncao(src, 'drawAmostraFace');

    const item = {
        id: 1000739,
        modo_pdf: true,
        verso: true,                 // FxVerso no ERP -> a pagina monta as duas faces
        verso_tipo: 'FxVerso',
        arte_url: FRENTE,
        verso_arte_url: VERSO,
        amostra_num_id: 'ac929236-b2c0-4627-9563-ef730026d4d9',
        amostra_cor_id: 'ba759c0f-f8f4-4065-8b1f-f7dbf4b669c1',
    };
    const state = { osItens: { os1: [item] }, cores: [], numeracoes: [] };
    const pdfViewerState = {};
    const pedidos = [];

    const document = { getElementById: (id) => elementoFalso(id) };

    async function initPdfViewer(idx, pdfUrl, osId) {
        pedidos.push({ chamada: 'init', idx, pdfUrl });
        pdfViewerState[idx] = {
            pdf: {}, currentPage: 1, totalPages: PAGINAS[pdfUrl] || 1, pdfUrl, osId,
        };
    }
    async function renderPdfViewerPage(idx, pageNum) {
        pedidos.push({ chamada: 'render', idx, pageNum });
    }

    const fn = new Function(
        'state', 'document', 'pdfViewerState', 'initPdfViewer', 'renderPdfViewerPage',
        corpo + '\nreturn drawAmostraFace;'
    )(state, document, pdfViewerState, initPdfViewer, renderPdfViewerPage);

    const fmt = { width_mm: 105, height_mm: 148 };
    const S = 150 / 25.4;

    // A pagina do cliente NAO cria canvas para nenhuma das faces em modo PDF:
    // a frente usa `amostra-pdf-canvas-N` (achado por getElementById dentro da
    // funcao) e o verso e um `<img>`. Por isso os dois canvas chegam nulos.
    await fn(item, 'front', null, elementoFalso('empty'), fmt, null, null, 0, 'os1', S);
    await fn(item, 'back', null, elementoFalso('empty-verso'), fmt, null, null, 0, 'os1', S);

    return { pdfViewerState, pedidos };
}

// So o `frontend/`. A pasta `painel/` tambem tem um `cliente.js`, mas ela e um
// CACHE que o agente baixa do Storage para servir o painel offline: fica fora do
// git, some numa clonagem limpa, e o proprio agente a reescreve sozinho a
// qualquer momento -- editei a copia de la em 01/09/2026 e o agente a devolveu a
// versao antiga minutos depois. Um teste sobre ela reprovaria por "ainda nao
// publicaram", que nao e defeito de codigo e ninguem consegue consertar no
// arquivo. Alem disso, o link que o cliente abre e o da Vercel, e nao o da
// estacao: quem leva o conserto ate ele e o `publicar.ps1`.
const COPIAS_A_TESTAR = ['frontend/cliente.js'];

(async () => {
    for (const arquivo of COPIAS_A_TESTAR) {
        let r;
        try {
            r = await rodarAsDuasFaces(arquivo);
        } catch (e) {
            ok(false, arquivo + ': a funcao nem rodou -- ' + e.message);
            continue;
        }

        const vs = r.pdfViewerState[0];

        ok(!!vs, arquivo + ': o folheador da frente existe depois das duas faces');

        ok(vs && vs.pdfUrl === FRENTE,
            arquivo + ': o folheador continua no arquivo da FRENTE depois de a face '
            + 'back ser desenhada -- se cair no verso, o cliente ve o verso no lugar '
            + 'da frente',
            { esperado: FRENTE, encontrado: vs && vs.pdfUrl });

        ok(vs && vs.totalPages === 25,
            arquivo + ': o folheador conserva as 25 paginas da frente -- com 1 pagina '
            + 'o rodape vira "Pagina 1 / 1" e as setas param de andar',
            { esperado: 25, encontrado: vs && vs.totalPages, pedidos: r.pedidos });

        const pediuOVerso = r.pedidos.some(p => p.pdfUrl === VERSO);
        ok(!pediuOVerso,
            arquivo + ': a face `back` nao manda o verso para o visualizador paginado '
            + '-- na pagina do cliente o verso tem imagem propria',
            r.pedidos);
    }

    // A guarda tem de estar escrita, e nao so dar certo por acaso na ordem das
    // chamadas: quem inverter a ordem das duas faces amanha nao pode reabrir o
    // defeito em silencio.
    for (const arquivo of COPIAS_A_TESTAR.concat(['frontend/script.js'])) {
        const src = fs.readFileSync(path.join(RAIZ, arquivo), 'utf8');
        ok(/face === 'back' && \w*[Ii]tem\w*\.verso/.test(src),
            arquivo + ": sumiu a guarda que impede a face `back` de tomar o "
            + "visualizador paginado da frente");
    }

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do folheador do cliente passaram.');
})();
