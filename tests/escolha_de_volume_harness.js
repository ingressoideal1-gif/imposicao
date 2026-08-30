// A barra "Pesar este volume" tem de estar NA TELA, num Chrome de verdade.
//
// O modo de escolha do volume tem tres pecas: a faixa azul no topo ("Escolha o
// que vai neste volume"), as caixinhas de marcar nos cards, e a barra com a
// conta do que foi marcado e o botao que continua o trabalho.
//
// Essa barra ja errou de lugar DUAS vezes, e das duas quem percebeu foi o
// usuario, na estacao:
//
//   1. Solta no fim da lista de modelos, dentro da area que rola. Numa tela de
//      1366x768, com UM modelo no setor o botao ja ficava 144 px abaixo da area
//      visivel; com quatro, 1.416 px. ("Nao localizei o 4. Pesar este volume,
//      apos selecionar os modelos".)
//   2. Grudada com `position: sticky`. Resolveu de 1280 px de largura para cima
//      e deixou tudo abaixo disso quebrado: o `.prod-table-card` acima dela tem
//      `overflow: hidden`, e ancestral com overflow escondido DESLIGA o sticky
//      do descendente -- e abaixo de 1024 px o painel ainda troca de layout, com
//      outro elemento passando a ser quem rola. Em 1024x768 o botao voltava a
//      2.214 px abaixo da janela; num celular, 4.828 px. ("estou na V703 e ainda
//      nao existe o botao pesar este volume".)
//
// Hoje ela e FIXA contra a janela, no `#acab-barra-escolha`, fora das views --
// a mesma escolha que o Quadro de Avisos ja tinha feito, pelo mesmo motivo.
//
// Duas licoes viraram teste aqui:
//
//   - O harness de regra (`acabamento_harness.js`) nao alcanca isto. Ele mede o
//     HTML que a funcao devolve, e o HTML estava certo as duas vezes. Quem
//     decide se o botao existe PARA O OPERADOR e o layout, e layout so se mede
//     desenhando.
//   - Um tamanho de tela so nao basta. Foi exatamente um tamanho nao medido que
//     deixou a segunda versao passar, entao aqui sao SETE -- do monitor grande
//     ao celular, passando pelo 1024, que e onde a media query vira a chave.
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
    if (rel === '/') rel = '/index.html';
    // Nada de subir de pasta: este servidor so existe para o `frontend/`.
    const alvo = path.join(FRONTEND, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
    if (!alvo.startsWith(FRONTEND) || !fs.existsSync(alvo) || fs.statSync(alvo).isDirectory()) {
        res.writeHead(404); res.end('nao achei'); return;
    }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(fs.readFileSync(alvo));
});

// As telas que a gráfica usa, e as que o usuário pode abrir de fora dela.
// O 1024 esta aqui por nome: e o ponto exato em que o painel troca de layout.
const TAMANHOS = [
    [1920, 1080, 'monitor grande'],
    [1600, 900, 'notebook grande'],
    [1366, 768, 'a estacao comum'],
    [1280, 720, 'monitor menor'],
    [1024, 768, 'o ponto em que o painel vira coluna'],
    [900, 1200, 'tablet em pe'],
    [412, 915, 'celular'],
];

/** Semeia um pedido com `quantos` modelos no Laser. */
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
    window._currentPerms = { perm_acabamento_view: true, perm_acabamento_edit: true,
                             perm_formatos_view: true };
    window.loadOrdens = async () => {};
    window.loadOSItens = async () => {};
    document.body.classList.remove('not-logged-in');
    [...document.querySelectorAll('div')].forEach(e => {
        const s = getComputedStyle(e);
        if (s.position === 'fixed' && e.innerText.indexOf('Acesso local') !== -1) e.style.display = 'none';
    });
    window.showView('view-acabamento');
}

/**
 * Onde uma peca da escolha caiu, em relacao a JANELA.
 *
 * Contra a janela, e nao contra o contorno de algum contêiner: e a janela que o
 * operador enxerga. Foi medir contra o contêiner que deixou passar a versao
 * anterior, que estava certa dentro dele e fora da tela.
 */
function medir(texto, soNaBarra) {
    const onde = soNaBarra ? document.getElementById('acab-barra-escolha') : document;
    const alvo = onde ? [...onde.querySelectorAll('button, strong')]
        .find(e => e.textContent.trim().indexOf(texto) !== -1) : null;
    if (!alvo) return { achou: false };
    const r = alvo.getBoundingClientRect();
    const barra = alvo.closest('#acab-barra-escolha');
    const corpo = document.getElementById('acab-detalhe-corpo');
    return {
        achou: true,
        naJanela: r.top >= 0 && r.bottom <= window.innerHeight && r.height > 0 && r.width > 0,
        topo: Math.round(r.top),
        altura: window.innerHeight,
        naBarraFixa: !!barra,
        posicao: getComputedStyle(barra || alvo.parentElement).position,
        sobraParaRolar: corpo ? Math.round(corpo.scrollHeight - corpo.clientHeight) : 0,
        // O que estiver por cima do meio do botao. Se nao for o proprio botao,
        // alguma outra camada o esta cobrindo.
        porCima: (() => {
            const e = document.elementFromPoint(
                Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
            return e === alvo || alvo.contains(e) ? 'o proprio botao' : (e ? (e.id || e.className || e.tagName) : 'nada');
        })(),
    };
}

(async () => {
    await new Promise(r => servidor.listen(0, '127.0.0.1', r));
    const porta = servidor.address().port;

    const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
    const page = await browser.newPage();
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
                body: (u.indexOf('/rest/v1/') !== -1 || u.indexOf('/functions/v1/') !== -1) ? '[]' : '',
            });
        }
        req.continue();
    });

    await page.setViewport({ width: 1366, height: 768 });
    await page.goto('http://127.0.0.1:' + porta + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.AcabamentoPainel && window.showView, { timeout: 30000 });

    /**
     * Abre o pedido e marca os modelos.
     *
     * Desde 29/08/2026 nao ha MODO: as caixas de marcar ficam sempre na tela, e
     * a barra aparece quando algo e marcado. O que continua igual -- e e o que
     * este arquivo mede -- e a barra ser fixa contra a janela.
     */
    async function entrarNaEscolha(quantos, marcar) {
        await page.evaluate(semear, quantos);
        await page.evaluate(() => window.AcabamentoPainel.abrirPedido('os-1'));
        await page.waitForFunction(() =>
            document.getElementById('acab-detalhe-corpo').innerHTML.indexOf('volume') !== -1,
            { timeout: 30000 });
        await page.evaluate((ids) => {
            ids.forEach(id => window.AcabamentoPainel.marcarModelo(id));
        }, marcar);
    }

    // ─── O botao na tela, em cada tamanho ────────────────────────────────────
    for (const [w, h, apelido] of TAMANHOS) {
        await page.setViewport({ width: w, height: h });
        await entrarNaEscolha(4, [3001, 3003]);

        const m = await page.evaluate(medir, 'Registrar');
        ok(m.achou, `${w}x${h} (${apelido}): o botao "Registrar num volume" existe`);
        ok(m.naJanela, `${w}x${h} (${apelido}): e esta dentro da janela`,
            m.achou ? `topo em ${m.topo} de ${m.altura}` : 'nao achei o botao');
        ok(m.naBarraFixa && m.posicao === 'fixed',
            `${w}x${h}: porque a barra e FIXA contra a janela, fora do detalhe`,
            'naBarraFixa=' + m.naBarraFixa + ' position=' + m.posicao);
        ok(m.porCima === 'o proprio botao',
            `${w}x${h}: e nada esta por cima dele`, m.porCima);
    }

    // ─── A conta e a saida moram na mesma barra ──────────────────────────────
    await page.setViewport({ width: 1366, height: 768 });
    await entrarNaEscolha(4, [3001, 3003]);

    const conta = await page.evaluate(medir, '2 modelos marcados');
    ok(conta.achou && conta.naJanela, 'a conta do que foi marcado esta na tela com ele');

    // O Desmarcar: a saida da escolha precisa estar ao alcance de quem acabou
    // de rolar a lista inteira.
    const cancelar = await page.evaluate(medir, 'Desmarcar', true);
    ok(cancelar.achou && cancelar.naJanela,
        'e o Desmarcar da barra tambem -- a saida da escolha nao pode ficar fora da tela',
        cancelar.achou ? ('topo em ' + cancelar.topo + ' de ' + cancelar.altura) : 'nao achei');

    // Rolar a lista inteira nao tira nenhum dos dois de vista.
    await page.evaluate(() => {
        const c = document.getElementById('acab-detalhe-corpo');
        c.scrollTop = c.scrollHeight;
    });
    const depoisDeRolar = await page.evaluate(medir, 'Registrar');
    ok(depoisDeRolar.naJanela, 'rolado ate o fim da lista, o botao continua na tela',
        'topo em ' + depoisDeRolar.topo + ' de ' + depoisDeRolar.altura);

    // A lista precisa mesmo rolar: sem isso o teste nao estaria provando nada.
    ok(depoisDeRolar.sobraParaRolar > 0,
        'e a lista de modelos passa MESMO da area visivel',
        depoisDeRolar.sobraParaRolar + ' px de sobra');

    await page.screenshot({ path: path.join(RAIZ, 'tests', '_escolha_de_volume.png') });

    // ─── Sair da escolha tira a barra da tela ────────────────────────────────
    await page.evaluate(() => window.AcabamentoPainel.cancelarVolume());
    const saiu = await page.evaluate(medir, 'Registrar');
    ok(!saiu.achou, 'desmarcar tira a barra da tela -- ela e fixa, nao sai sozinha');

    // E fechar o pedido tambem, mesmo com a escolha em curso.
    await entrarNaEscolha(4, [3001]);
    await page.evaluate(() => window.AcabamentoPainel.fecharPedido());
    const fechou = await page.evaluate(medir, 'Registrar');
    ok(!fechou.achou,
        'e voltar para a lista tambem -- senao a barra boiaria sobre os pedidos');

    // ─── Sair do Acabamento tambem tira a barra ──────────────────────────────
    //
    // Ela e fixa contra a JANELA e nao pertence a nenhuma view: sem isto,
    // continuaria boiando por cima da tela de Formatos.
    await page.setViewport({ width: 1366, height: 768 });
    await entrarNaEscolha(4, [3001]);
    const antesDeTrocar = await page.evaluate(medir, 'Registrar');
    ok(antesDeTrocar.achou, 'com a escolha em curso, a barra esta na tela');

    const trocou = await page.evaluate(() => {
        window.showView('view-formatos');
        const acab = document.getElementById('view-acabamento');
        return !(acab && acab.classList.contains('active'));
    });
    ok(trocou, 'a troca de tela aconteceu mesmo -- sem isso o teste abaixo nao prova nada');
    const noutraTela = await page.evaluate(medir, 'Registrar');
    ok(!noutraTela.achou, 'trocar de tela tira a barra do Acabamento junto');

    await page.evaluate(() => window.showView('view-acabamento'));

    // ─── O CONTROLE: dentro do detalhe, o botao volta a sumir ────────────────
    //
    // E ele que da sentido a tudo acima. Se um dia este controle passar a dizer
    // que o botao ficaria visivel dentro do detalhe, e porque o layout do painel
    // mudou -- e a barra fixa deixou de estar resolvendo alguma coisa.
    await page.setViewport({ width: 1024, height: 768 });
    await entrarNaEscolha(4, [3001]);
    const controle = await page.evaluate(() => {
        const corpo = document.getElementById('acab-detalhe-corpo');
        const barra = document.getElementById('acab-barra-escolha');
        const b = [...barra.querySelectorAll('button')]
            .find(x => x.textContent.trim().indexOf('Registrar') !== -1);
        // De volta para onde ela morava: no fim da lista, dentro do que rola.
        const solta = barra.firstElementChild;
        solta.style.position = 'sticky';
        solta.style.bottom = '0';
        corpo.appendChild(solta);
        corpo.scrollTop = 0;
        const r = b.getBoundingClientRect();
        return {
            naJanela: r.top >= 0 && r.bottom <= window.innerHeight,
            topo: Math.round(r.top),
            altura: window.innerHeight,
        };
    });
    ok(!controle.naJanela,
        'de volta para dentro do detalhe, em 1024x768, o botao cai fora da janela',
        'topo em ' + controle.topo + ' de ' + controle.altura);

    // ─── O balao do drop precisa ter cor de fundo ────────────────────────────
    //
    // Em 29/08/2026 o seletor do responsavel ficou `background: transparent`
    // para nao desenhar moldura dentro da caixa. A caixa continuou igual, e a
    // LISTA sumiu: no Windows o Chrome pinta o balao do `<select>` com a cor de
    // fundo dele, e sem cor o balao sai branco -- com o texto em #ffffff, os
    // nomes ficam brancos no branco. O usuario abriu o drop e viu um retangulo
    // vazio.
    //
    // O balao nativo nao da para fotografar daqui, mas a cor COMPUTADA da.
    await page.setViewport({ width: 1366, height: 768 });
    await entrarNaEscolha(4, []);
    const drop = await page.evaluate(() => {
        const alvos = [...document.querySelectorAll('#acab-detalhe-corpo select, #acab-lateral-resumo select')];
        return alvos.map(sel => {
            const cs = getComputedStyle(sel);
            const op = sel.options[sel.options.length - 1];
            const co = op ? getComputedStyle(op) : null;
            return {
                selFundo: cs.backgroundColor,
                opFundo: co ? co.backgroundColor : 'sem opcao',
                opCor: co ? co.color : 'sem opcao',
            };
        });
    });
    const transparente = c => !c || c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    ok(drop.length > 0, 'ha drops na tela do pedido', String(drop.length));
    ok(drop.every(d => !transparente(d.selFundo)),
        'nenhum select fica transparente -- o balao da lista sairia branco no Windows',
        JSON.stringify(drop.find(d => transparente(d.selFundo)) || {}));
    ok(drop.every(d => d.opFundo === 'sem opcao' || !transparente(d.opFundo)),
        'e as opcoes tambem tem fundo proprio',
        JSON.stringify(drop.find(d => d.opFundo !== 'sem opcao' && transparente(d.opFundo)) || {}));

    ok(erros.length === 0, 'a tela nao soltou erro nenhum', erros.join(' | '));

    await browser.close();
    servidor.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da escolha de volume passaram.');
})().catch(e => { console.error(String(e && e.stack || e)); servidor.close(); process.exit(1); });
