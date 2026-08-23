// O titulo do pedido aberto no Painel do Acabamento, desenhado num Chrome.
//
// Pedido do usuario em 23/08/2026: o titulo em duas linhas -- em cima o numero
// e o evento, como ja estava; embaixo, com fonte 20% menor e em amarelo, o nome
// e o numero do cliente.
//
// O harness de regra (`acabamento_harness.js`) prova o que o `tituloDoPedidoHtml`
// devolve: duas linhas, o texto de cada uma, o `0.8em` e o `#fbbf24` escritos no
// estilo. O que ele NAO alcanca e a tela -- e aqui ha uma armadilha de verdade:
//
//   O <h1> do cabecalho herda `.page-header-text h1`, que pinta o texto com um
//   degrade por `-webkit-background-clip: text` e `-webkit-text-fill-color:
//   transparent`. Esse transparente e HERDADO pelos filhos, e o degrade do <h1>
//   se recorta no texto deles tambem. Uma segunda linha com `color: #fbbf24` e
//   mais nada sairia CINZA CLARA, igual a de cima -- o amarelo todo certo no
//   codigo, e ninguem vendo amarelo na tela.
//
// Por isso este teste mede a cor no pixel, e desenha ao lado o CONTROLE: a mesma
// linha so com `color`, que tem de continuar sem amarelo nenhum. Se um dia o
// controle passar a ficar amarelo, e porque o degrade saiu do <h1>, e a linha
// `-webkit-text-fill-color` do acabamento.js virou enfeite que ninguem entende.
//
// A imagem `_titulo_do_acabamento.png` guarda as duas, uma embaixo da outra.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const ACABAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'acabamento.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── As tres pecas reais ─────────────────────────────────────────────────────

// 1. O estilo da linha do cliente, como o acabamento.js o escreve.
function estiloDaLinhaDoCliente() {
    const i = ACABAMENTO.indexOf('const ESTILO_LINHA_DO_CLIENTE =');
    if (i < 0) throw new Error('nao achei o ESTILO_LINHA_DO_CLIENTE no acabamento.js');
    // Ate a aspa que fecha a INSTRUCAO (o fim `';`), e nao ate o primeiro `;`,
    // que e o separador dentro do proprio CSS ("font-size: 0.8em; color: ...").
    const fim = ACABAMENTO.indexOf("';", i);
    if (fim < 0) throw new Error('o ESTILO_LINHA_DO_CLIENTE nao termina como se espera');
    const partes = ACABAMENTO.slice(i, fim + 1).match(/'([^']*)'/g) || [];
    if (!partes.length) throw new Error('o ESTILO_LINHA_DO_CLIENTE nao tem texto');
    return partes.map(p => p.slice(1, -1)).join('');
}

// 2. A tag <h1> real do cabecalho, com o tamanho e o degrade dela.
function tagDoTitulo() {
    const i = HTML.indexOf('<h1 id="acab-detalhe-titulo"');
    if (i < 0) throw new Error('nao achei o <h1> do titulo no index.html');
    return HTML.slice(i, HTML.indexOf('</h1>', i) + 5);
}

// 3. A regra .page-header-text h1 do style.css -- de onde vem o transparente.
function regraDoCabecalho() {
    const i = CSS.indexOf('.page-header-text h1 {');
    if (i < 0) throw new Error('nao achei a regra .page-header-text h1 no style.css');
    return CSS.slice(i, CSS.indexOf('}', i) + 1);
}

const ESTILO = estiloDaLinhaDoCliente();
const TAG = tagDoTitulo();
const REGRA = regraDoCabecalho();

ok(/-webkit-text-fill-color:\s*transparent/.test(REGRA),
   'a regra do cabecalho ainda pinta o texto com fill transparente -- a armadilha existe',
   REGRA);

const AMARELO = 'rgb(251, 191, 36)';   // #fbbf24

// As duas linhas do titulo, como o `tituloDoPedidoHtml` as monta. O texto e de
// mentira; o que importa aqui e o estilo, que e o de verdade.
const LINHAS = '<div>21085 - Expointer 2026 - Parte 2</div>'
    + '<div style="' + ESTILO + '">FULANO DE TAL COMERCIO LTDA - 53193</div>';

// O controle: a mesma linha SEM devolver o text-fill. Tem de sair sem amarelo.
const LINHA_SO_COM_COLOR = '<div style="font-size: 0.8em; color: #fbbf24;">'
    + 'FULANO DE TAL COMERCIO LTDA - 53193</div>';

const PAGINA = '<!doctype html><meta charset="utf-8">'
    + '<style>body{margin:0;padding:24px;background:#0f172a;'
    + "font-family:'Inter',system-ui,sans-serif}"
    + REGRA
    + '.page-header-text h1{margin-bottom:0}'
    + '</style><body>'
    + '<div class="page-header-text" id="de-verdade">'
    + TAG.replace('></h1>', '>' + LINHAS + '</h1>')
    + '</div>'
    + '<div class="page-header-text" id="controle" style="margin-top:28px">'
    + TAG.replace(' id="acab-detalhe-titulo"', '')
         .replace('></h1>', '><div>21085 - Expointer 2026 - Parte 2</div>'
                  + LINHA_SO_COM_COLOR + '</h1>')
    + '</div></body>';

const servidor = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 320 });
    await page.goto('http://localhost:' + porta + '/', { waitUntil: 'domcontentloaded' });

    const medido = await page.evaluate(() => {
        function ler(div) {
            const e = getComputedStyle(div);
            return {
                fill: e.webkitTextFillColor || e.color,
                cor: e.color,
                tamanho: parseFloat(e.fontSize),
                largura: Math.round(div.getBoundingClientRect().width),
                topo: Math.round(div.getBoundingClientRect().top),
            };
        }
        const reais = [...document.querySelectorAll('#de-verdade h1 > div')].map(ler);
        const controle = [...document.querySelectorAll('#controle h1 > div')].map(ler);
        const h1 = document.querySelector('#de-verdade h1').getBoundingClientRect();
        return { reais, controle, alturaDoTitulo: Math.round(h1.height) };
    });

    const [primeira, segunda] = medido.reais;

    // ─── A segunda linha aparece, e aparece amarela ──────────────────────────
    ok(medido.reais.length === 2, 'o titulo tem duas linhas na tela', medido.reais.length);
    ok(segunda.fill === AMARELO, 'a de baixo chega amarela ao pixel',
        segunda.fill + ' (esperado ' + AMARELO + ')');

    // ─── 20% menor que a de cima ─────────────────────────────────────────────
    const proporcao = segunda.tamanho / primeira.tamanho;
    ok(Math.abs(proporcao - 0.8) < 0.01,
        'e sai com 80% do tamanho da de cima',
        primeira.tamanho.toFixed(1) + 'px -> ' + segunda.tamanho.toFixed(1)
        + 'px (' + Math.round(proporcao * 100) + '%)');

    // ─── Uma EMBAIXO da outra, nao ao lado ───────────────────────────────────
    ok(segunda.topo > primeira.topo, 'a do cliente fica embaixo, e nao ao lado',
        'topos ' + primeira.topo + ' e ' + segunda.topo);

    // ─── A de cima nao mudou: continua no degrade ────────────────────────────
    ok(primeira.fill === 'rgba(0, 0, 0, 0)',
        'a de cima continua pintada pelo degrade do cabecalho', primeira.fill);

    // ─── O controle: sem devolver o fill, o amarelo nao acontece ─────────────
    //
    // E este teste que da sentido ao de cima. O `color` fica amarelo no papel do
    // CSS, mas quem pinta o pixel e o `-webkit-text-fill-color` -- que ali
    // continua transparente, deixando o degrade do <h1> passar por cima.
    ok(medido.controle[1].fill === 'rgba(0, 0, 0, 0)',
        'a mesma linha so com `color` fica com o fill transparente do cabecalho',
        medido.controle[1].fill);
    ok(medido.controle[1].cor === AMARELO,
        'mesmo com o `color` amarelo escrito nela -- e por isso ela nao sai amarela',
        medido.controle[1].cor);
    ok(medido.controle[1].fill !== segunda.fill,
        'ou seja: as duas linhas, com o mesmo amarelo no `color`, pintam diferente',
        'controle=' + medido.controle[1].fill + ' real=' + segunda.fill);

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_titulo_do_acabamento.png') });
    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); servidor.close(); process.exit(1); });
