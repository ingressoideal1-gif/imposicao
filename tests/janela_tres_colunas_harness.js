// A JANELA DE VISUALIZACAO EM TRES COLUNAS, DESENHADA NUM CHROME DE VERDADE.
//
// O usuario apontou duas coisas na versao anterior: o cabecalho estava confuso
// -- titulo, dois botoes, a caixa inteira do Refazer e os controles da previa,
// tudo na mesma faixa -- enquanto a previa da imposicao ficava "perdida no meio
// da tela", espremida entre a regua de cima e o painel do driver, que ocupava
// 30% da largura o tempo todo.
//
// O desenho aprovado: cabecalho de UMA linha; controles da previa a esquerda;
// a previa com o CENTRO INTEIRO; e as acoes a direita, em quatro grupos que
// abrem e fecham, nesta ordem -- Imprimir e PDF, Configuracao de Impressao,
// Gerenciamento de Cores, Refazer Folhas.
//
// Isto so se mede DESENHANDO. Um teste de HTML diria que os controles existem;
// quem decide se a previa tem espaco e' o layout. Foi a licao do harness da
// barra do acabamento, que ja errou de lugar duas vezes com o HTML certo.
//
// O harness usa a janela DE VERDADE, recortada do index.html, e o style.css de
// verdade. Nada sai desta maquina: CDN nenhum, banco nenhum, rede nenhuma.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

// ─── A janela de verdade, recortada do index.html ────────────────────────────
function recortarJanela() {
    const i = HTML.indexOf('<div class="imposicao-preview" id="ped-preview-card-container"');
    const f = HTML.indexOf('</div><!-- /ped-preview-home -->');
    if (i < 0 || f < 0) throw new Error('nao achei a janela no index.html');
    return HTML.slice(i, f);
}

function extrair(nome) {
    const i = PEDIDO.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = PEDIDO.indexOf('\n}', i);
    return PEDIDO.slice(i, fim + 2);
}

// ─── Os controles que a janela NAO PODE PERDER ───────────────────────────────
//
// Levantados um a um da versao anterior desta tela. Se um sumir num redesenho
// futuro, e' aqui que se descobre -- e nao na estacao, com o trabalho parado.
const CONTROLES = [
    // previa
    'ped-preview-canvas', 'ped-preview-sheet-num', 'ped-preview-page-input',
    'ped-preview-set-input', 'ped-preview-part-input', 'ped-preview-face-container',
    'ped-btn-preview-front', 'ped-btn-preview-back', 'ped-preview-toggle-amostra',
    // acoes
    'ped-preview-btn-pdf', 'ped-preview-btn-print', 'ped-btn-cancel-print',
    // refazer
    'ped-refazer-checkbox', 'ped-refazer-set', 'ped-refazer-de', 'ped-refazer-ate',
    'ped-refazer-total', 'ped-refazer-cel-checkbox', 'ped-refazer-cel', 'ped-refazer-cel-info',
    // configuracao de impressao
    'ped-hotfolder-enabled', 'ped-hotfolder-path', 'ped-hotfolder-pick-btn', 'ped-hotfolder-status',
    'ped-print-printer', 'ped-print-reload-btn', 'ped-driver-status',
    'ped-print-reverse', 'ped-print-sheet-by-sheet', 'ped-entregar-por-bloco',
    'ped-driver-loading', 'ped-driver-options', 'ped-driver-hint',
    'ped-print-tray', 'ped-print-tray-capa', 'ped-print-tray-miolo',
    'ped-print-paper', 'ped-print-duplex', 'ped-print-color',
    'ped-print-copies', 'ped-print-orientation',
    'ped-print-save-section', 'ped-print-save-btn', 'ped-print-saved-indicator',
    // gerenciamento de cores
    'ped-print-cor-box', 'ped-print-cor-ativo', 'ped-print-cor-perfil', 'ped-print-cor-intento',
    'ped-print-cor-upload', 'ped-print-cor-status', 'ped-cor-saturacao', 'ped-cor-brilho',
    'ped-cor-contraste', 'ped-cor-curva-canvas', 'ped-cor-previa-antes', 'ped-cor-previa-depois',
    'ped-cor-canal-master', 'ped-cor-canal-r', 'ped-cor-canal-g', 'ped-cor-canal-b',
    // os numeros da imposicao, que estavam escondidos sem querer
    'ped-summary', 'ped-sum-formato', 'ped-sum-grade', 'ped-sum-total',
    'ped-sum-folhas', 'ped-sum-vazias', 'ped-sum-saida',
];

(async function () {
    const navegador = await puppeteer.launch({ headless: 'new' });
    const aba = await navegador.newPage();
    await aba.setViewport({ width: 1920, height: 1080 });

    await aba.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
        `<body><div id="view-pedido"><div class="imposicao-layout">${recortarJanela()}</div></div></body></html>`,
        { waitUntil: 'load' }
    );

    await aba.evaluate(`
        ${extrair('alternarGrupoDaJanela')}
        window.alternarGrupoDaJanela = alternarGrupoDaJanela;
        document.getElementById('ped-preview-card-container').style.display = 'block';
    `);

    // ── 1. Nenhum controle se perdeu ────────────────────────────────────────
    const faltando = await aba.evaluate((ids) => ids.filter(id => !document.getElementById(id)), CONTROLES);
    ok(faltando.length === 0, 'nenhum controle da janela se perdeu no redesenho', faltando);

    const repetidos = await aba.evaluate((ids) =>
        ids.filter(id => document.querySelectorAll('[id="' + id + '"]').length > 1), CONTROLES);
    ok(repetidos.length === 0, 'e nenhum ficou duplicado (dois elementos com o mesmo id)', repetidos);

    // Um par so de Gerar PDF / Imprimir. O do Refazer saiu.
    const pares = await aba.evaluate(() => ({
        pdf: document.querySelectorAll('[id$="btn-pdf"], [onclick*="runPedImposition(\'pdf\'"]').length,
        imprimir: document.querySelectorAll('[id$="btn-print"], [onclick*="runPedImposition(\'print\'"]').length,
    }));
    ok(pares.pdf === 1 && pares.imprimir === 1, 'existe UM par de Gerar PDF / Imprimir na janela', pares);

    // ── 2. As tres colunas, e quem fica com o espaco ────────────────────────
    const larguras = await aba.evaluate(() => {
        const l = document.querySelector('.ped-janela-esquerda').getBoundingClientRect();
        const c = document.querySelector('.ped-janela-centro').getBoundingClientRect();
        const d = document.querySelector('.ped-janela-direita').getBoundingClientRect();
        return { esquerda: Math.round(l.width), centro: Math.round(c.width), direita: Math.round(d.width),
                 mesmaLinha: Math.abs(l.top - c.top) < 2 && Math.abs(c.top - d.top) < 2,
                 ordem: l.left < c.left && c.left < d.left };
    });
    ok(larguras.mesmaLinha, 'as tres colunas ficam lado a lado', larguras);
    ok(larguras.ordem, 'na ordem: controles, previa, acoes', larguras);
    ok(larguras.centro > larguras.esquerda + larguras.direita,
       'a previa fica com o centro inteiro — mais larga que as duas colunas somadas', larguras);

    // ── 3. O cabecalho tem uma linha so ─────────────────────────────────────
    const cabecalho = await aba.evaluate(() => {
        const c = document.querySelector('.ped-janela-cabecalho');
        const titulo = c.querySelector('.card-title').getBoundingClientRect();
        return { altura: Math.round(c.getBoundingClientRect().height), alturaTitulo: Math.round(titulo.height) };
    });
    ok(cabecalho.altura < cabecalho.alturaTitulo * 2.4,
       'o cabecalho tem uma linha so — nao voltou a empilhar botoes e controles', cabecalho);

    // ── 4. Os quatro grupos, na ordem, e so o primeiro aberto ───────────────
    const grupos = await aba.evaluate(() =>
        Array.from(document.querySelectorAll('.ped-janela-direita .jg')).map(g => ({
            id: g.id,
            aberto: g.classList.contains('jg-aberto'),
            corpoVisivel: document.getElementById(g.id + '-corpo').getBoundingClientRect().height > 0,
        })));
    ok(grupos.map(g => g.id).join(',') === 'jg-imprimir,jg-config,jg-cores,jg-refazer',
       'os quatro grupos estao na ordem pedida', grupos);
    ok(grupos[0].aberto && grupos[0].corpoVisivel, 'o grupo Imprimir e PDF nasce aberto', grupos);
    ok(!grupos.slice(1).some(g => g.aberto || g.corpoVisivel),
       'e os outros tres nascem fechados — o que nao se usa a toda hora nao ocupa tela', grupos);

    // ── 5. O grupo abre e fecha de verdade ──────────────────────────────────
    const config = await aba.evaluate(() => {
        alternarGrupoDaJanela('jg-config');
        const aberto = document.getElementById('jg-config-corpo').getBoundingClientRect().height > 0;
        const impressoraNaTela = document.getElementById('ped-print-printer').getBoundingClientRect().height > 0;
        alternarGrupoDaJanela('jg-config');
        const fechado = document.getElementById('jg-config-corpo').getBoundingClientRect().height === 0;
        return { aberto, impressoraNaTela, fechado };
    });
    ok(config.aberto && config.impressoraNaTela, 'abrir a Configuracao de Impressao mostra o seletor de impressora', config);
    ok(config.fechado, 'e clicar de novo fecha', config);

    // ── 6. O selo de estado da cor sobrevive ao grupo fechado ───────────────
    const selo = await aba.evaluate(() => {
        const s = document.getElementById('ped-cor-selo-ativo');
        s.style.display = 'inline-block';        // como o atualizarStatusCor faz
        const grupoFechado = document.getElementById('jg-cores-corpo').getBoundingClientRect().height === 0;
        return { grupoFechado, seloNaTela: s.getBoundingClientRect().height > 0 };
    });
    ok(selo.grupoFechado && selo.seloNaTela,
       'com o grupo de cores FECHADO, o selo que diz "ha conversao de cor ligada" continua na tela', selo);

    // ── 7. Tela estreita: a previa nao encolhe, as acoes e que descem ───────
    await aba.setViewport({ width: 1280, height: 900 });
    await new Promise(r => setTimeout(r, 60));
    const estreita = await aba.evaluate(() => {
        const c = document.querySelector('.ped-janela-centro').getBoundingClientRect();
        const d = document.querySelector('.ped-janela-direita').getBoundingClientRect();
        return { centro: Math.round(c.width), direitaAbaixo: d.top >= c.bottom - 2 };
    });
    ok(estreita.direitaAbaixo, 'em tela estreita a coluna das acoes desce para baixo da previa', estreita);
    ok(estreita.centro > 700, 'e a previa continua larga em vez de ser espremida', estreita);

    await navegador.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da janela em tres colunas passaram.');
})().catch(e => { console.error(e); process.exit(1); });
