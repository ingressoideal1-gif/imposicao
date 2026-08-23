// A barra de avisos desenhada num Chrome de verdade.
//
// O harness de regra (`avisos_harness.js`) prova o que o `avisos.js` decide:
// qual aviso, para qual painel, quem pode confirmar. O que ele NAO alcanca e a
// tela — e aqui ha duas coisas que so aparecem no pixel:
//
//   1. a barra e o TOAST nascem no mesmo canto de baixo. O toast esta a 24px da
//      base desde sempre, e o operador o procura ali; a barra publica a propria
//      altura em `--avisos-altura` e o CSS empurra o toast para cima dela. Se
//      essa composicao quebrar, o aviso de "peso gravado" cai por cima do
//      recado e ninguem percebe olhando o codigo;
//
//   2. a barra e lida DE PE, a um metro da maquina. O texto do recado tem de
//      chegar grande ao pixel, e nao so no `font-size` que o codigo escreveu.
//
// A pagina de teste monta as pecas REAIS: o `style.css` do app, o HTML que o
// `avisos.js` produziu de verdade (extraido rodando o modulo num DOM de
// mentira, como o outro harness faz) e o `.toast-container` como ele existe.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const FONTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'avisos.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── O HTML da barra, produzido pelo modulo de verdade ──────────────────────

function criarElemento(id) {
    const classes = new Set();
    const el = {
        id, textContent: '', innerHTML: '', value: '',
        style: { display: '', setProperty(k, v) { this[k] = v; } },
        filhos: [], atributos: {},
        classList: {
            add: c => classes.add(c), remove: c => classes.delete(c),
            contains: c => classes.has(c),
            toggle: (c, on) => { if (on) classes.add(c); else classes.delete(c); },
        },
        getAttribute: n => (el.atributos[n] !== undefined ? el.atributos[n] : null),
        setAttribute: (n, v) => { el.atributos[n] = v; },
        appendChild: f => { el.filhos.push(f); },
        addEventListener: () => {},
        getBoundingClientRect: () => ({ height: el.innerHTML ? 76 : 0, width: 1180 }),
        querySelectorAll: sel => (sel === '.filter-btn-pill'
            ? el.filhos.filter(f => f.classList.contains('filter-btn-pill')) : []),
        querySelector: () => null,
    };
    return el;
}

function cadeia(resposta) {
    const c = {
        select: () => c, eq: () => c, in: () => c, order: () => c,
        then: (res, rej) => Promise.resolve(resposta).then(res, rej),
    };
    return c;
}

const AVISO = {
    id: 'a1', painel: 'producao', setor: 'FLEXO',
    texto: 'Tinta branca do Flexo em manutenção até quinta-feira. Arte com branco vai para a Laser — falar com o PCP antes de montar a folha.',
    prioridade: 'normal', vale_ate: null, ativo: true,
    publicado_por: 'junior', publicado_em: '2026-08-23T07:40:00Z',
};

const OPERADORES = [
    { id: 1, nome: 'Ana Paula', role: 'impressor', ativo: true },
    { id: 2, nome: 'Carlos M.', role: 'impressor', ativo: true },
    { id: 3, nome: 'Diego S.', role: 'impressor', ativo: true },
];

async function htmlDaBarra() {
    const elementos = {};
    const documento = {
        documentElement: criarElemento('html'),
        getElementById(id) {
            if (!elementos[id]) elementos[id] = criarElemento(id);
            return elementos[id];
        },
        addEventListener: () => {},
    };
    documento.getElementById('view-lista-impressao').classList.add('active');
    documento.getElementById('filter-container-setor');

    const banco = {
        from(tabela) {
            if (tabela === 'imposition_avisos') return { select: () => cadeia({ data: [AVISO], error: null }) };
            if (tabela === 'imposition_avisos_leituras') {
                return {
                    select: () => cadeia({ data: [{ aviso_id: 'a1', nome: 'Ana Paula', lido_em: '2026-08-23T07:52:00Z' }], error: null }),
                };
            }
            if (tabela === 'imposition_operadores') return { select: () => cadeia({ data: OPERADORES, error: null }) };
            return { select: () => cadeia({ data: [], error: null }) };
        },
    };

    const janela = {
        escapeHtml: v => String(v === undefined || v === null ? '' : v)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
        toast: () => {},
    };

    new Function('window', 'document', 'supabaseClient', FONTE)(janela, documento, banco);
    await janela.AvisosPainel.recarregar();

    return {
        html: elementos['barra-avisos'].innerHTML,
        altura: documento.documentElement.style['--avisos-altura'],
    };
}

// ─── A pagina, com as pecas reais ───────────────────────────────────────────

(async () => {
    const { html, altura } = await htmlDaBarra();
    ok(!!html, 'o modulo produziu a barra', html ? '' : '(vazio)');
    ok(altura === '90px', 'e publicou a altura dela', altura);

    const PAGINA = '<!doctype html><meta charset="utf-8">'
        + '<style>' + CSS + '</style>'
        + '<style>html{--avisos-altura:' + altura + ';}'
        + 'body{margin:0;height:100vh;background:#0a0f1e;}</style>'
        + '<body>'
        + '<div id="barra-avisos" class="barra-avisos">' + html + '</div>'
        + '<div class="toast-container"><div class="toast toast-success">Peso gravado</div></div>'
        + '</body>';

    const servidor = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(PAGINA);
    });
    await new Promise(r => servidor.listen(0, r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto('http://localhost:' + porta + '/', { waitUntil: 'networkidle0' });

    const medido = await page.evaluate(() => {
        const barra = document.querySelector('.barra-avisos');

        // O que o `medirAltura` do avisos.js faz no navegador: a altura REAL da
        // barra, mais 14px de folga, vai para a variavel. Aqui ela precisa ser
        // recalculada porque o DOM de mentira nao quebra linha — o texto do
        // recado ocupa mais no Chrome do que ocuparia num retangulo imaginario.
        // Que a formula seja essa e o outro harness que trava; o que se mede
        // AQUI e se, com ela, o toast realmente sai de cima do recado.
        document.documentElement.style.setProperty(
            '--avisos-altura', (Math.round(barra.getBoundingClientRect().height) + 14) + 'px');

        const toast = document.querySelector('.toast-container');
        const b = barra.getBoundingClientRect();
        const t = toast.getBoundingClientRect();
        const recado = [...barra.querySelectorAll('div')]
            .find(d => d.textContent.indexOf('Tinta branca') === 0);
        return {
            barra: { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), altura: Math.round(b.height) },
            toast: { bottom: Math.round(t.bottom) },
            recadoPx: recado ? parseFloat(getComputedStyle(recado).fontSize) : 0,
            janela: { largura: window.innerWidth, altura: window.innerHeight },
            rolagem: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        };
    });

    // ─── A barra fica na base, e dentro da tela ─────────────────────────────
    ok(medido.janela.altura - medido.barra.bottom <= 24,
        'a barra encosta na base da janela',
        'sobra ' + (medido.janela.altura - medido.barra.bottom) + 'px');
    ok(medido.barra.left >= 56,
        'e comeca depois do menu lateral encolhido', 'left=' + medido.barra.left);
    ok(!medido.rolagem, 'sem empurrar a pagina para o lado');

    // ─── O toast sobe ───────────────────────────────────────────────────────
    //
    // A conta e a do CSS: o toast fica 24px acima do que a barra ocupou.
    ok(medido.toast.bottom <= medido.barra.top,
        'o toast passa a nascer ACIMA da barra, em vez de cair sobre o recado',
        'toast termina em ' + medido.toast.bottom + ', barra comeca em ' + medido.barra.top);

    // ─── O recado e grande o bastante para ser lido de pe ───────────────────
    ok(medido.recadoPx >= 17,
        'o texto do aviso chega grande ao pixel', medido.recadoPx + 'px');

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_avisos_na_tela.png') });
    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
