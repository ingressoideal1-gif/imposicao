// A JANELA DE VISUALIZACAO ABRE ABAIXO DO MODELO, NUM CHROME DE VERDADE.
//
// Ate 28/08/2026 a janela morava num card no FIM da tela do Pedido: o operador
// escolhia o modelo no topo da fila e ia procurar a previa depois de todas as
// caixas de produto. Agora ela abre logo abaixo do modelo escolhido.
//
// O QUE ESTE HARNESS EXISTE PARA IMPEDIR e uma coisa so, e ela nao aparece no
// HTML: que a janela seja RECRIADA em vez de MOVIDA. As duas versoes desenham
// igual na tela e so uma delas preserva o que importa —
//
//   - o canvas ja pintado (recriar devolve uma folha em branco);
//   - o painel de impressao, que ao remontar vai buscar as capacidades da
//     impressora no agente da estacao;
//   - a bandeja, o papel e as copias que o operador escolheu.
//
// Por isso quase todo teste daqui mede IDENTIDADE de elemento, e nao aparencia:
// depois de mover, de trocar de modelo e de a fila inteira ser redesenhada, o
// elemento da janela tem de ser o MESMO objeto, com o mesmo desenho dentro.
//
// Mede tambem as duas regras de estado que a janela trouxe: o clique e um
// interruptor (clicar de novo no modelo aberto fecha), e modelo escondido por
// filtro fecha a janela — senao ela ficaria pendurada embaixo de nada,
// mandando na impressao de um modelo que sumiu da tela.
//
// Nada sai desta maquina: CDN nenhum, banco nenhum, rede nenhuma.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

// ─── As funcoes de verdade, lidas do pedido.js ───────────────────────────────
//
// Copia-las aqui faria o teste envelhecer sozinho: no dia em que o arquivo
// mudasse, o harness continuaria aprovando a versao antiga.
function extrair(nome) {
    const i = PEDIDO.indexOf('\nfunction ' + nome + '(');
    const j = PEDIDO.indexOf('\nasync function ' + nome + '(');
    const inicio = i >= 0 ? i : j;
    if (inicio < 0) throw new Error('nao achei a funcao ' + nome + ' no pedido.js');
    const fim = PEDIDO.indexOf('\n}', inicio);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return PEDIDO.slice(inicio, fim + 2);
}

const NOMES = [
    'rolarParaBaseDaJanela',
    'janelaDeVisualizacao', 'recolherJanelaParaCasa', 'moverJanelaParaModelo',
    'pintarLinhaAberta', 'limparPreviaEnquantoCarrega', 'previaFicouPronta',
    'fecharJanelaDoModelo', 'alternarModeloAberto',
];
const CODIGO = NOMES.map(extrair).join('\n');

// ─── A tela: a fila com tres modelos e a janela na casa dela ─────────────────
function pagina() {
    const linha = (id) => `
        <tr class="hover-row fila-linha" id="ped-queue-row-${id}" data-cor-chave="k1" data-impresso="nao">
            <td>${id}</td><td>Modelo ${id}</td><td>1000</td><td>1</td><td>1000</td>
            <td>—</td><td>Cor</td><td>Numeracao</td><td>Frente</td><td>Aguardando</td><td>fim</td>
        </tr>`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
        tr.fila-linha.aberta { outline: 2pt solid #3b82f6; }
        tr.fila-linha.marcada { outline: 2pt solid #f97316; }
    </style></head><body>
        <div id="ped-os-queue">
          <div id="ped-os-queue-body">
            <div data-caixa-cor="1::p1">
              <table><tbody id="corpo-da-caixa">${linha('a')}${linha('b')}${linha('c')}</tbody></table>
            </div>
          </div>
        </div>
        <div id="ped-preview-home">
          <div class="imposicao-preview" id="ped-preview-card-container" style="display:none;">
            <div class="ped-preview-canvas-container">
              <canvas id="ped-preview-canvas" width="120" height="60"></canvas>
            </div>
            <span id="ped-preview-sheet-num">Folha 1</span>
            <select id="ped-print-tray"><option value="t1">Bandeja 1</option><option value="t2">Bandeja 2</option></select>
          </div>
        </div>
    </body></html>`;
}

(async function () {
    const navegador = await puppeteer.launch({ headless: 'new' });
    const aba = await navegador.newPage();
    await aba.setContent(pagina(), { waitUntil: 'load' });

    // O estado minimo que as funcoes leem, e o codigo de verdade por cima.
    await aba.evaluate(`
        window.state = { activeOSItem: null, pedidoAberto: { osId: '1' } };
        var state = window.state;
        ${CODIGO}
        window.__api = { moverJanelaParaModelo, recolherJanelaParaCasa, pintarLinhaAberta,
                         fecharJanelaDoModelo, limparPreviaEnquantoCarrega, previaFicouPronta };

        // Uma marca no canvas e na bandeja: e por elas que se sabe se a janela
        // foi MOVIDA (a marca sobrevive) ou RECRIADA (a marca some).
        var c = document.getElementById('ped-preview-canvas').getContext('2d');
        c.fillStyle = '#123456'; c.fillRect(0, 0, 120, 60);
        document.getElementById('ped-print-tray').value = 't2';
        document.getElementById('ped-preview-card-container').__marca = 'a-mesma-janela';
    `);

    const olhar = () => aba.evaluate(() => {
        const j = document.getElementById('ped-preview-card-container');
        const abrigo = document.getElementById('ped-linha-da-janela');
        const canvas = document.getElementById('ped-preview-canvas');
        let pixel = null;
        if (canvas) {
            const d = canvas.getContext('2d').getImageData(3, 3, 1, 1).data;
            pixel = '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
        }
        return {
            marca: j ? j.__marca : null,
            visivel: j ? j.style.display : null,
            // De qual linha a janela esta pendurada, lendo a tabela: a
            // linha-abrigo tem de vir logo DEPOIS da linha do modelo.
            depoisDe: abrigo && abrigo.previousElementSibling
                ? abrigo.previousElementSibling.id.replace('ped-queue-row-', '') : null,
            dentroDoAbrigo: !!(abrigo && j && abrigo.contains(j)),
            emCasa: !!(j && j.parentElement && j.parentElement.id === 'ped-preview-home'),
            abertas: Array.from(document.querySelectorAll('tr.fila-linha.aberta')).map(t => t.id.replace('ped-queue-row-', '')),
            pixel,
            bandeja: (document.getElementById('ped-print-tray') || {}).value || null,
            montando: document.querySelectorAll('.previa-montando').length,
        };
    });

    // ── 1. Abrir um modelo leva a janela para baixo DELE ─────────────────────
    await aba.evaluate(() => {
        state.activeOSItem = { itemId: 'b', osId: '1' };
        __api.pintarLinhaAberta('b');
        __api.moverJanelaParaModelo('b');
    });
    let v = await olhar();
    ok(v.depoisDe === 'b', 'a janela abre na linha logo abaixo do modelo escolhido', v);
    ok(v.dentroDoAbrigo, 'a janela fica DENTRO da linha-abrigo, dentro da caixa do produto', v);
    ok(v.visivel === 'block', 'e aparece', v);
    ok(JSON.stringify(v.abertas) === JSON.stringify(['b']), 'so a linha do modelo aberto ganha o realce', v);

    // ── 2. Trocar de modelo MOVE a mesma janela, nao cria outra ──────────────
    await aba.evaluate(() => {
        state.activeOSItem = { itemId: 'c', osId: '1' };
        __api.pintarLinhaAberta('c');
        __api.moverJanelaParaModelo('c');
    });
    v = await olhar();
    ok(v.depoisDe === 'c', 'trocar de modelo leva a janela para a linha nova', v);
    ok(v.marca === 'a-mesma-janela', 'e' + ' e a MESMA janela: o elemento nao foi recriado', v);
    ok(v.pixel === '#123456', 'o desenho ja pintado no canvas sobreviveu a mudanca de lugar', v);
    ok(v.bandeja === 't2', 'a bandeja escolhida pelo operador sobreviveu junto', v);
    ok(JSON.stringify(v.abertas) === JSON.stringify(['c']), 'o realce sai da linha antiga e vai para a nova', v);

    // ── 3. O REDESENHO DA FILA nao pode comer a janela ───────────────────────
    //
    // E o caminho que quebraria tudo em silencio: `wrapper.innerHTML = ...`
    // destroi tudo o que estiver dentro. O renderPedOSQueue recolhe a janela
    // ANTES de reescrever e a devolve depois; aqui reproduzimos os dois passos.
    await aba.evaluate(() => {
        __api.recolherJanelaParaCasa();
        const corpo = document.getElementById('corpo-da-caixa');
        corpo.innerHTML = corpo.innerHTML;          // a fila inteira, remontada
        __api.moverJanelaParaModelo(state.activeOSItem.itemId);
        __api.pintarLinhaAberta(state.activeOSItem.itemId);
    });
    v = await olhar();
    ok(v.marca === 'a-mesma-janela', 'a janela sobrevive ao redesenho da fila inteira', v);
    ok(v.pixel === '#123456', 'com o canvas ainda pintado — nao voltou em branco', v);
    ok(v.bandeja === 't2', 'e com a bandeja do operador ainda escolhida', v);
    ok(v.depoisDe === 'c', 'e volta para baixo do mesmo modelo', v);
    ok(v.dentroDoAbrigo, 'dentro da linha-abrigo de novo', v);

    // ── 4. Fechar devolve a janela para a casa dela ──────────────────────────
    await aba.evaluate(() => __api.fecharJanelaDoModelo());
    v = await olhar();
    ok(v.emCasa, 'fechar devolve a janela para fora da fila', v);
    ok(v.visivel === 'none', 'e ela some da tela', v);
    ok(v.abertas.length === 0, 'nenhuma linha fica com o realce de aberta', v);
    ok(v.depoisDe === null, 'a linha-abrigo vazia nao fica sobrando na tabela', v);
    ok(await aba.evaluate(() => state.activeOSItem === null), 'e nenhum modelo continua selecionado');

    // ── 5. Modelo escondido por filtro nao pode ficar com a janela ───────────
    await aba.evaluate(() => {
        state.activeOSItem = { itemId: 'a', osId: '1' };
        __api.moverJanelaParaModelo('a');
        document.getElementById('ped-queue-row-a').style.display = 'none';   // o filtro
    });
    const moveuEscondido = await aba.evaluate(() => {
        __api.recolherJanelaParaCasa();
        return __api.moverJanelaParaModelo('a');
    });
    ok(moveuEscondido === false, 'a janela recusa ir para baixo de um modelo escondido pelo filtro');
    v = await olhar();
    ok(v.emCasa, 'e fica na casa dela, sem sobrar pendurada na tabela', v);

    // ── 6. O recado de "montando" cobre a espera do carregamento ─────────────
    await aba.evaluate(() => {
        document.getElementById('ped-queue-row-a').style.display = '';
        __api.limparPreviaEnquantoCarrega();
    });
    v = await olhar();
    ok(v.montando === 1, 'ao trocar de modelo a janela diz que esta montando a previa', v);
    ok(v.pixel === '#000000' || v.pixel === '#00000',
       'e o canvas e apagado: nunca a folha do modelo anterior debaixo do nome do novo', v);

    await aba.evaluate(() => __api.previaFicouPronta());
    v = await olhar();
    ok(v.montando === 0, 'e o recado sai quando a previa fica pronta', v);

    await navegador.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da janela abaixo do modelo passaram.');
})().catch(e => { console.error(e); process.exit(1); });
