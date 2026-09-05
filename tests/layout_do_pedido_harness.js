// O layout do pedido aberto na Lista de Arte (05/09/2026, redesenho aprovado
// pelo usuario): os botoes do topo em grupos, o card do modelo compactado e o
// briefing legivel. Nenhuma funcao mudou — este harness trava justamente isso:
// todos os botoes continuam la, com os mesmos ids e as mesmas chamadas, so que
// em outro lugar. E trava a regra nova da previa: a orientacao das faces vem do
// FORMATO do modelo (janela vertical = frente e verso lado a lado).
//
// Roda em node, sem navegador: `node tests/layout_do_pedido_harness.js`.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let falhas = 0, total = 0;
function ok(cond, msg, extra) {
    total++;
    if (!cond) { falhas++; console.error('FALHOU: ' + msg, extra === undefined ? '' : extra); }
}
function extrairFuncao(src, nome) {
    let i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) i = src.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei ' + nome);
    return src.slice(i, src.indexOf('\n}', i) + 2);
}

// ─── 1. O cabecalho do pedido: os mesmos botoes, agora em grupos ─────────────
(function oCabecalhoTemTodosOsBotoes() {
    const i = HTML.indexOf('<div id="amostras-os-banner"');
    const banner = HTML.slice(i, HTML.indexOf('<!-- Container dinâmico dos cards de itens do pedido -->', i));
    ok(banner.length > 0, 'o cabecalho do pedido aberto existe');

    // Os onze botoes de sempre — pelo que eles CHAMAM, nao pelo texto.
    const chamadas = [
        'gerarLinkClienteBanner()', 'exportarPdfGabarito()', 'exportarPdfSomenteArte()',
        "document.getElementById('import-pdf-arte-input').click()", 'exportarPdfModelos()',
        'voltarParaAtendimento()', 'voltarParaArte()', 'toggleBoxEntregaDados()',
        'abrirConferenciaDeDados()', 'clearAmostrasOS()',
    ];
    for (const c of chamadas) ok(banner.indexOf('onclick="' + c + '"') > 0, 'o botao que chama ' + c + ' continua no cabecalho');
    ok(banner.indexOf('id="import-pdf-arte-input"') > 0 && banner.indexOf('onchange="importarPdfMultipage(event)"') > 0,
        'a entrada de arquivo do Importar PDF continua junto do botao');
    ok(banner.indexOf('id="amostras-acoes-em-lote"') > 0, 'o lugar das acoes em lote continua');

    // Os grupos com rotulo: Arquivos, Pedido, Devolver — e o lote e um grupo tambem.
    for (const r of ['Arquivos', 'Pedido', 'Devolver']) {
        ok(new RegExp('<span class="banner-grupo-rotulo">' + r + '</span>').test(banner), 'existe o grupo ' + r);
    }
    ok(/id="amostras-acoes-em-lote" class="banner-grupo"/.test(banner), 'as acoes em lote sao um grupo como os outros');
    const lote = extrairFuncao(SCRIPT, 'renderAcoesEmLoteDoPedido');
    ok(lote.indexOf('<span class="banner-grupo-rotulo">Todos os modelos:</span>') > 0, 'e o rotulo delas veste a mesma classe');

    // Quem sai da tela fica a direita, na linha do titulo: enviar ao cliente e fechar.
    const linha1 = banner.slice(0, banner.indexOf('<div class="banner-linha">'));
    ok(linha1.indexOf('id="amostras-os-numero"') > 0 && linha1.indexOf('id="amostras-os-cliente"') > 0
        && linha1.indexOf('id="amostras-os-itens-count"') > 0, 'numero, cliente e contagem de modelos ficam na primeira linha');
    ok(linha1.indexOf('gerarLinkClienteBanner()') > 0 && linha1.indexOf('clearAmostrasOS()') > 0,
        'enviar link e fechar pedido ficam na primeira linha, a direita');

    // O CSS dos grupos existe, e o parser nao morreu antes dele.
    ok(CSS.indexOf('.banner-grupo {') > 0 && CSS.indexOf('.banner-grupo-rotulo {') > 0, 'as classes dos grupos estao no style.css');
})();

// ─── 2. O card do modelo: a ordem das partes ─────────────────────────────────
(function oCardDoModelo() {
    const i = SCRIPT.indexOf('function renderAmostrasOSItens(');
    const card = SCRIPT.slice(SCRIPT.indexOf('<div class="card" style="border: 1px solid #918f8c;', i),
                              SCRIPT.indexOf("    }).join('');", i));

    // Cor e Numeracao numa linha; a arte na linha seguinte, com o rotulo da face
    // acima dos icones; a previa; e a decisao por ULTIMO — depois de ver a arte.
    const iCor = card.indexOf('id="amostra-item-config-cor-${idx}"');
    const iNum = card.indexOf('id="amostra-item-config-num-${idx}"');
    const iFrente = card.indexOf('>Frente</label>');
    const iVerso = card.indexOf('>Verso</label>');
    const iCsv = card.indexOf('id="linha-csv-${idx}"');
    const iPrevia = card.indexOf('class="amostra-preview-container"');
    const iDecisao = card.indexOf('class="amostra-decisao-panel"');
    const iObs = card.indexOf('id="amostra-obs-${item.id}"');
    ok(iCor > 0 && iNum > iCor && iFrente > iNum && iVerso > iFrente && iCsv > iVerso && iPrevia > iCsv && iDecisao > iPrevia && iObs > iDecisao,
        'a ordem e: Cor, Numeracao, Arte (Frente | Verso), banco, previa, decisao',
        { iCor, iNum, iFrente, iVerso, iCsv, iPrevia, iDecisao, iObs });

    // O ID do modelo mora no cabecalho do card, ao lado do produto.
    const cabecalho = card.slice(card.indexOf('class="card-header"'), card.indexOf('</div>', card.indexOf('${statusBadge}')));
    ok(cabecalho.indexOf('ID: ${item.id}') > 0, 'o chip do ID esta no cabecalho do card');

    // Os selos FRENTE/VERSO de 60px sairam; o rotulo da face esta acima dos icones.
    ok(!/width: 60px; height: 4\dpx[^>]*>FRENTE</.test(card) && !/width: 60px; height: 4\dpx[^>]*>VERSO</.test(card),
        'os selos largos FRENTE/VERSO ao lado dos icones sairam');

    // O modo PDF: "PDF" em vermelho no centro do icone (pedido do usuario).
    const pdf = card.match(/id="btn-modo-pdf-\$\{idx\}"[^\n]*/g) || [];
    ok(pdf.length === 2, 'os dois botoes do modo PDF continuam (com e sem verso)', pdf.length);
    ok(pdf.every(b => /<text[^>]*fill="#ef4444"[^>]*>PDF<\/text>/.test(b)), 'e os dois escrevem PDF em vermelho no centro');

    // A decisao: anotacao a esquerda, botoes empilhados a direita — todos os tres.
    const decisao = card.slice(iDecisao);
    ok(/grid-template-columns: minmax\(0, 1fr\) \d+px/.test(decisao), 'a decisao e uma grade de duas colunas');
    ok(/amostra-decisao-btns" style="flex-direction: column/.test(decisao), 'os botoes ficam em coluna');
    for (const t of ['🎨 MARCAR PRONTO', '✅ APROVADO', '❌ EM ALTERAÇÃO']) ok(decisao.indexOf(t) > 0, 'o botao ' + t + ' continua');
    ok(decisao.indexOf("decisionAmostraItem('${item.id}', '${osId}', 'PRONTO')") > 0
        && decisao.indexOf("decisionAmostraItem('${item.id}', '${osId}', 'REPROVADA')") > 0,
        'e chamam a mesma decisao de sempre');
    // As faixas de aviso vem ANTES da anotacao, para serem vistas antes do botao.
    ok(decisao.indexOf('${faixaCorrigirArte}') < decisao.indexOf('id="amostra-obs-${item.id}"'), 'as faixas de aviso ficam acima da anotacao');
})();

// ─── 3. A orientacao da previa vem do FORMATO ────────────────────────────────
(function aOrientacaoVemDoFormato() {
    const i = SCRIPT.indexOf('function renderAmostrasOSItens(');
    const render = SCRIPT.slice(i, SCRIPT.indexOf("    }).join('');", i));
    ok(/const janelaVertical = !!\(formatoDoItem\s*&& parseFloat\(formatoDoItem\.height_mm\) > parseFloat\(formatoDoItem\.width_mm\)\)/.test(render),
        'janela vertical = formato mais alto que largo, lido do proprio formato');
    ok(render.indexOf('blocoDeArteDoModelo(item, idx, osId, escalaArteHtml, janelaVertical)') > 0,
        'e a previa recebe essa decisao');

    const bloco = new Function('item', 'idx', 'osId', 'escalaArteHtml', 'ladoALado',
        extrairFuncao(SCRIPT, 'blocoDeArteDoModelo')
        + '\nreturn blocoDeArteDoModelo(item, idx, osId, escalaArteHtml, ladoALado);');
    const comVerso = { verso: true, verso_tipo: 'FxVerso', modo_pdf: false };
    const vertical = bloco(comVerso, 0, 'os-1', '', true);
    const horizontal = bloco(comVerso, 0, 'os-1', '', false);
    ok(/grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(vertical), 'janela vertical: frente e verso lado a lado');
    ok(!/grid-template-columns/.test(horizontal), 'janela horizontal: uma face abaixo da outra');
    ok(/flex-direction: column/.test(horizontal), 'e a pilha continua uma coluna');
    for (const h of [vertical, horizontal]) {
        ok(h.includes('id="amostra-item-canvas-0"') && h.includes('id="amostra-item-canvas-verso-0"'), 'as duas faces estao la nos dois casos');
        ok(h.includes('id="amostra-csv-nav-0"'), 'a navegacao das linhas continua');
    }
    // Sem o quinto argumento (quem chama de fora), e a pilha de sempre.
    const semArg = new Function('item', 'idx', 'osId', 'escalaArteHtml',
        extrairFuncao(SCRIPT, 'blocoDeArteDoModelo') + '\nreturn blocoDeArteDoModelo(item, idx, osId, escalaArteHtml);')(comVerso, 0, 'os-1', '');
    ok(!/grid-template-columns/.test(semArg), 'sem dizer a orientacao, a previa empilha');
})();

// ─── 4. As barras de linhas e de escala ficaram finas ────────────────────────
(function asBarrasFinas() {
    const bloco = extrairFuncao(SCRIPT, 'blocoDeArteDoModelo');
    ok(!/amostra-csv-nav-\$\{idx\}" style="display:none; flex-direction:column/.test(bloco), 'a navegacao das linhas nao e mais uma coluna');
    const i = SCRIPT.indexOf('id="amostra-escala-${idx}"');
    const escala = SCRIPT.slice(SCRIPT.lastIndexOf('<div', i), SCRIPT.indexOf('</div>`;', i));
    ok(escala.indexOf('title="Vale para a impressão e a imposição.') > 0, 'o texto de ajuda da escala virou dica ao passar o mouse');
    ok(!/<span[^>]*>Vale para a impressão/.test(escala), 'e nao ocupa mais uma linha inteira');
    ok(escala.indexOf('id="amostra-escala-h-${idx}"') > 0 && escala.indexOf('id="amostra-escala-v-${idx}"') > 0
        && escala.indexOf('zerarEscalaDaArte(') > 0, 'os campos H, V e o 100% continuam');
})();

// ─── 5. O briefing: cada produto e um bloco proprio, legivel ─────────────────
(function oBriefing() {
    const i = SCRIPT.indexOf('let obsAccordionHtml = uniqueProducts.map((prod) => {');
    const obs = SCRIPT.slice(i, SCRIPT.indexOf("}).join('');", i));
    ok(obs.indexOf('id="briefing-obs-item-${prod.id}"') > 0 && obs.indexOf("saveBriefingField('${osNum}', null, this.value, true, '${prod.id}')") > 0,
        'a observacao por produto continua gravando no mesmo lugar');
    ok(/font-family: inherit; font-size: 0\.95rem; line-height: 1\.55/.test(obs), 'o texto da observacao sai na fonte da tela, maior e com entrelinha');
    ok(obs.indexOf('${prod.quantidade || 0} un.</span>') > 0 && obs.indexOf('> ${prod.nome}</span>') > 0,
        'o nome do produto e a quantidade sao coisas separadas no cabecalho do bloco');
    ok(obs.indexOf('Ref: ${prod.quantidade') < 0, 'a linha cinza "Ref: N un. - produto" saiu');

    const j = SCRIPT.indexOf('id="briefing-nome-${osId}"');
    const campos = SCRIPT.slice(SCRIPT.lastIndexOf('<div class="card-header"', j), SCRIPT.indexOf('${obsAccordionHtml}', j));
    ok(campos.indexOf('Briefing Base do Evento') > 0 && campos.indexOf('Preenchido pelo comercial') > 0, 'o titulo e o subtitulo curto');
    for (const id of ['briefing-nome-${osId}', 'briefing-data-${osId}', 'briefing-local-${osId}']) {
        ok(campos.indexOf('id="' + id + '"') > 0, 'o campo ' + id + ' continua');
    }
    ok((campos.match(/color: #fbbf24/g) || []).length === 3, 'nome, data e local saem no amarelo claro');
    ok(campos.indexOf("${uniqueProducts.length} ${uniqueProducts.length === 1 ? 'produto' : 'produtos'}") > 0, 'o titulo das observacoes conta os produtos');
})();

if (falhas) { console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.'); process.exit(1); }
console.log('OK: ' + total + ' verificacoes do layout do pedido aberto passaram.');
