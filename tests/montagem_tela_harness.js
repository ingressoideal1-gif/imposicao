// A TELA DA MONTAGEM, DESENHADA NUM CHROME DE VERDADE.
//
// O harness do núcleo (montagem_harness.js) cobra a tradução das posições, que
// é onde mora a correção. Este cobra o que só aparece DESENHANDO: se a folha,
// a lista, o selo e a trava saem, se cabem na tela, se o estado vazio explica
// a tela para quem chega com uma folha estragada na mão — e, desde o redesenho
// de 03/09/2026, se a folha é uma FOLHA (a grade real do formato, na proporção
// real) e se os gestos do kanban fazem o que dizem.
//
// Usa a view DE VERDADE, recortada do index.html, o style.css de verdade e as
// funções de verdade do montagem.js. Nada sai desta máquina.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
const MTG = fs.readFileSync(path.join(RAIZ, 'frontend', 'montagem.js'), 'utf8');

const FOTO = process.argv[2] || null;

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortarView() {
    const i = HTML.indexOf('<section id="view-montagem"');
    if (i < 0) throw new Error('nao achei a view da Montagem no index.html');
    const f = HTML.indexOf('<section id="view-impressoras"', i);
    return HTML.slice(i, f);
}

function extrair(nome) {
    let i = MTG.indexOf('\nfunction ' + nome + '(');
    if (i < 0) i = MTG.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = MTG.indexOf('\n}', i);
    return MTG.slice(i, fim + 2);
}

function extrairConst(nome) {
    const i = MTG.indexOf('\nconst ' + nome + ' ');
    if (i < 0) throw new Error('nao achei a constante ' + nome);
    const fim = MTG.indexOf(';\n', i);
    return MTG.slice(i, fim + 2);
}

const CONSTANTES = ['MTG_POSICOES_DO_NUMERO', 'MTG_ROTACOES_DO_NUMERO',
                    'MTG_TAMANHO_MIN', 'MTG_TAMANHO_MAX', 'MTG_HISTORIA_MAX', '_MTG_TONS',
                    'MTG_ELEMENTOS_SEM_DADO', 'MTG_MAX_CELULAS_DISTRIBUIDAS'];

const FUNCOES = [
    'montagemVazia', 'numeroPadraoDaMontagem', 'posicoesDaMontagem', 'totalDeItensDoModelo',
    'porQueNaoCabeNaMontagem', 'chaveDoModelo', 'modeloDaMontagem', 'celulasDoModelo',
    'modelosComCelula', 'posicoesCombinadas', 'totalDeCelulasDaMontagem', 'contaDaMontagem',
    'lugarDaCelulaNaFolha', 'geometriaDaFolha', 'escalaDaFolhaDaMontagem',
    'duplicarCelula', 'tirarCelula', 'moverCelula', 'completarAFolha', 'ordenarCelulas',
    'celulasForaDaTiragem', 'modoDaFolhaDaMontagem', 'numeroDaMontagemSaneado',
    'textoDoNumeroDoModelo', 'formatoDoItem', 'saidaIdDoItem', 'pecaDaMontagem',
    // O historico (03/09/2026).
    'guardarNaHistoria', '_mtgAplicar', '_mtgInstantaneoAtual', 'desfazerMontagem', 'refazerMontagem',
    // A tela.
    '_mtgCelulasPorFolha', '_mtgSaidaDaFolha', '_mtgNumeroDoPedido', '_mtgLinhaAtiva',
    '_mtgHtmlDaRecusa', '_mtgAlvosDoGesto', '_mtgIndiceDoModelo',
    '_mtgEspacoDoNumero', '_mtgEstiloDoNumero',
    '_mtgRenderNumero', '_mtgRenderFolha', 'renderMontagem', 'limparMontagem',
    'removerDaMontagem', 'retomarDaMontagem', 'onMontagemModeloChange',
    'duplicarCelulaDaMontagem', 'removerCelulaDaMontagem', 'moverCelulaDaMontagem',
    'selecionarCelulaDaMontagem', 'completarAFolhaDaMontagem', 'ordenarMontagem',
    'zoomDaMontagem', 'alternarNumeroDaMontagem', 'mudarNumeroDaMontagem',
    // O aproveitamento da folha (03/09/2026).
    'elementoDaNumeracaoVaria', 'numeracaoTemDadoVariavel', 'sugestaoDeAproveitamento',
    'celulasDaFolhaUnica', 'celulasDistribuidas', 'modoSugeridoDaMontagem',
    '_mtgSugestaoAtual', 'aplicarSugestaoDaMontagem', '_mtgRenderSugestao',
    '_mtgLigarArrasto', 'imprimirNumeroNaMontagem',
    // A saida.
    'pastaDaMontagem', 'abrirNaTelaDaMontagem', 'nomeDoArquivoDaMontagem',
    '_mtgDicaDoDestino', 'onMontagemPastaChange', 'encherPastasDaMontagem',
    'gravarPdfNaEstacao', 'baixarPdfDaMontagem', 'abrirPdfDaMontagemNaTela',
    'payloadDaMontagem', 'gerarPdfDaMontagem',
];

// Três pedidos, quatro modelos, todos do mesmo formato/cor/saída/face.
// O formato é o Triband: 1 coluna × 10 linhas, 245 × 20 mm, numa SRA3.
const PECAS = [
    { id: '1000565', osId: 'a', pedido: '21202', nome: '05/set CAMAROTE PRESIDENTE',   qtd: 3000, pos: [1, 6, 22] },
    { id: '1000589', osId: 'a', pedido: '21202', nome: '11/set CAMAROTE PATROCINADORES', qtd: 1920, pos: [340, 341, 342, 343] },
    { id: '1000412', osId: 'b', pedido: '21188', nome: 'STAFF PALCO',                  qtd: 150,  pos: [7, 12, 88] },
    { id: '1000203', osId: 'c', pedido: '20990', nome: 'PULSEIRA CAMAROTE OURO',       qtd: 800,  pos: [3, 4, 5, 6] },
];

(async () => {
    // ── 1. O que se lê no ARQUIVO ───────────────────────────────────────────
    ok(/id="view-montagem"/.test(HTML), 'a view da Montagem existe no index.html');
    ok(/id="nav-montagem"/.test(HTML), 'e o botão do menu também');
    ok(/montagem\.js\?v=/.test(HTML), 'e o script entra na página com carimbo de versão');

    const iPedido = HTML.indexOf('id="nav-pedido"');
    const iMtg = HTML.indexOf('id="nav-montagem"');
    ok(iPedido > 0 && iMtg > iPedido,
       'a Montagem vem DEPOIS do Pedido no menu — ela recolhe o que sobrou dele');

    ok(!/imposicao\.onrender\.com|MOTOR_NUVEM/.test(MTG),
       'a Montagem não tem caminho para a nuvem: impressão só acontece pela estação');
    ok(/localhost:8080|127\.0\.0\.1:9000/.test(MTG), 'ela procura a estação nesta máquina');

    const navegador = await puppeteer.launch({
        headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const aba = await navegador.newPage();
    await aba.setViewport({ width: 1600, height: 1050, deviceScaleFactor: FOTO ? 2 : 1 });

    await aba.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>`
        // O badge do menu mora fora da view (na barra lateral); entra aqui como
        // um elemento so', para a contagem de celulas dele ser cobrada tambem.
        + `<body><span id="badge-montagem" style="display:none;">0</span>`
        + `<div class="main-content" style="padding:24px;">${recortarView()}</div></body></html>`,
        { waitUntil: 'load' });

    await aba.evaluate(() => {
        const v = document.getElementById('view-montagem');
        if (v) { v.style.display = 'block'; v.classList.add('active'); }
    });

    // CONCATENAÇÃO, e não template literal: as funções extraídas do montagem.js
    // trazem `${...}` dentro dos próprios templates (o HTML da folha, o da
    // recusa), e num template literal do harness eles seriam interpolados AQUI,
    // com as variáveis erradas — ou, como já aconteceu, num erro de sintaxe
    // dentro do Chrome, longe da causa.
    const PRELUDIO = [
        "const state = {",
        // O catalogo com as MEDIDAS: e' delas que a folha sai na proporcao real.
        "  formatos: [{ id: 'F1', id_formato_num: 77, nome: 'Triband 245x20 mm',",
        "               cols: 1, rows: 10, width_mm: 245, height_mm: 20,",
        "               gap_h_mm: 0, gap_v_mm: 2,",
        "               default_saida_id: 'S1', default_rotate_page: true },",
        "             { id: 'F2', id_formato_num: 88, nome: 'PVC credencial',",
        "               cols: 2, rows: 2, width_mm: 86, height_mm: 54,",
        "               gap_h_mm: 4, gap_v_mm: 4, default_saida_id: 'S1' }],",
        "  produtosGlobais: [{ id_produto: 501, id_formato: 77 },",
        "                    { id_produto: 502, id_formato: 88 }],",
        "  saidas: [{ id: 'S1', nome: 'SRA3', width_mm: 320, height_mm: 450 }],",
        "  numeracoes: [], osItens: {}, ordens: [],",
        "};",
        "function escapeHtml(s) {",
        "  return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {",
        "    return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; });",
        "}",
        "function fatiaCsvDoItem(i, n) { return n.csv_data; }",
        "function resolverNumeracaoParaModelo(n) { return n; }",
        "function numeracaoIdDoItem(i) { return i.amostra_num_id; }",
        "function numeroDoPedidoDoItem(osId) { return ({ a: '21202', b: '21188', c: '20990' })[osId] || null; }",
        "function modoDeVersoDoModelo(it) { return (it && it.verso_tipo && it.verso_tipo !== 'Frente') ? 'duplex' : 'front'; }",
        "function rotacaoDaFolhaDoFormato(f) { return f && f.default_rotate_page ? 90 : 0; }",
        "function _mtgNumeracaoDoItem() { return null; }",
        "function onMontagemPosicoesChange() {}",
        "function toast(m, t) { (window.__toasts = window.__toasts || []).push((t||'info') + ': ' + m); }",
        "window.__confirmou = []; window.__confirmarResposta = true;",
        "async function confirmarPopup(o) { window.__confirmou.push(o); return window.__confirmarResposta; }",
        // O de verdade consulta o banco (loadOSItens). Aqui ele so' faz o que a
        // tela ve': guarda o pedido escolhido e enche o seletor de modelos.
        "async function onMontagemPedidoChange() {",
        "  const sel = document.getElementById('mtg-pedido');",
        "  state.montagem.pedidoSel = sel && sel.value ? sel.value : null;",
        "  state.montagem.modeloSel = null;",
        "  const selMod = document.getElementById('mtg-modelo');",
        "  const ids = (window.__itensPorPedido || {})[state.montagem.pedidoSel] || [];",
        "  selMod.innerHTML = '<option value=\"\"></option>' + ids.map(function (id) {",
        "    return '<option value=\"' + id + '\">' + id + '</option>'; }).join('');",
        "  selMod.disabled = ids.length === 0;",
        "  renderMontagem();",
        "}",
    ].join('\n');

    const POSLUDIO = [
        "state.montagem = montagemVazia();",
        "window.state = state;",
        "['renderMontagem','removerDaMontagem','limparMontagem','porQueNaoCabeNaMontagem',",
        " 'payloadDaMontagem','pecaDaMontagem','imprimirNumeroNaMontagem','posicoesCombinadas',",
        " 'duplicarCelulaDaMontagem','removerCelulaDaMontagem','moverCelulaDaMontagem',",
        " 'selecionarCelulaDaMontagem','completarAFolhaDaMontagem','ordenarMontagem',",
        " 'zoomDaMontagem','desfazerMontagem','refazerMontagem','celulasDoModelo',",
        " 'alternarNumeroDaMontagem','mudarNumeroDaMontagem','retomarDaMontagem',",
        " 'contaDaMontagem','geometriaDaFolha','textoDoNumeroDoModelo','nomeDoArquivoDaMontagem',",
        " 'aplicarSugestaoDaMontagem','sugestaoDeAproveitamento','modoSugeridoDaMontagem',",
        " 'encherPastasDaMontagem','onMontagemPastaChange','gerarPdfDaMontagem'",
        "].forEach(function (n) { window[n] = eval(n); });",
        "_mtgLigarArrasto();",
        // O ITEM como ele chega do banco: SEM formato_id. Quem resolve o
        // formato e' o `pecaDaMontagem`, pelo produto — que e' o caminho que
        // faltava e derrubou a primeira versao em producao.
        "window.__item = function (p) { return {",
        "  id: p.id, nome_modelo: p.nome, quantidade: p.qtd,",
        "  _vibe_id_produto: p.produto || 501, cor: 'Azul Celeste', verso_tipo: 'Frente',",
        "  amostra_num_id: null, arte_url: 'x.pdf', num_inicial: 1 }; };",
        "window.__itensPorPedido = { a: ['1000565', '1000589'], b: ['1000412'], c: ['1000203'] };",
        "window.__montar = function (pecas) {",
        "  state.montagem = montagemVazia();",
        "  state.montagem.modelos = pecas.map(function (p) { return {",
        "    osId: p.osId, itemId: p.id, pedidoNumero: p.pedido, nome: p.nome,",
        "    qtd: p.qtd, variavel: p.variavel === true,",
        "    peca: pecaDaMontagem(window.__item(p)) }; });",
        "  pecas.forEach(function (p) { p.pos.forEach(function (pos) {",
        "    state.montagem.celulas.push({ osId: p.osId, itemId: p.id, pos: pos }); }); });",
        "  renderMontagem();",
        "};",
        "window.__artes = function () { return state.montagem.modelos.map(function (m) {",
        "  return { qtd: m.qtd, _tiragem: m.qtd, modelo: m.itemId, pedido: m.pedidoNumero, nome: '' }; }); };",
        "window.__rotulos = function () { return Array.from(",
        "  document.querySelectorAll('#mtg-folha .mtg-celula:not(.mtg-celula-vazia) .mtg-celula-rotulo'))",
        "  .map(function (e) { return e.textContent.trim(); }); };",
        // A caixa de cada celula, em px, para conferir a GRADE desenhada.
        "window.__caixas = function () { return Array.from(document.querySelectorAll('#mtg-folha .mtg-celula'))",
        "  .map(function (e) { return { i: e.dataset.i, l: Math.round(parseFloat(e.style.left)),",
        "    t: Math.round(parseFloat(e.style.top)), w: Math.round(parseFloat(e.style.width)),",
        "    h: Math.round(parseFloat(e.style.height)), vazia: e.classList.contains('mtg-celula-vazia') }; }); };",
    ].join('\n');

    await aba.evaluate(PRELUDIO + '\n' + CONSTANTES.map(extrairConst).join('\n') + '\n'
        + FUNCOES.map(extrair).join('\n') + '\n' + POSLUDIO);

    // ── 2. O estado vazio se explica ────────────────────────────────────────
    await aba.evaluate(() => renderMontagem());
    const vazio = await aba.evaluate(() => {
        const v = document.querySelector('.mtg-vazio');
        return {
            existe: !!v,
            texto: v ? v.textContent.replace(/\s+/g, ' ').trim() : '',
            temGarantia: !!document.querySelector('.mtg-garantia'),
            travaEscondida: document.getElementById('mtg-trava').style.display === 'none',
            pdfTravado: document.getElementById('mtg-btn-pdf').disabled,
            desfazerTravado: document.getElementById('mtg-desfazer').disabled,
            completarTravado: document.getElementById('mtg-completar').disabled,
            folhaVazia: document.getElementById('mtg-folha').innerHTML.trim() === '',
        };
    });
    ok(vazio.existe, 'a tela vazia mostra o convite, e não uma tabela sem linha', vazio);
    ok(/pedidos diferentes/.test(vazio.texto),
       'e diz a coisa que a tela existe para fazer: juntar pedidos diferentes', vazio.texto.slice(0, 120));
    ok(/mesmo formato, cor, saída e face/.test(vazio.texto),
       'e diz a condição, para o operador não descobrir na recusa', vazio.texto.slice(0, 200));
    ok(vazio.temGarantia,
       'e a garantia do código igual ao original está à vista — é o que dá confiança de refazer');
    ok(vazio.travaEscondida, 'a trava do formato nasce escondida: não há folha ainda');
    ok(vazio.pdfTravado, 'e o Gerar PDF nasce travado');
    ok(vazio.desfazerTravado && vazio.completarTravado,
       'desfazer e completar nascem travados: não há o que desfazer nem o que completar', vazio);
    ok(vazio.folhaVazia, 'e a folha nasce em branco');

    // ── 3. A FOLHA É UMA FOLHA: a grade real do formato ─────────────────────
    //
    // Ate 03/09/2026 a previa empilhava as celulas verticalmente, sempre. Isso
    // so' esta' certo num formato de uma coluna. Este bloco e' o que impede a
    // tela de voltar a mentir sobre onde a peca cai no papel.
    await aba.evaluate(pecas => window.__montar(pecas), PECAS);

    const grade = await aba.evaluate(() => {
        const c = window.__caixas();
        const papel = document.querySelector('#mtg-folha .mtg-papel');
        return {
            quantas: c.length,
            cheias: c.filter(x => !x.vazia).length,
            vazias: c.filter(x => x.vazia).length,
            primeira: c[0], segunda: c[1],
            papel: papel ? { w: Math.round(papel.getBoundingClientRect().width),
                             h: Math.round(papel.getBoundingClientRect().height) } : null,
            folhas: document.querySelectorAll('#mtg-folha .mtg-papel').length,
            titulos: Array.from(document.querySelectorAll('.mtg-folha-titulo')).map(e => e.textContent.trim()),
        };
    });
    ok(grade.quantas === 20, 'catorze células mais as vagas: duas folhas de 10 desenhadas', grade.quantas);
    ok(grade.cheias === 14 && grade.vazias === 6, 'catorze cheias e seis vazias', grade);
    ok(grade.folhas === 2, 'e são dois papéis, um por folha', grade.folhas);
    ok(grade.titulos.join('|') === 'Folha 1 de 2|Folha 2 de 2', 'cada folha tem o seu título', grade.titulos);
    // Triband: 1 coluna. Todas as células na mesma coluna, descendo.
    ok(grade.primeira.l === grade.segunda.l,
       'num formato de UMA coluna as células ficam na mesma coluna', grade);
    ok(grade.segunda.t > grade.primeira.t, 'e descem', grade);
    // A proporção: 245 × 20 mm dá uma célula 12,25 vezes mais larga que alta.
    const razao = grade.primeira.w / grade.primeira.h;
    ok(Math.abs(razao - 245 / 20) < 0.8,
       'e cada célula sai na PROPORÇÃO REAL da peça (245×20 mm)', { razao, esperado: 245 / 20 });

    // A prova de que a folha não é uma pilha: o mesmo desenho num formato 2 × 2.
    const pvc = await aba.evaluate(() => {
        window.__montar([{ id: '2000', osId: 'a', pedido: '21202', nome: 'CREDENCIAL',
                           qtd: 500, pos: [1, 2, 3, 4, 5], produto: 502 }]);
        const c = window.__caixas();
        return { quantas: c.length, um: c[0], dois: c[1], tres: c[2], quatro: c[3],
                 folhas: document.querySelectorAll('#mtg-folha .mtg-papel').length,
                 razao: c[0].w / c[0].h };
    });
    ok(pvc.dois.t === pvc.um.t && pvc.dois.l > pvc.um.l,
       'PVC 2×2: a 2ª célula fica AO LADO da 1ª, e não embaixo — a pilha vertical mentia aqui', pvc);
    ok(pvc.tres.t > pvc.um.t && pvc.tres.l === pvc.um.l, 'a 3ª desce para a segunda linha', pvc);
    ok(pvc.quatro.t === pvc.tres.t && pvc.quatro.l === pvc.dois.l, 'e a 4ª fecha o quadrado', pvc);
    ok(pvc.folhas === 2, 'a 5ª célula abre a segunda folha', pvc.folhas);
    ok(Math.abs(pvc.razao - 86 / 54) < 0.15, 'e a credencial sai na proporção dela (86×54 mm)', pvc.razao);

    // ── 3b. O zoom ──────────────────────────────────────────────────────────
    const zoom = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const medir = () => {
            const p = document.querySelector('#mtg-folha .mtg-papel');
            const c = document.querySelector('#mtg-folha .mtg-celula');
            return { papelW: Math.round(p.getBoundingClientRect().width),
                     celulaH: Math.round(c.getBoundingClientRect().height),
                     semPapel: p.classList.contains('sem-papel') };
        };
        const r = { peca: medir() };
        zoomDaMontagem('folha'); r.folha = medir();
        zoomDaMontagem('100');   r.cem = medir();
        zoomDaMontagem('peca');
        r.marcado = document.getElementById('mtg-zoom-peca').classList.contains('ativo');
        r.medida = document.getElementById('mtg-folha-num').textContent;
        return r;
    }, PECAS);
    ok(zoom.peca.celulaH > zoom.folha.celulaH,
       'no modo Peça as células ficam MAIORES que no modo Folha', zoom);
    ok(zoom.peca.semPapel === true && zoom.folha.semPapel === false,
       'e no modo Peça não há papel em volta: só a área imposta, ampliada', zoom);
    ok(zoom.marcado, 'o botão do zoom escolhido fica marcado');
    ok(/320×450 mm/.test(zoom.medida), 'e o cabeçalho diz a medida da folha', zoom.medida);

    // ── 4. O KANBAN: repetir, tirar, arrastar, selecionar ───────────────────
    const kanban = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const r = {};
        document.querySelector('#mtg-folha .mtg-celula-btn:not(.mtg-celula-tirar)').click();
        r.depoisDeRepetir = window.__rotulos().slice(0, 3);
        r.chipRepetido = document.querySelector('#mtg-lista .mtg-pos').textContent.trim();
        r.chipTemClasse = document.querySelector('#mtg-lista .mtg-pos').classList.contains('repetida');
        r.badge = document.getElementById('badge-montagem').textContent;
        r.combinadas = posicoesCombinadas(state.montagem.celulas, state.montagem.modelos).slice(0, 3).join(',');
        r.marcadaRepetida = document.querySelectorAll('#mtg-folha .mtg-celula.repetida').length;
        document.querySelectorAll('#mtg-folha .mtg-celula-tirar')[1].click();
        r.depoisDeTirar = window.__rotulos().slice(0, 3);
        r.linhas = document.querySelectorAll('#mtg-lista .data-table tr').length - 1;
        const antes = state.montagem.celulas.length;
        for (let k = 0; k < 3; k++) {
            removerCelulaDaMontagem(state.montagem.celulas.findIndex(c => c.osId === 'b'));
        }
        r.tiradas = antes - state.montagem.celulas.length;
        r.linhasSemB = document.querySelectorAll('#mtg-lista .data-table tr').length - 1;
        r.modelosSemB = state.montagem.modelos.map(m => m.osId).join('');
        return r;
    }, PECAS);
    ok(kanban.depoisDeRepetir[0].indexOf('#1') >= 0 && kanban.depoisDeRepetir[1].indexOf('#1') >= 0,
       '⧉ repete a célula NA PRÓXIMA, igual', kanban.depoisDeRepetir);
    ok(kanban.chipRepetido === '#1 ×2', 'e a lista diz que a posição sai duas vezes', kanban.chipRepetido);
    ok(kanban.chipTemClasse, 'com cor própria: repetir é decisão do operador, e ele reconhece na lista');
    ok(kanban.badge === '15', 'a célula repetida conta no badge do menu', kanban.badge);
    ok(kanban.combinadas === '1,1,6', 'e vai duas vezes ao motor, com o mesmo índice', kanban.combinadas);
    ok(kanban.marcadaRepetida === 1, 'e a cópia fica marcada na folha', kanban.marcadaRepetida);
    ok(kanban.depoisDeTirar[0].indexOf('#1') >= 0 && kanban.depoisDeTirar[1].indexOf('#6') >= 0,
       '× tira SÓ aquela célula — as outras do modelo ficam', kanban.depoisDeTirar);
    ok(kanban.linhas === 4, 'e o modelo continua na lista enquanto tem célula', kanban);
    ok(kanban.tiradas === 3 && kanban.linhasSemB === 3 && kanban.modelosSemB === 'aac',
       'tirar a última célula de um modelo tira o modelo da lista — e do deslocamento', kanban);

    // A seleção múltipla: com ela, o gesto vale para todas.
    const selecao = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const r = {};
        selecionarCelulaDaMontagem(0, {});
        r.uma = state.montagem.selecao.slice();
        r.barraEscondida = document.getElementById('mtg-selecao').style.display === 'none';
        selecionarCelulaDaMontagem(3, { shiftKey: true });
        r.faixa = state.montagem.selecao.slice();
        r.barraVisivel = document.getElementById('mtg-selecao').style.display !== 'none';
        r.barraDiz = document.getElementById('mtg-selecao').textContent.replace(/\s+/g, ' ').trim();
        r.marcadas = document.querySelectorAll('#mtg-folha .mtg-celula.marcada').length;
        const antes = state.montagem.celulas.length;
        duplicarCelulaDaMontagem(0);
        r.entraram = state.montagem.celulas.length - antes;
        r.limpouSelecao = state.montagem.selecao.length === 0;
        selecionarCelulaDaMontagem(1, {});
        selecionarCelulaDaMontagem(5, { ctrlKey: true });
        r.avulsas = state.montagem.selecao.slice();
        selecionarCelulaDaMontagem(5, { ctrlKey: true });
        r.desmarcou = state.montagem.selecao.slice();
        return r;
    }, PECAS);
    ok(selecao.uma.join(',') === '0' && selecao.barraEscondida,
       'com uma célula marcada a barra não aparece: os botões dela já resolvem', selecao);
    ok(selecao.faixa.join(',') === '0,1,2,3', 'Shift pega o intervalo', selecao.faixa);
    ok(selecao.barraVisivel && /4 células selecionadas/.test(selecao.barraDiz),
       'e a barra aparece dizendo quantas', selecao.barraDiz);
    ok(selecao.marcadas === 4, 'as quatro ficam marcadas na folha', selecao.marcadas);
    ok(selecao.entraram === 4, 'e o ⧉ repete TODAS de uma vez — quatro células, quatro cópias', selecao.entraram);
    ok(selecao.limpouSelecao, 'depois do gesto a seleção se limpa');
    ok(selecao.avulsas.join(',') === '1,5', 'Ctrl marca avulsas', selecao.avulsas);
    ok(selecao.desmarcou.join(',') === '1', 'e Ctrl de novo desmarca aquela', selecao.desmarcou);

    // O arrasto, com os eventos nativos do HTML5.
    const arrasto = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const antes = window.__rotulos().slice(0, 4);
        const cels = () => document.querySelectorAll('#mtg-folha .mtg-celula[draggable="true"]');
        const disparar = (el, tipo) => el.dispatchEvent(new Event(tipo, { bubbles: true, cancelable: true }));
        disparar(cels()[0], 'dragstart');
        const marcadaNaOrigem = cels()[0].classList.contains('mtg-celula-arrastando');
        disparar(cels()[3], 'dragover');
        const marcadaNoAlvo = cels()[3].classList.contains('mtg-celula-alvo');
        disparar(cels()[3], 'drop');
        const depois = window.__rotulos().slice(0, 4);
        const combinadas = posicoesCombinadas(state.montagem.celulas, state.montagem.modelos).slice(0, 3).join(',');
        const movida = window.__rotulos()[0];
        disparar(cels()[0], 'dragstart');
        disparar(document.querySelector('#mtg-folha .mtg-celula-vazia'), 'drop');
        const ultimo = window.__rotulos().slice(-1)[0];
        const sobrou = document.querySelectorAll('.mtg-celula-arrastando, .mtg-celula-alvo').length;
        return { antes, depois, marcadaNaOrigem, marcadaNoAlvo, movida, ultimo, sobrou, combinadas };
    }, PECAS);
    ok(arrasto.marcadaNaOrigem && arrasto.marcadaNoAlvo,
       'enquanto arrasta, a origem e o alvo ficam marcados — o operador vê onde vai cair', arrasto);
    ok(arrasto.depois.join('|') === [arrasto.antes[1], arrasto.antes[2], arrasto.antes[3], arrasto.antes[0]].join('|'),
       'soltar a 1ª célula sobre a 4ª a põe em quarto lugar', arrasto);
    ok(arrasto.combinadas === '6,22,3340',
       'e a ordem nova é a que vai ao motor — cada célula com o seu índice', arrasto.combinadas);
    ok(arrasto.ultimo === arrasto.movida,
       'soltar numa célula vazia manda a célula para o fim da folha', { m: arrasto.movida, u: arrasto.ultimo });
    ok(arrasto.sobrou === 0, 'e nenhuma marca de arrasto fica na tela depois');

    // ── 5. Desfazer e refazer ──────────────────────────────────────────────
    //
    // Era a falta mais grave: um x no lugar errado apagava a celula sem volta.
    const desfazer = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const conta = () => state.montagem.celulas.length;
        const r = { inicio: conta() };
        removerCelulaDaMontagem(0);
        r.depoisDeTirar = conta();
        r.botaoLigou = !document.getElementById('mtg-desfazer').disabled;
        desfazerMontagem();
        r.depoisDeDesfazer = conta();
        r.rotulos = window.__rotulos().slice(0, 2);
        r.refazerLigou = !document.getElementById('mtg-refazer').disabled;
        refazerMontagem();
        r.depoisDeRefazer = conta();
        desfazerMontagem();
        duplicarCelulaDaMontagem(0);
        r.futuroApagado = document.getElementById('mtg-refazer').disabled;
        window.__montar(pecas);
        removerDaMontagem(1);
        const semModelo = state.montagem.modelos.length;
        desfazerMontagem();
        r.modeloVoltou = state.montagem.modelos.length === semModelo + 1;
        r.celulasVoltaram = conta();
        return r;
    }, PECAS);
    ok(desfazer.inicio === 14 && desfazer.depoisDeTirar === 13, 'tirar uma célula tira uma');
    ok(desfazer.botaoLigou, 'e o Desfazer liga');
    ok(desfazer.depoisDeDesfazer === 14, 'desfazer devolve a célula', desfazer);
    ok(desfazer.rotulos[0].indexOf('#1') >= 0, 'e no lugar em que ela estava', desfazer.rotulos);
    ok(desfazer.refazerLigou, 'e o Refazer liga');
    ok(desfazer.depoisDeRefazer === 13, 'refazer tira de novo', desfazer);
    ok(desfazer.futuroApagado, 'mexer depois de desfazer apaga o futuro — como em todo editor');
    ok(desfazer.modeloVoltou && desfazer.celulasVoltaram === 14,
       'desfazer devolve também o MODELO inteiro tirado, com as células dele', desfazer);

    // ── 6. Completar a folha e ordenar ─────────────────────────────────────
    const completar = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const r = {};
        r.dica = document.getElementById('mtg-completar').title;
        window.__toasts = [];
        completarAFolhaDaMontagem();
        r.total = state.montagem.celulas.length;
        r.selo = document.getElementById('mtg-selo').textContent.replace(/\s+/g, ' ').trim();
        r.classe = document.getElementById('mtg-selo').className;
        r.avisou = (window.__toasts || []).join('|');
        r.travouDepois = document.getElementById('mtg-completar').disabled;
        r.podeDesfazer = !document.getElementById('mtg-desfazer').disabled;
        return r;
    }, PECAS);
    ok(/entram 6/.test(completar.dica), 'o botão diz ANTES quantas células vão entrar', completar.dica);
    ok(completar.total === 20, 'completar fecha a folha: 14 mais 6', completar.total);
    ok(/sem sobra/.test(completar.selo) && /fecha-certo/.test(completar.classe),
       'e o selo fica VERDE, dizendo que a folha fecha certo', completar);
    ok(/6 célula\(s\) repetida/.test(completar.avisou), 'e o aviso diz o que foi feito', completar.avisou);
    ok(completar.travouDepois, 'depois disso o botão trava: não há mais sobra');
    ok(completar.podeDesfazer, 'e dá para desfazer');

    const ordenar = await aba.evaluate(pecas => {
        window.__montar(pecas);
        moverCelulaDaMontagem(13, 0);
        const antes = window.__rotulos().map(t => t.split(' · ')[1]);
        window.__toasts = [];
        ordenarMontagem('modelo');
        const depois = window.__rotulos().map(t => t.split(' · ')[1]);
        return { antes, depois, avisou: (window.__toasts || []).join('|') };
    }, PECAS);
    ok(ordenar.antes[0] === '1000203' && ordenar.depois[0] === '1000565',
       'ordenar por modelo reagrupa a folha', ordenar);
    // Agrupadas quer dizer que cada modelo aparece num bloco contiguo — e nao
    // em ordem alfabetica: a ordem dos blocos e' a do REGISTRO, que e' a do
    // multi_artes, e mexer nela mexeria no deslocamento das posicoes.
    const blocos = ordenar.depois.filter((m, i) => i === 0 || m !== ordenar.depois[i - 1]);
    ok(blocos.length === new Set(blocos).size,
       'e as células do mesmo modelo ficam num bloco contíguo', { blocos, depois: ordenar.depois });
    ok(/não mudou/.test(ordenar.avisou),
       'e o aviso diz que o código de ninguém mudou — só a ordem no papel', ordenar.avisou);

    // ── 7. O NÚMERO DO MODELO NO PAPEL ─────────────────────────────────────
    const numero = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const r = {};
        const caixa = document.getElementById('mtg-num-imprimir');
        r.nasceDesligado = caixa.checked === false;
        r.desligadoNaFolha = document.querySelectorAll('#mtg-folha .mtg-celula span[style*="Impact"]').length;
        r.grade = document.querySelector('.mtg-num-grade').classList.contains('desligado');

        alternarNumeroDaMontagem();
        r.ligado = state.montagem.numero.imprimir;
        const spans = Array.from(document.querySelectorAll('#mtg-folha .mtg-celula span[style*="Impact"]'));
        r.desenhados = spans.length;
        r.texto = spans[0] ? spans[0].textContent : '';
        r.estilo = spans[0] ? spans[0].getAttribute('style') : '';

        r.padroes = { pos: state.montagem.numero.pos, rot: state.montagem.numero.rot,
                      size: state.montagem.numero.size, cor: state.montagem.numero.cor };
        r.posMarcada = document.querySelector('.mtg-num-op.ativo').textContent.trim();

        mudarNumeroDaMontagem('pos', 'topo');
        mudarNumeroDaMontagem('rot', '270');
        mudarNumeroDaMontagem('size', '20');
        mudarNumeroDaMontagem('cor', '#ef4444');
        r.mudou = Object.assign({}, state.montagem.numero);
        const novo = document.querySelector('#mtg-folha .mtg-celula span[style*="Impact"]');
        r.estiloNovo = novo ? novo.getAttribute('style') : '';
        r.rotulo = Array.from(document.querySelectorAll('.mtg-num-rotulo')).map(e => e.textContent.trim()).join('|');

        mudarNumeroDaMontagem('pos', 'diagonal');
        r.invalido = state.montagem.numero.pos;

        // O numero CENTRADO na borda escolhida. Antes ele era posicionado pela
        // borda da caixa NAO-girada, e metade dele vazava para fora da celula.
        // Aqui vale a credencial PVC (86x54 mm), onde um numero de sete digitos
        // girado CABE — ver o teste seguinte para a tira Triband, onde nao cabe
        // nem no papel.
        window.__montar([{ id: '2000', osId: 'a', pedido: '21202', nome: 'CREDENCIAL',
                           qtd: 500, pos: [1, 2, 3, 4], produto: 502 }]);
        alternarNumeroDaMontagem();
        mudarNumeroDaMontagem('pos', 'topo');
        mudarNumeroDaMontagem('rot', '90');
        const cel = document.querySelector('#mtg-folha .mtg-celula:not(.mtg-celula-vazia)');
        const sp = cel.querySelector('span[style*="Impact"]');
        const rc = cel.getBoundingClientRect(), rs = sp.getBoundingClientRect();
        r.dentro = rs.top >= rc.top - 1 && rs.bottom <= rc.bottom + 1
                && rs.left >= rc.left - 1 && rs.right <= rc.right + 1;
        // Centrado no eixo LONGO da borda de cima.
        r.centrado = Math.abs(((rs.left + rs.right) / 2) - ((rc.left + rc.right) / 2)) < 2;
        r.caixas = { cel: { t: Math.round(rc.top), b: Math.round(rc.bottom) },
                     num: { t: Math.round(rs.top), b: Math.round(rs.bottom) } };
        return r;
    }, PECAS);
    ok(numero.nasceDesligado, 'o número nasce DESLIGADO — novidade que muda o papel entra desligada');
    ok(numero.desligadoNaFolha === 0, 'e desligado, ele não é desenhado em célula nenhuma');
    ok(numero.grade, 'os controles ficam apagados enquanto está desligado — mas à vista, não escondidos');
    ok(numero.ligado === true && numero.desenhados === 14,
       'ligado, ele aparece em TODAS as células cheias', numero.desenhados);
    ok(numero.texto === '1000565', 'com o id do modelo daquela célula', numero.texto);
    ok(/Impact/.test(numero.estilo) && /rotate\(-90deg\)/.test(numero.estilo),
       'na fonte e no giro que o motor usa', numero.estilo);
    ok(numero.padroes.pos === 'esquerda' && numero.padroes.rot === 90
       && numero.padroes.size === 14 && numero.padroes.cor === '#000000',
       'e os padrões são o que o motor sempre fez', numero.padroes);
    ok(numero.posMarcada === 'Esquerda', 'com o botão da posição atual marcado', numero.posMarcada);
    ok(numero.mudou.pos === 'topo' && numero.mudou.rot === 270
       && numero.mudou.size === 20 && numero.mudou.cor === '#ef4444',
       'os quatro controles mudam o estado', numero.mudou);
    ok(/rotate\(-270deg\)/.test(numero.estiloNovo) && /#ef4444/.test(numero.estiloNovo),
       'e a folha acompanha na hora', numero.estiloNovo);
    ok(/20 pt/.test(numero.rotulo), 'o rótulo do tamanho diz o valor em pontos', numero.rotulo);
    ok(numero.invalido === 'esquerda', 'valor inválido cai no padrão, como no motor', numero.invalido);
    ok(numero.dentro,
       'e o número girado no TOPO fica dentro da célula — posicionado pela borda da caixa não-girada, metade dele vazava',
       numero.caixas);
    ok(numero.centrado, 'centrado ao longo da borda escolhida', numero.caixas);

    // NA TIRA TRIBAND, que é o caso apertado: 20 mm de altura, e um número de
    // sete dígitos girado 90° corre ao longo dessa altura. No padrão ele cabe,
    // por pouco. Estourar o corpo faz ele passar da célula — e é exatamente
    // para isso que o controle de tamanho existe: o operador vê antes de gastar
    // folha, em vez de descobrir no papel.
    const naTira = await aba.evaluate(pecas => {
        window.__montar(pecas);
        alternarNumeroDaMontagem();
        mudarNumeroDaMontagem('pos', 'topo');
        mudarNumeroDaMontagem('rot', '90');
        const medir = () => {
            const c = document.querySelector('#mtg-folha .mtg-celula:not(.mtg-celula-vazia)');
            const s = c.querySelector('span[style*="Impact"]');
            return { cel: c.getBoundingClientRect().height, num: s.getBoundingClientRect().height };
        };
        const padrao = medir();
        mudarNumeroDaMontagem('size', '24');
        const grande = medir();
        mudarNumeroDaMontagem('size', '6');
        const pequeno = medir();
        return { padrao, grande, pequeno };
    }, PECAS);
    ok(naTira.padrao.num <= naTira.padrao.cel + 1,
       'na tira Triband o número a 14 pt cabe na altura da célula — por pouco', naTira.padrao);
    ok(naTira.grande.num > naTira.padrao.num && naTira.pequeno.num < naTira.padrao.num,
       'e o controle de tamanho o cresce e o encolhe de verdade na prévia', naTira);
    ok(naTira.grande.num > naTira.grande.cel,
       'a 24 pt ele passa da célula, e a tela mostra isso ANTES de gastar folha', naTira.grande);

    // ── 8. A TIRAGEM no rótulo, e a lista ──────────────────────────────────
    const lista = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const cab = Array.from(document.querySelectorAll('#mtg-lista th')).map(e => e.textContent.trim());
        const linhas = Array.from(document.querySelectorAll('#mtg-lista .data-table tr')).slice(1);
        return {
            cabecalho: cab,
            tiragens: linhas.map(tr => tr.children[1].textContent.trim()),
            dica: linhas[0].children[1].getAttribute('title') || '',
            tons: document.querySelectorAll('#mtg-lista .mtg-tom').length,
            resumo: document.getElementById('mtg-resumo').textContent,
        };
    }, PECAS);
    ok(lista.cabecalho.join('|').indexOf('Modelo|Tiragem|Na folha') === 0,
       'a lista traz modelo, tiragem e o que está na folha', lista.cabecalho);
    ok(lista.tiragens.join('|') === '3.000|1.920|150|800',
       'com a tiragem de CADA modelo, com separador de milhar', lista.tiragens);
    ok(/posição vale/.test(lista.dica), 'e a dica explica para que serve o número', lista.dica);
    ok(lista.tons === 4, 'cada modelo tem o seu tom, o mesmo da célula na folha', lista.tons);
    ok(/3 pedido\(s\) · 4 modelo\(s\)/.test(lista.resumo), 'e o resumo conta pedidos e modelos', lista.resumo);

    // ── 9. A trava e o selo ────────────────────────────────────────────────
    const trava = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const t = document.getElementById('mtg-trava');
        const s = document.getElementById('mtg-selo');
        return { visivel: t.style.display !== 'none',
                 texto: t.textContent.replace(/\s+/g, ' ').trim(),
                 selo: s.textContent.replace(/\s+/g, ' ').trim(), classe: s.className };
    }, PECAS);
    ok(trava.visivel, 'a trava aparece com a primeira célula');
    ok(/Triband/.test(trava.texto) && /Azul Celeste/.test(trava.texto)
        && /SRA3/.test(trava.texto) && /Só frente/.test(trava.texto),
       'e diz as QUATRO coisas que a folha aceita', trava.texto);
    ok(/2 folha\(s\)/.test(trava.selo) && /14 célula\(s\)/.test(trava.selo)
        && /sobram 6 célula\(s\)/.test(trava.selo), 'o selo diz folhas, células e sobra', trava.selo);
    ok(/tem-sobra/.test(trava.classe),
       'com sobra o selo fica AMARELO — o amarelo é reservado à sobra', trava.classe);

    const verde = await aba.evaluate(() => {
        window.__montar([{ id: 'x', osId: 'a', pedido: '1', nome: 'n', qtd: 99, pos: [1,2,3,4,5,6,7,8,9,10] }]);
        const s = document.getElementById('mtg-selo');
        return { classe: s.className, texto: s.textContent.replace(/\s+/g, ' ').trim(),
                 titulos: document.querySelectorAll('.mtg-folha-titulo').length };
    });
    ok(/fecha-certo/.test(verde.classe) && /sem sobra/.test(verde.texto),
       'sem sobra o selo fica VERDE', verde);
    ok(verde.titulos === 0, 'e uma folha só não ganha título de folha', verde.titulos);

    // ── 10. A LINHA DA LISTA VOLTA AO MODELO ───────────────────────────────
    const voltar = await aba.evaluate(pecas => {
        window.__montar(pecas);
        return retomarDaMontagem(2).then(() => ({
            pedido: document.getElementById('mtg-pedido').value,
            modelo: document.getElementById('mtg-modelo').value,
            posicoes: document.getElementById('mtg-posicoes').value,
            focado: document.activeElement === document.getElementById('mtg-posicoes'),
            ativas: Array.from(document.querySelectorAll('.mtg-linha-ativa')).map(tr => tr.textContent),
            clicaveis: document.querySelectorAll('.mtg-linha').length,
            convite: (document.querySelector('#mtg-lista .mtg-dica') || {}).textContent || '',
        }));
    }, PECAS);
    ok(voltar.pedido === 'b' && voltar.modelo === '1000412',
       'clicar na linha devolve AQUELE pedido e AQUELE modelo ao compositor', voltar);
    ok(voltar.posicoes === '', 'e o campo de posições fica vazio: ele vem acrescentar', voltar);
    ok(voltar.focado, 'com o cursor já no campo — o próximo gesto é digitar', voltar);
    ok(voltar.ativas.length === 1 && voltar.ativas[0].indexOf('1000412') >= 0,
       'e SÓ a linha daquele modelo fica marcada como ativa', voltar.ativas);
    ok(voltar.clicaveis === 4, 'toda linha é clicável', voltar);
    ok(/Clique numa linha/.test(voltar.convite),
       'e a tela DIZ que a linha leva de volta — clique escondido não existe', voltar.convite);

    const tirarModelo = await aba.evaluate(pecas => {
        window.__montar(pecas);
        document.getElementById('mtg-pedido').value = '';
        state.montagem.pedidoSel = null;
        state.montagem.modeloSel = null;
        document.querySelectorAll('#mtg-lista .mtg-tirar')[1].click();
        return { linhas: document.querySelectorAll('#mtg-lista .data-table tr').length - 1,
                 celulas: state.montagem.celulas.length,
                 pedidoSel: state.montagem.pedidoSel };
    }, PECAS);
    ok(tirarModelo.linhas === 3 && tirarModelo.celulas === 10,
       'o × da linha tira o modelo e as células dele', tirarModelo);
    ok(tirarModelo.pedidoSel === null,
       'e não dispara a volta ao modelo que acabou de sair da lista', tirarModelo);

    // ── 11. ONDE O PDF VAI PARAR ───────────────────────────────────────────
    const MTG_CODIGO = MTG.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(!/window\.open\(/.test(MTG_CODIGO),
       'a Montagem não entrega o PDF por janela nova — o navegador a bloqueia');
    ok(/hotfolder\/drop/.test(MTG) && /hotfolder\/escolher/.test(MTG),
       'quem escolhe a pasta e quem grava no disco é a ESTAÇÃO, não o navegador');
    ok(/a\.download = nome/.test(MTG),
       'e sem pasta escolhida o PDF desce por <a download>, que nada bloqueia');

    const destino = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const feito = [];
        const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

        window._mtgEstacao = async () => 'http://127.0.0.1:9000';
        window.prepararArtesDaMontagem = async () => window.__artes();
        window.toast = (m, tipo) => feito.push(tipo + ': ' + m);
        window.baixarPdfDaMontagem = (b, n) => feito.push('baixou ' + n);
        window.abrirPdfDaMontagemNaTela = (b, n) => feito.push('abriu ' + n);
        window.gravarPdfNaEstacao = async (base, pasta) => {
            feito.push('gravou em ' + pasta);
            return pasta + '\\montagem.pdf';
        };
        let ultimoPayload = null;
        window.fetch = async (url, opts) => {
            if (opts && opts.body && opts.body.get) ultimoPayload = JSON.parse(opts.body.get('payload'));
            return { ok: true, blob: async () => pdf };
        };

        const sel = document.getElementById('mtg-pasta');
        const cx = document.getElementById('mtg-abrir');

        return (async () => {
            const r = { nasceMarcada: cx.defaultChecked === true };
            sel.innerHTML = '<option value="">Baixar pelo navegador</option>'
                          + '<option value="D:\\Hot">Hot</option>';

            sel.value = ''; cx.checked = false; feito.length = 0;
            await gerarPdfDaMontagem();
            r.semPasta = feito.slice();
            r.payload = ultimoPayload;

            sel.value = 'D:\\Hot'; cx.checked = true; feito.length = 0;
            await gerarPdfDaMontagem();
            r.comPasta = feito.slice();

            window.gravarPdfNaEstacao = async () => { throw new Error('a pasta sumiu'); };
            feito.length = 0;
            await gerarPdfDaMontagem();
            r.pastaQuebrada = feito.slice();

            window.prepararArtesDaMontagem = async () => { throw new Error('Não consegui ler os bancos'); };
            ultimoPayload = null; feito.length = 0;
            await gerarPdfDaMontagem();
            r.preparoRecusou = feito.slice();
            r.foiAoMotor = ultimoPayload !== null;

            window.prepararArtesDaMontagem = async () => window.__artes().map(a => Object.assign(a, { _tiragem: 5 }));
            ultimoPayload = null; feito.length = 0;
            await gerarPdfDaMontagem();
            r.foraDaTiragem = feito.slice();
            r.foiAoMotor2 = ultimoPayload !== null;

            r.nome = nomeDoArquivoDaMontagem(new Date(2026, 7, 29, 14, 5));
            return r;
        })();
    }, PECAS);

    ok(destino.nasceMarcada,
       'a caixa "abrir na tela" nasce MARCADA: é ela que devolve o PDF que sumia', destino);
    ok(destino.semPasta.some(l => /^baixou montagem_/.test(l))
       && !destino.semPasta.some(l => /gravou/.test(l)),
       'sem pasta escolhida, o PDF desce pelo navegador', destino.semPasta);
    ok(!destino.semPasta.some(l => /^abriu /.test(l)),
       'e com a caixa desmarcada ele não abre na tela', destino.semPasta);
    ok(destino.comPasta.some(l => l === 'gravou em D:\\Hot')
       && !destino.comPasta.some(l => /^baixou/.test(l)),
       'com pasta escolhida, quem grava é a estação — e o navegador não baixa nada', destino.comPasta);
    ok(destino.comPasta.some(l => /^abriu montagem_/.test(l)),
       'e marcada a caixa, o PDF abre na tela do painel', destino.comPasta);
    ok(destino.comPasta.some(l => /success: .*D:\\Hot/.test(l)),
       'o aviso diz ONDE o arquivo ficou — pasta não se procura no escuro', destino.comPasta);
    ok(destino.pastaQuebrada.some(l => /^baixou montagem_/.test(l)),
       'pasta que falha na hora de gravar NÃO perde o trabalho: o PDF desce pelo navegador',
       destino.pastaQuebrada);
    ok(destino.pastaQuebrada.some(l => /warning: .*a pasta sumiu/.test(l)),
       'e o operador fica sabendo o que falhou, com o motivo do disco', destino.pastaQuebrada);
    ok(destino.nome === 'montagem_2026-08-29_1405.pdf',
       'o nome do arquivo leva data E hora: refazer célula acontece o dia inteiro', destino.nome);

    const pl = destino.payload;
    ok(pl && pl.schema === 'multi_artes' && pl.refazer_repetir === true,
       'o payload vai com `schema` e com `refazer_repetir`', pl && { s: pl.schema, r: pl.refazer_repetir });
    ok(pl && pl.multi_artes.length === 4 && pl.multi_artes.every(a => a.pedido && a.modelo),
       'uma arte por modelo, cada uma com o SEU pedido e o SEU modelo');
    ok(pl && pl.refazer_celulas.join(',') === '1,6,22,3340,3341,3342,3343,4927,4932,5008,5073,5074,5075,5076',
       'e as posições vão traduzidas para o fluxo combinado', pl && pl.refazer_celulas);
    ok(pl && pl.print_mode === 'front' && pl.rotate_page === 90,
       'o modo de impressão vem dos modelos e a rotação vem do formato', pl && { pm: pl.print_mode, rot: pl.rotate_page });
    ok(destino.preparoRecusou.some(l => /error: Não consegui ler os bancos/.test(l)) && !destino.foiAoMotor,
       'preparo que recusa para ANTES do motor, com o recado na tela', destino.preparoRecusou);
    ok(destino.foraDaTiragem.some(l => /error: Posição que não existe mais/.test(l)) && !destino.foiAoMotor2,
       'posição que deixou de existir também para antes do motor', destino.foraDaTiragem);

    const pastas = await aba.evaluate(() => {
        window._mtgEstacao = async () => 'http://127.0.0.1:9000';
        window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, pastas: [
            { path: 'D:\\Hot', nome: 'Hot', existe: true },
            { path: 'Z:\\Sumida', nome: 'Sumida', existe: false },
            { path: '\\\\rede\\lenta', nome: 'lenta', existe: null },
        ] }) });
        return encherPastasDaMontagem().then(() => {
            const sel = document.getElementById('mtg-pasta');
            const dica = document.getElementById('mtg-destino-dica');
            sel.value = ''; onMontagemPastaChange();
            const semPasta = dica.textContent;
            sel.value = 'D:\\Hot'; onMontagemPastaChange();
            return { opcoes: Array.from(sel.options).map(o => o.textContent),
                     primeira: sel.options[0].value, semPasta, comPasta: dica.textContent };
        });
    });
    ok(pastas.primeira === '',
       'a primeira opção é "baixar pelo navegador": sem estação a tela continua entregando');
    ok(/Sumida \(não encontrada\)/.test(pastas.opcoes.join('|')),
       'pasta que a estação conferiu e não achou aparece marcada', pastas.opcoes);
    ok(!/lenta \(não encontrada\)/.test(pastas.opcoes.join('|')),
       'mas pasta que só demorou a responder NÃO é acusada de sumida', pastas.opcoes);
    ok(/downloads do navegador/.test(pastas.semPasta) && /a estação/.test(pastas.comPasta),
       'e a dica diz o que vai acontecer com o arquivo, antes de gerar', pastas);

    // ── 12. Cabe na tela, e a folha é o elemento dominante ─────────────────
    const layout = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const corpo = document.querySelector('.mtg-corpo');
        const folha = document.querySelector('.mtg-folha-card');
        const lado = document.querySelector('.mtg-lado');
        const r = corpo.getBoundingClientRect();
        const rf = folha.getBoundingClientRect(), rl = lado.getBoundingClientRect();
        return {
            umaLinha: Math.abs(rf.top - rl.top) < 4,
            larguraFolha: Math.round(rf.width),
            larguraLado: Math.round(rl.width),
            vazando: Math.round(r.right) > document.documentElement.clientWidth + 1,
            atalhos: (document.querySelector('.mtg-atalhos') || {}).textContent || '',
            papelDentro: (() => {
                const p = document.querySelector('#mtg-folha .mtg-papel');
                const c = document.getElementById('mtg-folha');
                return p.getBoundingClientRect().width <= c.getBoundingClientRect().width + 1;
            })(),
        };
    }, PECAS);
    ok(layout.umaLinha, 'em 1600px a folha e a coluna de apoio ficam lado a lado', layout);
    ok(layout.larguraFolha > layout.larguraLado * 1.8,
       'e a FOLHA é o elemento dominante — era ela que ficava na coluna de 380px', layout);
    ok(!layout.vazando, 'nada vaza da tela', layout);
    ok(layout.papelDentro, 'e o papel desenhado cabe na área da folha', layout);
    ok(/Arraste/.test(layout.atalhos) && /repete/.test(layout.atalhos)
       && /Ctrl\+Z/.test(layout.atalhos),
       'os gestos estão escritos em texto — ícone sem rótulo não vale nesta gráfica', layout.atalhos);

    // ── O APROVEITAMENTO DA FOLHA (03/09/2026) ──────────────────────────────
    //
    // Pedido do usuário, com o exemplo dentro: "formato com 10 células, modelo
    // 1, 30 unidades, modelo 2, 70 unidades. Montagem sugerida 3x o modelo 1 e
    // 7x o modelo 2". O painel só aparece com dois modelos ou mais, e oferece
    // os TRÊS caminhos — decisão do usuário na mesma conversa.
    const APROV = [
        { id: 'M1', osId: 'a', pedido: '21202', nome: 'INTEIRA', qtd: 30, pos: [1] },
        { id: 'M2', osId: 'a', pedido: '21202', nome: 'MEIA', qtd: 70, pos: [1] },
    ];

    // Com UM modelo o painel não existe: não há proporção entre uma coisa só.
    const soUm = await aba.evaluate(pecas => {
        window.__montar([pecas[0]]);
        const c = document.getElementById('mtg-sugestao');
        return { escondido: c.style.display === 'none', vazio: c.innerHTML.trim() === '' };
    }, APROV);
    ok(soUm.escondido && soUm.vazio,
       'com um modelo só, o painel do aproveitamento não ocupa espaço na tela', soUm);

    const painel = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const c = document.getElementById('mtg-sugestao');
        const bt = Array.from(c.querySelectorAll('button'));
        return {
            visivel: c.style.display !== 'none',
            texto: c.textContent.replace(/\s+/g, ' ').trim(),
            botoes: bt.map(b => ({
                rotulo: b.textContent.replace(/\s+/g, ' ').trim(),
                acao: b.getAttribute('onclick') || '',
            })),
            celulasPorModelo: Array.from(c.querySelectorAll('tbody tr'))
                .map(tr => Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim())),
        };
    }, APROV);

    ok(painel.visivel, 'com dois modelos, o painel do aproveitamento aparece');
    ok(/3× M1 \+ 7× M2 por folha/.test(painel.texto),
       'e diz a mistura do exemplo do usuário: 3 de um, 7 do outro', painel.texto.slice(0, 260));
    ok(painel.celulasPorModelo[0][1] === '30' && painel.celulasPorModelo[0][2] === '3'
        && painel.celulasPorModelo[1][1] === '70' && painel.celulasPorModelo[1][2] === '7',
       'a tabela mostra a tiragem de cada modelo e quantas células ele leva na folha',
       painel.celulasPorModelo);
    ok(painel.botoes.length === 3, 'os TRÊS caminhos ficam oferecidos', painel.botoes);
    ok(/Aplicar o recomendado/.test(painel.botoes[0].rotulo)
        && /uma folha, 10 impress/.test(painel.botoes[0].rotulo),
       'sem dado variável o recomendado é a folha impressa 10 vezes', painel.botoes[0]);
    ok(/Uma folha, 10 impress/.test(painel.botoes[1].rotulo)
        && /Distribuir em 10 folhas/.test(painel.botoes[2].rotulo),
       'e os outros dois dizem, em texto, o que fazem', painel.botoes.map(b => b.rotulo));
    ok(painel.botoes[0].acao.indexOf("'auto'") > 0
        && painel.botoes[1].acao.indexOf("'unica'") > 0
        && painel.botoes[2].acao.indexOf("'distribuir'") > 0,
       'cada botão chama o seu modo', painel.botoes.map(b => b.acao));

    // ── Aplicar o recomendado: uma folha com a mistura ──────────────────────
    const unica = await aba.evaluate(async pecas => {
        window.__montar(pecas);
        // Um teste anterior trocou o `toast` global pelo dele; este põe o seu.
        window.__toasts = [];
        window.toast = (m, tipo) => window.__toasts.push((tipo || 'info') + ': ' + m);
        await aplicarSugestaoDaMontagem('auto');
        const conta = contaDaMontagem(state.montagem.celulas, 10);
        return {
            celulas: state.montagem.celulas.length,
            folhas: conta.folhas, vazias: conta.vazias,
            deM1: state.montagem.celulas.filter(c => c.itemId === 'M1').length,
            deM2: state.montagem.celulas.filter(c => c.itemId === 'M2').length,
            desenhadas: document.querySelectorAll('#mtg-folha .mtg-celula:not(.mtg-celula-vazia)').length,
            toast: (window.__toasts || []).join(' | '),
            podeDesfazer: !document.getElementById('mtg-desfazer').disabled,
        };
    }, APROV);
    ok(unica.celulas === 10 && unica.folhas === 1 && unica.vazias === 0,
       'o recomendado monta UMA folha cheia', unica);
    ok(unica.deM1 === 3 && unica.deM2 === 7, 'com 3 do primeiro e 7 do segundo', unica);
    ok(unica.desenhadas === 10, 'e a folha na tela mostra as dez', unica);
    ok(/Imprima 10 vez/.test(unica.toast),
       'o aviso diz quantas vezes imprimir — sem isso a folha sozinha não entrega a tiragem',
       unica.toast);
    ok(unica.podeDesfazer, 'e o desfazer fica armado: aplicar substitui o que havia');

    const desfeito = await aba.evaluate(() => {
        desfazerMontagem();
        return state.montagem.celulas.length;
    });
    ok(desfeito === 2, 'Ctrl+Z devolve a folha que o operador tinha montado', desfeito);

    // ── Distribuir: cada folha sai com a mesma mistura ──────────────────────
    const distribuido = await aba.evaluate(async pecas => {
        window.__montar(pecas);
        await aplicarSugestaoDaMontagem('distribuir');
        const cel = state.montagem.celulas;
        const porFolha = [];
        for (let f = 0; f < 10; f++) {
            const bloco = cel.slice(f * 10, f * 10 + 10);
            porFolha.push(bloco.filter(c => c.itemId === 'M1').length + '+'
                + bloco.filter(c => c.itemId === 'M2').length);
        }
        const posM1 = cel.filter(c => c.itemId === 'M1').map(c => c.pos);
        return {
            celulas: cel.length, porFolha: porFolha,
            posRepetida: posM1.length !== new Set(posM1).size,
            maiorPos: Math.max.apply(null, posM1),
        };
    }, APROV);
    ok(distribuido.celulas === 100, 'distribuir traz uma célula por peça', distribuido.celulas);
    ok(distribuido.porFolha.every(x => x === '3+7'),
       'e TODA folha sai com a mistura sugerida', distribuido.porFolha);
    ok(!distribuido.posRepetida && distribuido.maiorPos === 30,
       'sem repetir posição e sem passar da tiragem: cada célula é um item diferente',
       distribuido);

    // ── Dado variável: a folha repetida é avisada antes ─────────────────────
    const comDado = await aba.evaluate(async pecas => {
        const alterado = pecas.map((p, j) => Object.assign({}, p, { variavel: j === 1 }));
        window.__montar(alterado);
        const c = document.getElementById('mtg-sugestao');
        const rec = c.querySelector('.mtg-sug-rec').textContent.replace(/\s+/g, ' ').trim();

        // O operador insiste na folha repetida e o popup pergunta.
        window.__confirmou = [];
        window.__confirmarResposta = false;
        await aplicarSugestaoDaMontagem('unica');
        const recusado = state.montagem.celulas.length;

        window.__confirmarResposta = true;
        await aplicarSugestaoDaMontagem('unica');
        return {
            recomendado: rec,
            avisoNaTela: c.textContent.replace(/\s+/g, ' ').trim(),
            marcaVar: c.querySelectorAll('.mtg-sug-var').length,
            perguntou: window.__confirmou.length,
            pergunta: JSON.stringify(window.__confirmou[0] || {}),
            aposRecusar: recusado,
            aposAceitar: state.montagem.celulas.length,
        };
    }, APROV);
    ok(/Aplicar o recomendado.*distribuir em 10 folhas/.test(comDado.recomendado),
       'com dado variável na folha, o recomendado passa a ser distribuir', comDado.recomendado);
    ok(comDado.marcaVar === 1, 'e o modelo variável fica marcado na tabela', comDado.marcaVar);
    ok(/repetir a mesma folha repetiria o código/.test(comDado.avisoNaTela),
       'o motivo está escrito na tela, e não só no popup', comDado.avisoNaTela.slice(-260));
    ok(comDado.perguntou === 2,
       'pedir a folha repetida com dado variável SEMPRE pergunta antes', comDado.perguntou);
    ok(/mesmos códigos/.test(comDado.pergunta) && /Distribuir em 10 folhas/.test(comDado.pergunta),
       'e a pergunta diz o que acontece e qual é a alternativa', comDado.pergunta.slice(0, 400));
    ok(comDado.aposRecusar === 2,
       'cancelar não mexe na folha — o operador volta ao que tinha', comDado.aposRecusar);
    ok(comDado.aposAceitar === 10,
       'avisado, ele segue: a decisão continua sendo dele', comDado.aposAceitar);

    // ── Caminho impossível nasce travado, e diz por quê ─────────────────────
    //
    // Com as quatro peças de produção são 5.870 peças: distribuir desenharia uma
    // célula para cada. O botão que a tela não pode cumprir fica desabilitado
    // com o motivo no `title` — botão que recusa depois do clique faz o operador
    // aprender por tentativa.
    const teto = await aba.evaluate(async pecas => {
        window.__montar(pecas);
        const c = document.getElementById('mtg-sugestao');
        const bt = Array.from(c.querySelectorAll('button'));
        window.__toasts = [];
        window.toast = (m, tipo) => window.__toasts.push((tipo || 'info') + ': ' + m);
        const antes = state.montagem.celulas.length;
        await aplicarSugestaoDaMontagem('distribuir');
        return {
            travados: bt.map(b => b.disabled),
            motivo: bt[2].title,
            explicacao: c.textContent.replace(/\s+/g, ' ').trim(),
            mexeu: state.montagem.celulas.length !== antes,
            recusa: (window.__toasts || []).join(' | '),
        };
    }, PECAS);
    ok(teto.travados[2] === true, 'o botão de distribuir nasce travado nessa tiragem', teto.travados);
    ok(teto.travados[0] === false && teto.travados[1] === false,
       'e os outros dois continuam à mão: a folha repetida ainda serve aqui', teto.travados);
    ok(/tela do Pedido/.test(teto.motivo),
       'o motivo aponta para onde ir — trava sem saída não vale nesta gráfica', teto.motivo);
    ok(!teto.mexeu && /tela do Pedido/.test(teto.recusa),
       'e chamar o modo travado por fora não mexe na folha', teto);

    // ── O painel mora na coluna de apoio, depois da lista de modelos ────────
    const lugar = await aba.evaluate(() => {
        const c = document.getElementById('mtg-sugestao');
        const lista = document.querySelector('.mtg-lista-card');
        return {
            noLado: !!c.closest('.mtg-lado'),
            depoisDaLista: !!(lista.compareDocumentPosition(c)
                & Node.DOCUMENT_POSITION_FOLLOWING),
            largura: Math.round(c.getBoundingClientRect().width),
            paiLargura: Math.round(c.parentElement.getBoundingClientRect().width),
        };
    });
    ok(lugar.noLado && lugar.depoisDaLista,
       'o painel fica na coluna de apoio, logo abaixo dos modelos que ele analisa', lugar);
    ok(lugar.largura <= lugar.paiLargura + 1, 'e não vaza da coluna', lugar);

    if (FOTO) {
        await aba.evaluate(pecas => {
            window.__montar(pecas);
            alternarNumeroDaMontagem();
        }, PECAS);
        const el = await aba.$('#view-montagem');
        await el.screenshot({ path: FOTO });
        console.log('foto em ' + FOTO);

        // A coluna de apoio nao cabe na janela junto com a folha inteira, e o
        // que passa da altura da janela sai em branco. Ela ganha a sua propria
        // foto: e' onde mora o painel do aproveitamento.
        await aba.evaluate(() => {
            document.querySelector('.mtg-folha-card').style.display = 'none';
            window.scrollTo(0, 0);
        });
        const lado = await aba.$('.mtg-lado');
        const fotoLado = FOTO.replace(/\.png$/i, '') + '-lado.png';
        await lado.screenshot({ path: fotoLado });
        console.log('foto em ' + fotoLado);
    }

    await navegador.close();

    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes da tela da Montagem passaram.`);
})().catch(e => { console.error(e); process.exit(1); });
