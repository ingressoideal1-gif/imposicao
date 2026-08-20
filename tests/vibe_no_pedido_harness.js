// O botao do Vibe dentro do pedido, montado num Chrome de verdade.
//
// O harness estatico (`link_do_pedido_harness.js`) prova que a funcao existe,
// que o encaixe existe e que o render escreve nele. O que ele NAO consegue
// provar e que o resultado aparece: o encaixe fica dentro de um `<span>` de
// 1.45rem que mora num container `flex-direction: column`, e um botao que
// nasce fora da tela, com altura zero ou empurrando o nome do cliente para
// baixo passaria em todos os testes de texto.
//
// Entao aqui a pagina e montada de verdade: o cabecalho sai do index.html, a
// funcao sai do script.js, e o navegador diz onde cada coisa ficou.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── Os pedacos reais, recortados dos arquivos reais ─────────────────────────

function recortarFuncao(nome) {
    const i = SCRIPT.indexOf('function ' + nome);
    if (i < 0) throw new Error('funcao ' + nome + ' nao encontrada no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

const iBanner = HTML.indexOf('<div id="amostras-os-banner"');
const bannerHtml = HTML.slice(iBanner, HTML.indexOf('</div>', HTML.indexOf('id="btn-toggle-entrega-dados"')) + 6);

const codigo = [
    "const ABA_DO_VIBE = 'vibe-ideal';",
    "const ABA_DO_PEDIDO_NO_VIBE = 'pedido';",
    recortarFuncao('linkDoPedidoNoVibe'),
    recortarFuncao('botaoDoVibeHtml'),
].join('\n');

// Servido por http de verdade, e nao por `setContent`: o Chrome recusa carregar
// `file://` a partir de um documento `about:blank`, e o `icon-vibe.png` do botao
// apareceria quebrado -- o que falsearia justamente a prova visual.
const PAGINA = '<!doctype html><meta charset="utf-8">'
    + '<style>body{margin:0;padding:24px;background:#0f172a;color:#fff;'
    + 'font-family:system-ui,sans-serif}:root{--text-dim:#94a3b8}</style>'
    + '<body>' + bannerHtml + '</body>';

const servidor = http.createServer((req, res) => {
    if (req.url.indexOf('icon-vibe.png') >= 0) {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(fs.readFileSync(path.join(RAIZ, 'frontend', 'icon-vibe.png')));
        return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGINA);
});

(async () => {
    await new Promise(r => servidor.listen(0, r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 400 });

    await page.goto('http://localhost:' + porta + '/', { waitUntil: 'networkidle0' });

    // O que o `renderAmostrasOSItens` faz com o cabecalho, na mesma ordem.
    const medido = await page.evaluate((codigo) => {
        eval(codigo);
        const banner = document.getElementById('amostras-os-banner');
        banner.style.display = 'flex';
        document.getElementById('amostras-os-numero').textContent = '#20928';
        document.getElementById('amostras-os-cliente').textContent = 'Patrick Soares Furtado - 28449';
        const vibeEl = document.getElementById('amostras-os-vibe');
        const os = { numero: '20928' };
        vibeEl.innerHTML = os.numero ? botaoDoVibeHtml(os.numero) : '';

        const a = vibeEl.querySelector('a');
        const r = a ? a.getBoundingClientRect() : null;
        const rNum = document.getElementById('amostras-os-numero').getBoundingClientRect();
        const rCli = document.getElementById('amostras-os-cliente').getBoundingClientRect();
        const img = a ? a.querySelector('img') : null;

        return {
            achou: !!a,
            href: a ? a.getAttribute('href') : null,
            target: a ? a.getAttribute('target') : null,
            texto: a ? a.textContent.trim() : null,
            largura: r ? Math.round(r.width) : 0,
            altura: r ? Math.round(r.height) : 0,
            dentroDaTela: r ? (r.top >= 0 && r.left >= 0 && r.right <= window.innerWidth) : false,
            depoisDoNumero: r && rNum ? r.left >= rNum.right : false,
            antesDoCliente: r && rCli ? r.right <= rCli.left : false,
            naMesmaLinhaDoNumero: r && rNum ? Math.abs((r.top + r.height / 2) - (rNum.top + rNum.height / 2)) <= 4 : false,
            temIcone: !!img,
            iconePedido: img ? img.getAttribute('src') : null,
        };
    }, codigo);

    // ─── O botao existe e leva ao lugar certo ────────────────────────────────
    ok(medido.achou, 'o botao do Vibe aparece dentro do cabecalho do pedido');
    ok(medido.href === 'https://vibe.ai-ideal.com.br/orcamentos/20928/editar?tab=pedido',
        'apontando para o pedido no menu Pedido do parceiro', medido.href);
    ok(medido.target === 'vibe-ideal', 'na aba nomeada, que ele reaproveita', medido.target);
    ok(medido.texto === 'Vibe', 'com o rotulo em texto ao lado do icone', JSON.stringify(medido.texto));
    ok(medido.temIcone && medido.iconePedido === 'icon-vibe.png',
        'e pedindo o icone do parceiro', medido.iconePedido);

    // O caminho do icone e RELATIVO, e o painel roda com `<base href="/">`: se o
    // arquivo mudar de nome ou de pasta, o `alt` cobre o buraco e o teste de
    // texto continua passando -- so o `naturalWidth` denuncia.
    await page.waitForFunction(
        () => { const i = document.querySelector('#amostras-os-vibe img'); return i && i.complete; },
        { timeout: 5000 },
    );
    const icone = await page.evaluate(() => {
        const i = document.querySelector('#amostras-os-vibe img');
        return { largura: i.naturalWidth, altura: i.naturalHeight };
    });
    ok(icone.largura > 0, 'e o icone carrega mesmo, em vez do texto alternativo', JSON.stringify(icone));

    // ─── E da para clicar nele ───────────────────────────────────────────────
    ok(medido.largura > 40 && medido.altura > 14,
        'ele tem tamanho de alvo de clique', medido.largura + 'x' + medido.altura);
    ok(medido.dentroDaTela, 'e cai dentro da area visivel');

    // ─── Sem empurrar o resto do cabecalho ───────────────────────────────────
    ok(medido.depoisDoNumero, 'fica depois do numero do pedido');
    ok(medido.antesDoCliente, 'e antes do nome do cliente');
    ok(medido.naMesmaLinhaDoNumero,
        'na mesma linha do numero, sem quebrar o cabecalho em duas alturas');

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_vibe_no_pedido.png') });

    // ─── Pedido avulso nao tem numero ────────────────────────────────────────
    const vazio = await page.evaluate((codigo) => {
        eval(codigo);
        const vibeEl = document.getElementById('amostras-os-vibe');
        const os = {};
        vibeEl.innerHTML = os.numero ? botaoDoVibeHtml(os.numero) : '';
        return { html: vibeEl.innerHTML, altura: Math.round(vibeEl.getBoundingClientRect().height) };
    }, codigo);
    ok(vazio.html === '', 'sem numero, o encaixe fica vazio -- nada de /orcamentos/undefined', vazio.html);

    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); process.exit(1); });
