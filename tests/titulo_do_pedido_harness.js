// O titulo da tela de Pedido, desenhado num Chrome.
//
// Pedido do usuario em 23/08/2026: "no Painel de Arte, na edicao do Pedido,
// deixar o titulo 'numero + Evento' 20% menor e a segunda linha
// 'Cliente + Numero' 30% menor".
//
// Duas coisas so aparecem no pixel, e sao as duas que este harness mede:
//
//   1. os DOIS tamanhos saem do MESMO tamanho de referencia. "20% menor" e "30%
//      menor" nao sao um em cima do outro — se a segunda linha fosse 30% menor
//      que a primeira, ela sairia com 56% do titulo, e nao com 70%;
//
//   2. o amarelo chega. O <h1> herda o degrade de `.page-header-text h1`, que
//      pinta o texto com `-webkit-text-fill-color: transparent`; esse
//      transparente e HERDADO, e o degrade se recorta no texto dos filhos
//      tambem. Uma segunda linha so com `color` sairia cinza clara, igual a de
//      cima, com o amarelo todo certo no codigo. O controle ao lado prova isso.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── As pecas reais ─────────────────────────────────────────────────────────

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

/** Uma `const` de string, ate a aspa que fecha a INSTRUCAO (o `';` do fim). */
function recortarConstante(nome) {
    const i = SCRIPT.indexOf('const ' + nome + ' =');
    if (i < 0) throw new Error('nao achei a constante ' + nome);
    const fim = SCRIPT.indexOf("';", i);
    if (fim < 0) throw new Error('a constante ' + nome + ' nao termina como se espera');
    return SCRIPT.slice(i, fim + 2);
}

function tagDoTitulo() {
    const i = HTML.indexOf('<h1 id="ped-view-title"');
    if (i < 0) throw new Error('nao achei o <h1> do titulo da tela de Pedido');
    return HTML.slice(i, HTML.indexOf('</h1>', i) + 5);
}

function regraDoCabecalho() {
    const i = CSS.indexOf('.page-header-text h1 {');
    if (i < 0) throw new Error('nao achei a regra .page-header-text h1');
    return CSS.slice(i, CSS.indexOf('}', i) + 1);
}

const CODIGO = [
    recortarConstante('TAMANHO_DO_TITULO_DO_PEDIDO'),
    recortarConstante('ESTILO_CLIENTE_DO_PEDIDO'),
    recortar('escapeHtml'),
    recortar('rotuloDoCliente'),
    recortar('pintarTituloDaTelaDePedido'),
].join('\n');

const TAG = tagDoTitulo();
const REGRA = regraDoCabecalho();

ok(/-webkit-text-fill-color:\s*transparent/.test(REGRA),
   'a regra do cabecalho ainda pinta o texto com fill transparente -- a armadilha existe',
   REGRA);

const AMARELO = 'rgb(251, 191, 36)';   // #fbbf24
const TRANSPARENTE = 'rgba(0, 0, 0, 0)';

const PAGINA = '<!doctype html><meta charset="utf-8">'
    + '<style>body{margin:0;padding:24px;background:#0f172a;'
    + "font-family:'Inter',system-ui,sans-serif}"
    + REGRA
    + '.page-header-text h1{margin-bottom:0}'
    + '</style><body>'
    + '<div class="page-header-text" id="de-verdade">' + TAG + '</div>'
    + '<div class="page-header-text" id="controle" style="margin-top:28px">'
    + TAG.replace(' id="ped-view-title"', ' id="controle-titulo"') + '</div>'
    + '</body>';

const servidor = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

const PEDIDO = { numero: '21085', cliente: 'ANGELA BEATRIZ DA COSTA SALOMAO LTDA', numero_cliente: '53193' };

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 420 });
    await page.goto('http://localhost:' + porta + '/', { waitUntil: 'domcontentloaded' });

    const medido = await page.evaluate((codigo, pedido) => {
        eval(codigo);

        const alvo = document.getElementById('ped-view-title');
        pintarTituloDaTelaDePedido(alvo, pedido, 'Expointer 2026 - Parte 2');

        // O controle: a MESMA segunda linha, so com `color`. Tem de sair sem
        // amarelo — e o que prova que o text-fill da outra nao e enfeite.
        const controle = document.getElementById('controle-titulo');
        controle.style.fontSize = getComputedStyle(alvo).fontSize;
        controle.innerHTML = '<div style="font-size: 0.8em;">21085 - Expointer 2026 - Parte 2</div>'
            + '<div style="font-size: 0.7em; color: #fbbf24;">ANGELA BEATRIZ DA COSTA SALOMAO LTDA - 53193</div>';

        function ler(div) {
            const e = getComputedStyle(div);
            const r = div.getBoundingClientRect();
            return {
                texto: div.textContent.trim(),
                fill: e.webkitTextFillColor || e.color,
                cor: e.color,
                tamanho: parseFloat(e.fontSize),
                topo: Math.round(r.top),
            };
        }

        return {
            base: parseFloat(getComputedStyle(alvo).fontSize),
            linhas: [...alvo.querySelectorAll(':scope > div')].map(ler),
            controle: [...controle.querySelectorAll(':scope > div')].map(ler),
            semEvento: (() => {
                const solto = document.createElement('h1');
                document.getElementById('de-verdade').appendChild(solto);
                pintarTituloDaTelaDePedido(solto, pedido, '');
                const t = [...solto.querySelectorAll(':scope > div')].map(d => d.textContent.trim());
                solto.remove();
                return t;
            })(),
        };
    }, CODIGO, PEDIDO);

    const [primeira, segunda] = medido.linhas;

    // ─── Duas linhas, com o conteudo certo ──────────────────────────────────
    ok(medido.linhas.length === 2, 'o titulo sai em duas linhas', medido.linhas.length);
    ok(primeira && primeira.texto === '21085 - Expointer 2026 - Parte 2',
        'em cima, numero e evento', primeira && primeira.texto);
    ok(segunda && segunda.texto === 'ANGELA BEATRIZ DA COSTA SALOMAO LTDA - 53193',
        'embaixo, cliente e numero do cliente', segunda && segunda.texto);
    ok(segunda && segunda.topo > primeira.topo, 'uma embaixo da outra, e nao ao lado',
        'topos ' + (primeira && primeira.topo) + ' e ' + (segunda && segunda.topo));

    // ─── Os dois tamanhos saem da MESMA referencia ──────────────────────────
    const p1 = primeira ? primeira.tamanho / medido.base : 0;
    const p2 = segunda ? segunda.tamanho / medido.base : 0;
    ok(Math.abs(p1 - 0.8) < 0.01, 'a de cima sai 20% menor que o tamanho de referencia',
        Math.round(p1 * 100) + '% (' + (primeira && primeira.tamanho.toFixed(1)) + 'px de ' + medido.base.toFixed(1) + 'px)');
    ok(Math.abs(p2 - 0.7) < 0.01, 'e a de baixo, 30% menor QUE A MESMA referencia',
        Math.round(p2 * 100) + '% — 30% menor que a de cima daria 56%');

    // ─── O amarelo chega ao pixel ───────────────────────────────────────────
    ok(segunda && segunda.fill === AMARELO, 'a linha do cliente chega amarela',
        segunda && segunda.fill);
    ok(primeira && primeira.fill === TRANSPARENTE,
        'e a de cima continua pintada pelo degrade do cabecalho', primeira && primeira.fill);

    // ─── O controle: sem devolver o fill, o amarelo nao acontece ────────────
    ok(medido.controle[1] && medido.controle[1].fill === TRANSPARENTE,
        'a mesma linha so com `color` fica com o fill transparente do cabecalho',
        medido.controle[1] && medido.controle[1].fill);
    ok(medido.controle[1] && medido.controle[1].cor === AMARELO,
        'mesmo com o `color` amarelo escrito nela — e por isso ela nao sai amarela',
        medido.controle[1] && medido.controle[1].cor);

    // ─── Pedido sem evento nao fica com hifen solto ─────────────────────────
    ok(medido.semEvento[0] === '21085',
        'sem evento no briefing, a primeira linha e so o numero', medido.semEvento[0]);
    ok(medido.semEvento.length === 2, 'e a do cliente continua embaixo', medido.semEvento.join(' | '));

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_titulo_do_pedido.png') });
    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); servidor.close(); process.exit(1); });
