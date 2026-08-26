// A coluna Preview da Lista de Numeracoes (24/08/2026): a miniatura entre Nome
// e Tipo, que sai de producao_numeracoes.preview_jpg e amplia no clique.
//
// Nada aqui e copia da regra: renderNumeracoes e recortada do script.js e
// executada contra um DOM de mentira.
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

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

// ─── O DOM de mentira ────────────────────────────────────────────────────────
//
// renderNumeracoes le os tres filtros e escreve no #catalogo-container. So isso.

function desenhar(state, filtros) {
    filtros = filtros || {};
    const container = { innerHTML: '' };
    const vazio = { style: { display: '' } };
    const document = {
        getElementById(id) {
            if (id === 'catalogo-container') return container;
            if (id === 'empty-catalogo') return vazio;
            if (id === 'catalogo-search') return { value: filtros.busca || '' };
            if (id === 'catalogo-filter-format') return { value: filtros.formato || '' };
            if (id === 'catalogo-filter-type') return { value: filtros.tipo || '' };
            if (id === 'catalogo-mostrar-exclusivas') return { checked: !!filtros.mostrarExclusivas };
            return null;
        },
    };
    const fonte = [recortar('escapeHtml'), recortar('escapeJsAttr'),
                   recortar('numeracaoEhCompartilhadaDoCliente'),
                   recortar('renderNumeracoes')].join('\n');
    new Function('state', 'document', fonte + '\nrenderNumeracoes();')(state, document);
    return { html: container.innerHTML, vazio: vazio.style.display };
}

const FORMATOS = [
    // Comprido e baixo: e nele que travar so a altura estragava a proporcao.
    { id: 'f-band', name: 'Triband', width_mm: 245, height_mm: 20 },
    // Em pe: a miniatura tem de ficar estreita, nao esticada.
    { id: 'f-cred', name: 'Credencial', width_mm: 105, height_mm: 148 },
];

function numeracao(extra) {
    return Object.assign({
        id: 'n-1', name: 'Numeracao de teste', tipo: 'SEQUENCIAL',
        formato_id: 'f-band', formato_ids: ['f-band'], elements: [{ type: 'TEXT' }],
    }, extra);
}

// ─── 1. Onde a coluna fica ───────────────────────────────────────────────────

(function aColunaFicaEntreNomeELTipo() {
    const r = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ preview_jpg: 'https://x/p.jpg' })] });
    const cab = (r.html.match(/<tr><th>[\s\S]*?<\/tr>/) || [''])[0];
    const iNome = cab.indexOf('Nome');
    const iPrev = cab.indexOf('Preview');
    const iTipo = cab.indexOf('Tipo');
    ok(iNome >= 0 && iPrev > iNome, 'a coluna Preview vem depois de Nome', cab);
    ok(iTipo > iPrev, 'e antes de Tipo', cab);
})();

// ─── 2. As duas formas do preview_jpg ────────────────────────────────────────
//
// A coluna guarda uma URL publica do Storage, mas volta a ser data URL base64
// quando o upload falha. As duas tem de desenhar a miniatura: filtrar por
// startsWith('http') apagaria a segunda.

(function asDuasFormasDesenham() {
    const url = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ preview_jpg: 'https://sb/artes/p.jpg' })] });
    ok(url.html.indexOf('<img src="https://sb/artes/p.jpg"') > 0, 'a URL do Storage vira miniatura');

    const b64 = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ preview_jpg: 'data:image/jpeg;base64,AAA' })] });
    ok(b64.html.indexOf('src="data:image/jpeg;base64,AAA"') > 0,
        'o base64 tambem — nao ha filtro por startsWith(http)');
})();

// ─── 3. Sem preview, e com preview quebrado ──────────────────────────────────

(function semPreviewSaiUmaMarca() {
    const r = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ preview_jpg: '' })] });
    ok(r.html.indexOf('<img') < 0, 'sem preview_jpg nao sai <img>');
    ok(r.html.indexOf('🖼️') > 0, 'sai a marca no lugar', r.html.slice(0, 120));
})();

(function miniaturaQuebradaViraMarca() {
    const r = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ preview_jpg: 'https://sb/sumiu.jpg' })] });
    ok(/onerror="previewDaNumeracaoFalhou\(this\)"/.test(r.html),
        'a miniatura que nao carrega chama previewDaNumeracaoFalhou');
    ok(/\nfunction previewDaNumeracaoFalhou\(/.test(SCRIPT),
        'e essa funcao existe no proprio script.js');
})();

// ─── 4. A caixa tem a forma do papel ─────────────────────────────────────────
//
// A escala e min(200/larg, 60/alt), e as DUAS medidas saem dela. Travar so a
// altura deixava um bracelete de 245x20 mm como uma tira fina no meio de um
// retangulo branco alto.

function caixaDe(formatoId) {
    const r = desenhar({
        formatos: FORMATOS,
        numeracoes: [numeracao({ formato_id: formatoId, formato_ids: [formatoId],
                                 preview_jpg: 'https://sb/p.jpg' })],
    });
    const m = r.html.match(/width:(\d+)px;height:(\d+)px;object-fit:contain/);
    return m ? { larg: +m[1], alt: +m[2] } : null;
}

(function aCaixaSegueAProporcaoDoFormato() {
    const band = caixaDe('f-band');
    ok(band && band.larg === 200 && band.alt === 16,
        'o formato comprido cabe pela largura (245×20 → 200×16)', JSON.stringify(band));

    const cred = caixaDe('f-cred');
    ok(cred && cred.larg === 43 && cred.alt === 60,
        'o formato em pe cabe pela altura (105×148 → 43×60)', JSON.stringify(cred));

    const rBand = 245 / 20, rCred = 105 / 148;
    ok(Math.abs(band.larg / band.alt - rBand) / rBand < 0.05, 'e a proporcao do comprido se mantem');
    ok(Math.abs(cred.larg / cred.alt - rCred) / rCred < 0.05, 'e a do em pe tambem');
})();

// ─── 5. O clique amplia — e quem amplia existe ───────────────────────────────
//
// A prevía do Painel de Producao chamava openClienteLightbox, que so existe no
// cliente.js: o index.html nao o carrega, e o clique nao fazia nada. Nao basta
// haver um onclick; a funcao chamada tem de morar no script.js.

(function oCliqueAmplia() {
    const r = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({ id: 'abc-123', preview_jpg: 'https://sb/p.jpg' })] });
    const chamada = (r.html.match(/onclick="([A-Za-z0-9_$]+)\('([^']*)'\)"/) || []);
    ok(chamada[1] === 'ampliarPreviewNumeracao', 'a miniatura tem um clique que amplia', chamada[1]);
    ok(chamada[2] === 'abc-123', 'e ele recebe o id da numeracao, nao a URL', chamada[2]);
    ok(/\nfunction ampliarPreviewNumeracao\(/.test(SCRIPT), 'a funcao mora no proprio script.js');
    ok(/\nfunction abrirLightboxImagem\(/.test(SCRIPT), 'e o lightbox dela tambem');

    ok(r.html.indexOf('loading="lazy"') > 0,
        'as miniaturas sao lazy — sao dezenas de numeracoes por lista');
})();

// ─── 6. O que ja existia continua ────────────────────────────────────────────

(function aColunaNovaNaoQuebrouAsOutras() {
    const r = desenhar({
        formatos: FORMATOS,
        numeracoes: [numeracao({ name: 'Mobi Ticket', tipo: 'TICKET',
                                 preview_jpg: 'https://sb/p.jpg',
                                 elements: [{ type: 'TEXT' }, { type: 'QR_IDEAL' }] })],
    });
    ok(r.html.indexOf('<strong>Mobi Ticket</strong>') > 0, 'o nome continua na primeira coluna');
    ok(r.html.indexOf('>TICKET<') > 0, 'o tipo continua saindo');
    ok(r.html.indexOf('(2 itens)') > 0, 'a contagem de elementos continua');
    ok(r.html.indexOf('editNumeracao') > 0 && r.html.indexOf('deleteNumeracao') > 0
        && r.html.indexOf('duplicateCatalogNumeracao') > 0, 'e as tres acoes continuam');

    // Uma linha tem exatamente cinco celulas.
    const linha = (r.html.match(/<tr>\s*<td>[\s\S]*?<\/tr>/) || [''])[0];
    ok((linha.match(/<td/g) || []).length === 5, 'a linha passou a ter cinco celulas',
        (linha.match(/<td/g) || []).length);
})();

// ─── 7. As armadilhas velhas da tela continuam de pe ─────────────────────────

(function numeracaoDeClienteContinuaEscondida() {
    const r = desenhar({
        formatos: FORMATOS,
        numeracoes: [numeracao({ id: 'n-cli', name: 'Do cliente', Cli_Num: '4321',
                                 preview_jpg: 'https://sb/p.jpg' })],
    });
    ok(r.html === '', 'numeracao com Cli_Num nao aparece com a busca vazia');
    ok(r.vazio === 'block', 'e a tela mostra o estado vazio');

    const achada = desenhar({
        formatos: FORMATOS,
        numeracoes: [numeracao({ id: 'n-cli', name: 'Do cliente', Cli_Num: '4321',
                                 preview_jpg: 'https://sb/p.jpg' })],
    }, { busca: '4321' });
    ok(achada.html.indexOf('Do cliente') > 0, 'e aparece ao digitar o numero do cliente');
    ok(achada.html.indexOf('<img') > 0, 'com miniatura, como qualquer outra');
})();

// ─── 6. A caixa "Mostrar exclusivas de cliente" (26/08/2026) ────────────────
//
// Sem ver o registro nao ha como renomea-lo, e renomear e o que decide se a
// numeracao e de um modelo so ou do cliente inteiro.

(function aCaixaRevelaAsExclusivasEOSeloDizDeQuemEla() {
    const numeracoes = [
        numeracao({ id: 'n-geral', name: 'Geral' }),
        // Nome ainda igual ao os_item_id: exclusiva daquele modelo.
        numeracao({ id: 'n-mod', name: 'it-99', Cli_Num: '4321', is_custom: true, os_item_id: 'it-99' }),
        // Renomeada: do cliente, compartilhada entre os modelos dele.
        numeracao({ id: 'n-comp', name: 'Camarote VIP', Cli_Num: '4321', is_custom: true, os_item_id: 'it-99' }),
    ];
    const ordens = [{ id: 'os-1', id_cliente: '4321', cliente: 'Festa Boa' }];

    const fechada = desenhar({ formatos: FORMATOS, numeracoes: numeracoes, ordens: ordens });
    ok(fechada.html.indexOf('Camarote VIP') < 0 && fechada.html.indexOf('it-99') < 0,
        'caixa desmarcada: a lista continua exatamente a de sempre');
    ok(fechada.html.indexOf('Geral') > 0, 'e as genericas seguem la');

    const aberta = desenhar({ formatos: FORMATOS, numeracoes: numeracoes, ordens: ordens },
        { mostrarExclusivas: true });
    ok(aberta.html.indexOf('Camarote VIP') > 0 && aberta.html.indexOf('it-99') > 0,
        'caixa marcada: as exclusivas aparecem');
    ok(aberta.html.indexOf('Festa Boa') > 0,
        'com o nome do cliente no selo, tirado dos pedidos em memoria');
    ok(/só deste modelo/.test(aberta.html), 'a que ainda se chama pelo id do modelo e so dele');
    ok(/compartilhada/.test(aberta.html), 'a renomeada e do cliente inteiro');

    const semPedidos = desenhar({ formatos: FORMATOS, numeracoes: numeracoes, ordens: [] },
        { mostrarExclusivas: true });
    ok(semPedidos.html.indexOf('cliente 4321') > 0,
        'sem o pedido carregado o selo mostra o numero, que e o que se digita na busca');
})();

(function todaLinhaOfereceRenomear() {
    const r = desenhar({ formatos: FORMATOS, numeracoes: [numeracao({})] });
    ok(/onclick="renomearNumeracao\('n-1'\)"/.test(r.html),
        'o 🏷️ da linha renomeia sem criar numeracao nova');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
