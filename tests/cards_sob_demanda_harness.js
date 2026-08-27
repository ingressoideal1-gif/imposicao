// OS CARDS DO PEDIDO DESENHAM CONFORME O OPERADOR ROLA (26/08/2026).
//
// Ate aqui, abrir um pedido disparava um laco que desenhava TODOS os cards, em
// serie, com 20 ms de pausa entre um e outro -- estivessem na tela ou nao. Num
// pedido de 52 modelos isso e 52 desenhos completos enquanto o operador olha
// para os dois primeiros.
//
// Este arnes roda num Chrome DE VERDADE, e nao num DOM de mentira, porque a
// peca central e o `IntersectionObserver`: ele nao dispara para elemento
// escondido, e observar o canvas do card (que nasce `display:none`) deixaria o
// pedido inteiro em branco, para sempre. Um duble de observer nunca contaria
// essa historia -- ele diria que tudo funciona.
//
// O que se mede:
//   1. so os cards visiveis desenham na abertura;
//   2. rolar desenha os que aparecem, e so uma vez cada;
//   3. `desenharTodosOsCards` alcanca os que ninguem rolou (o PDF Prova);
//   4. REDESENHAR a lista redesenha os cards -- foi aqui que a primeira
//      versao falhou em producao: ela guardava a conta por pedido, e cada
//      renderizacao reescreve o DOM. Os cards desenhavam e sumiam.
const fs = require('fs');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrair(nome) {
    let i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) i = SCRIPT.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

const CODIGO = ['cardTemOqueDesenhar', 'desenharCardsAoAparecer', 'desenharTodosOsCards']
    .map(extrair).join('\n');

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 700 });
    const erros = [];
    page.on('pageerror', e => erros.push(String(e)));

    await page.setRequestInterception(true);
    page.on('request', r => r.url().startsWith('http://exemplo.local/')
        ? r.respond({ status: 200, contentType: 'text/html',
            body: '<html><body style="margin:0"><div id="cont"></div></body></html>' })
        : r.continue());
    await page.goto('http://exemplo.local/pedido');

    // 52 cards de 400px: cabem ~2 na janela de 700px. A ancora e a MESMA que o
    // card real usa -- o cabecalho do modelo.
    await page.evaluate((codigo) => {
        const cont = document.getElementById('cont');
        cont.innerHTML = Array.from({ length: 52 }, (_, i) =>
            `<div style="height:400px;border-bottom:1px solid #ccc">
               <div id="amostra-item-header-${i}">Modelo ${i}</div>
               <canvas id="amostra-item-canvas-${i}" style="display:none"></canvas>
             </div>`).join('');

        window.state = { osItens: {}, numeracoes: [] };
        window.desenhados = [];
        // Os dubles do mundo em volta. `renderItemAmostraCombinada` so anota
        // quem foi desenhado -- o que se mede aqui e QUANDO ele e chamado.
        window.renderItemAmostraCombinada = async (idx) => { window.desenhados.push(idx); };
        window.travarCardsDeModelosAprovados = () => {};
        window.atualizarBarraFinalCliente = () => {};
        // eslint-disable-next-line no-eval
        eval(codigo + '\nwindow.desenharCardsAoAparecer = desenharCardsAoAparecer;'
                    + '\nwindow.desenharTodosOsCards = desenharTodosOsCards;'
                    + '\nwindow.cardTemOqueDesenhar = cardTemOqueDesenhar;');
    }, CODIGO);

    const itens = Array.from({ length: 52 }, (_, i) => ({ id: 'i' + i, amostra_num_id: 'n1' }));
    const abrir = async (osId) => {
        await page.evaluate((osId, itens) => {
            window.desenharCardsAoAparecer(osId, itens, document.getElementById('cont'));
        }, osId, itens);
        await new Promise(r => setTimeout(r, 400));
    };

    // ── 1. Abertura: so o que esta na tela (mais a folga do rootMargin) ──────
    await abrir('os-1');
    let feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length > 0, 'algum card desenha na abertura — a tela nao fica em branco', feitos.length);
    ok(feitos.length < 52, 'mas NAO os 52: esse era o defeito', feitos.length);
    ok(feitos.includes(0), 'o primeiro card, que o operador esta olhando, desenha', feitos);
    ok(!feitos.includes(51), 'e o ultimo, a 20 mil pixels dali, nao', feitos.length);
    const naAbertura = feitos.length;

    // ── 2. Rolar desenha o que aparece, e so uma vez ────────────────────────
    await page.evaluate(() => window.scrollTo(0, 8000));
    await new Promise(r => setTimeout(r, 500));
    feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length > naAbertura, 'rolar desenha os cards que aparecem',
       { antes: naAbertura, depois: feitos.length });
    ok(new Set(feitos).size === feitos.length, 'e nenhum card e desenhado duas vezes', feitos);

    // Rolar de volta nao redesenha o que ja foi.
    const antesDeVoltar = feitos.length;
    await page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(r => setTimeout(r, 400));
    feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length === antesDeVoltar, 'voltar ao topo nao redesenha nada', feitos.length);

    // ── 3. O PDF Prova alcanca os que ninguem rolou ─────────────────────────
    const n = await page.evaluate((itens) => window.desenharTodosOsCards('os-1', itens), itens);
    feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length === 52, 'desenharTodosOsCards alcanca os 52', feitos.length);
    ok(n > 0, 'e devolve quantos faltavam', n);
    ok(new Set(feitos).size === 52, 'sem repetir nenhum', feitos.length);

    // ── 4. REDESENHAR A LISTA TEM DE REDESENHAR OS CARDS ───────────────────
    //
    // Este caso nasceu de um defeito em producao: a primeira versao guardava a
    // conta de "ja desenhei" por PEDIDO, e cada `renderAmostrasOSItens`
    // reescreve o `container.innerHTML` -- o que destroi todos os canvases. A
    // segunda renderizacao recusava desenhar ("ja fiz esse") sobre um DOM
    // recem-nascido e vazio: os cards desenhavam e sumiam. E quem redesenha
    // logo depois da abertura e justamente a chegada dos bancos.
    //
    // O teste que estava aqui antes afirmava o CONTRARIO -- que redesenhar nao
    // refazia o trabalho -- e por isso passou por cima do defeito.
    await page.evaluate(() => {
        window.desenhados = [];
        // O que a re-renderizacao faz de verdade: reescreve tudo.
        const cont = document.getElementById('cont');
        cont.innerHTML = cont.innerHTML;
    });
    await abrir('os-1');                                  // o MESMO pedido
    feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length > 0,
       'redesenhar a lista redesenha os cards visiveis — o DOM anterior nao existe mais',
       feitos.length);

    await page.evaluate(() => { window.desenhados = []; });
    await abrir('os-2');                                  // pedido NOVO
    feitos = await page.evaluate(() => window.desenhados.slice());
    ok(feitos.length > 0, 'trocar de pedido tambem desenha', feitos.length);

    if (erros.length) { console.error('ERROS NA PAGINA:', erros.slice(0, 3)); falhas++; }
    await browser.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes do desenho sob demanda passaram.');
})();
