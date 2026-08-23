// A barra "Pesar este volume" tem de estar NA TELA, num Chrome de verdade.
//
// O modo de escolha do volume tem tres pecas: a faixa azul no topo ("Escolha o
// que vai neste volume"), as caixinhas de marcar nos cards, e a barra do fim,
// com a conta do que foi marcado e o botao que continua o trabalho.
//
// A barra nasceu SOLTA, no fim da lista de modelos, dentro da area que rola. O
// resultado, medido nesta tela de 1366x768: com UM modelo no setor o botao ja
// ficava 144 px abaixo da area visivel; com quatro, 1.416 px. O operador
// marcava os modelos e nao via acontecer nada -- o unico botao que segue adiante
// estava la embaixo, onde ninguem procura. O usuario relatou exatamente isso:
// "Nao localizei o 4. Pesar este volume, apos selecionar os modelos".
//
// O harness de regra (`acabamento_harness.js`) nao alcanca isso: ele mede o HTML
// que a funcao devolve, e o HTML estava certo o tempo todo. Quem decide se o
// botao existe PARA O OPERADOR e o layout -- e layout so se mede desenhando.
//
// Por isso este teste desenha a tela inteira e pergunta uma coisa so: o botao
// esta dentro da area visivel? E, como CONTROLE, tira o `position: sticky` e
// pergunta de novo -- se o controle passar a ficar visivel sozinho, e porque a
// lista encolheu ou a area cresceu, e o `sticky` virou enfeite que ninguem
// entende mais.
//
// Nada sai desta maquina: CDN nenhum, banco nenhum, rede nenhuma.
const fs = require('fs');
const http = require('http');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const FRONTEND = path.join(RAIZ, 'frontend');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

// ─── O servidor de arquivos, so do `frontend/` ───────────────────────────────
const TIPOS = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
};

const servidor = http.createServer((req, res) => {
    let rel = decodeURIComponent(req.url.split('?')[0]);
    if (rel === '/' ) rel = '/index.html';
    // Nada de subir de pasta: este servidor so existe para o `frontend/`.
    const alvo = path.join(FRONTEND, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
    if (!alvo.startsWith(FRONTEND) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
        res.writeHead(404); res.end('nao achei'); return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(fs.readFileSync(alvo));
});

/** Semeia um pedido com `quantos` modelos no Laser e entra no modo de escolha. */
function semear(quantos) {
    state.ordens = [{ id: 'os-1', numero: 21085, cliente: 'Expointer', status_interno: 'PRODUCAO' }];
    state.cores = [{ id: 7, name: 'Vermelho', cor_referencia: '#e11d48' }];
    state.numeracoes = [{ id: 9, name: 'QR Ideal VIP', tipo: 'QR_IDEAL' }];
    state.produtosGlobais = [{ id_produto: 55, nomeReal: 'Credencial', setor_pcp: 'LASER' }];
    state.osItens = { 'os-1': [] };
    for (let n = 0; n < quantos; n++) {
        state.osItens['os-1'].push({
            id: 3001 + n, produto: 'Credencial ' + (n + 1), modelo: String(3001 + n),
            _vibe_id_produto: 55, setor: 'LASER', amostra_cor_id: 7, amostra_num_id: 9,
            qtd: 1000 * (n + 1), status_impressao: 'Impresso',
            acabamento_status: 'Em acabamento', acabamento_responsavel: 'Ana Paula',
        });
    }
    window._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: true };
    window.loadOrdens = async () => {};
    window.loadOSItens = async () => {};
    document.body.classList.remove('not-logged-in');
    [...document.querySelectorAll('div')].forEach(e => {
        const s = getComputedStyle(e);
        if (s.position === 'fixed' && e.innerText.indexOf('Acesso local') !== -1) e.style.display = 'none';
    });
    window.showView('view-acabamento');
}

/** Onde uma peca da escolha caiu, em relacao a area que rola. */
function medir(texto) {
    const corpo = document.getElementById('acab-detalhe-corpo');
    const alvo = [...corpo.querySelectorAll('button, strong')]
        .find(e => e.textContent.trim().indexOf(texto) !== -1);
    if (!alvo) return { achou: false };
    const ra = alvo.getBoundingClientRect();
    const rc = corpo.getBoundingClientRect();
    return {
        achou: true,
        visivel: ra.top < rc.bottom && ra.bottom > rc.top && ra.height > 0,
        abaixoDaArea: Math.round(ra.top - rc.bottom),
        sobraParaRolar: Math.round(corpo.scrollHeight - corpo.clientHeight),
        posicao: getComputedStyle(alvo.closest('div[style*="sticky"]') || alvo.parentElement).position,
    };
}

(async () => {
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
    // A tela da estacao da grafica.
    await page.setViewport({ width: 1366, height: 768 });

    const erros = [];
    page.on('pageerror', e => erros.push(e.message));

    await page.setRequestInterception(true);
    page.on('request', req => {
        const u = req.url();
        // Nada sai desta maquina: CDN, banco e agente respondem vazio daqui.
        if (u.indexOf('127.0.0.1:' + porta) === -1) {
            return req.respond({
                status: 200,
                contentType: u.endsWith('.css') ? 'text/css' : 'application/javascript',
                headers: { 'Access-Control-Allow-Origin': '*' },
                body: u.indexOf('/rest/v1/') !== -1 || u.indexOf('/functions/v1/') !== -1 ? '[]' : '',
            });
        }
        req.continue();
    });

    await page.exposeFunction('_nada', () => {});
    await page.goto('http://127.0.0.1:' + porta + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.AcabamentoPainel && window.showView, { timeout: 30000 });

    // ─── Um modelo so: o caso mais magro que existe ──────────────────────────
    await page.evaluate(semear, 1);
    await page.evaluate(() => window.AcabamentoPainel.abrirPedido('os-1'));
    await page.waitForFunction(() =>
        document.getElementById('acab-detalhe-corpo').innerHTML.indexOf('volume') !== -1,
        { timeout: 30000 });

    await page.evaluate(() => {
        window.AcabamentoPainel.novoVolume('LASER', 21085);
        window.AcabamentoPainel.marcarModelo(3001);
    });

    const magro = await page.evaluate(medir, 'Pesar este volume');
    ok(magro.achou, 'com 1 modelo, o botao "Pesar este volume" existe na tela');
    ok(magro.sobraParaRolar > 0,
        'e a lista JA passa da area visivel -- por isso o botao solto sumia',
        magro.sobraParaRolar + ' px de sobra');
    ok(magro.visivel, 'com 1 modelo o botao esta dentro da area visivel',
        magro.visivel ? '' : magro.abaixoDaArea + ' px abaixo do fim da area');
    ok(magro.posicao === 'sticky', 'porque a barra e grudada na base da area', magro.posicao);

    const faixa = await page.evaluate(medir, 'Escolha o que vai neste volume');
    ok(faixa.achou && faixa.visivel, 'e a faixa que diz o setor tambem esta na tela');

    // ─── Quatro modelos: a lista que a grafica ve de verdade ─────────────────
    await page.evaluate(semear, 4);
    await page.evaluate(() => window.AcabamentoPainel.abrirPedido('os-1'));
    await page.waitForFunction(() =>
        document.getElementById('acab-detalhe-corpo').innerHTML.indexOf('volume') !== -1,
        { timeout: 30000 });
    await page.evaluate(() => {
        window.AcabamentoPainel.novoVolume('LASER', 21085);
        window.AcabamentoPainel.marcarModelo(3001);
        window.AcabamentoPainel.marcarModelo(3003);
    });

    const cheio = await page.evaluate(medir, 'Pesar este volume');
    ok(cheio.visivel, 'com 4 modelos o botao continua na tela',
        cheio.visivel ? '' : cheio.abaixoDaArea + ' px abaixo do fim da area');

    const conta = await page.evaluate(medir, '2 modelos escolhidos');
    ok(conta.achou && conta.visivel,
        'e a conta do que foi marcado esta ao lado dele, visivel');

    // A faixa do topo continua la depois de rolar ate o fim.
    await page.evaluate(() => {
        const c = document.getElementById('acab-detalhe-corpo');
        c.scrollTop = c.scrollHeight;
    });
    const faixaRolada = await page.evaluate(medir, 'Escolha o que vai neste volume');
    ok(faixaRolada.visivel,
        'rolado ate o fim, a faixa do setor continua no topo -- e o Cancelar com ela',
        faixaRolada.visivel ? '' : faixaRolada.abaixoDaArea + ' px fora');

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_escolha_de_volume.png') });

    // ─── O CONTROLE: sem o `sticky`, o botao volta a sumir ───────────────────
    //
    // E ele que da sentido ao teste de cima. Se um dia este controle passar a
    // dizer que o botao solto esta visivel, e porque a tela mudou de tamanho ou
    // a lista encolheu -- e o `sticky` deixou de estar segurando alguma coisa.
    const controle = await page.evaluate(() => {
        const corpo = document.getElementById('acab-detalhe-corpo');
        const b = [...corpo.querySelectorAll('button')]
            .find(x => x.textContent.trim().indexOf('Pesar este volume') !== -1);
        // Se a barra ja nao for grudada, o teste de cima ja falhou: aqui basta
        // nao explodir, para o relatorio sair inteiro.
        const barra = b.closest('div[style*="sticky"]');
        if (barra) barra.style.position = 'static';
        corpo.scrollTop = 0;
        const ra = b.getBoundingClientRect();
        const rc = corpo.getBoundingClientRect();
        return {
            visivel: ra.top < rc.bottom && ra.bottom > rc.top,
            abaixoDaArea: Math.round(ra.top - rc.bottom),
        };
    });
    ok(!controle.visivel,
        'tirando o `sticky`, o botao volta a cair fora da area -- era esse o defeito',
        'visivel=' + controle.visivel + ' (' + controle.abaixoDaArea + ' px abaixo)');

    ok(erros.length === 0, 'a tela nao soltou erro nenhum', erros.join(' | '));

    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da escolha de volume passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); servidor.close(); process.exit(1); });
