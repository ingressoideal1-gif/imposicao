// A FILA DE MODELOS DO PEDIDO, DESENHADA NUM CHROME DE VERDADE.
//
// Ate 28/08/2026 cada linha carregava os proprios rotulos: QTD, NI, NF, Bloco,
// COR, Num., Verso e Status escritos DENTRO de cada celula, em cada linha. Oito
// rotulos vezes N linhas empurravam a largura da linha para ~2.130 px -- e era
// isso que obrigava a tela do Pedido a abrir com `zoom: 0.8`, encolhendo 20%
// tudo o que foi feito grande de proposito para leitura em pe, na frente da
// impressora.
//
// Os rotulos viraram cabecalho de coluna. Este harness mede se a conta fecha:
// a fila tem de caber em 100%, sem o zoom -- senao a mudanca troca um problema
// por outro, e o operador perde a leitura de longe OU a linha inteira.
//
// Roda a `renderPedOSQueue` DE VERDADE, lida do pedido.js, com o mundo em volta
// trocado por dubles. Nada sai desta maquina.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function extrair(nome) {
    const i = PEDIDO.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no pedido.js');
    const fim = PEDIDO.indexOf('\n}', i);
    return PEDIDO.slice(i, fim + 2);
}

// As funcoes de verdade que decidem o que a fila mostra. As outras (salvar
// campo, redesenhar barra, mover a janela) sao dubles: nao mudam o desenho.
const REAIS = ['renderPedOSQueue', 'contaDoProduto', 'resolverCorDoModelo',
               'modeloEhCamarote', 'textoLegivelSobre',
               'coresDoFormato', 'numeracoesDoFormato',
               'opcoesDeCorDaFila', 'opcoesDeNumeracaoDaFila', 'encherSeletorDaFila',
               'encherSeletoresPendentes'];

// ─── O pedido 21202: 52 modelos numa caixa so, o maior real ──────────────────
function cenario(quantos, comCamarote) {
    const itens = [];
    for (let i = 1; i <= quantos; i++) {
        itens.push({
            id: 'm' + i,
            modelo: 'MOD-' + (1000 + i),
            produto: 'Ingresso de teste ' + i,
            _vibe_id_produto: 'p1',
            formato_id: 'f1',
            saida_id: 's1',
            qtd: 1000,
            num_inicial: 1,
            bloco: 50,
            verso_tipo: i % 2 ? 'Frente' : 'FxVerso',
            status_impressao: i % 3 === 0 ? 'Impresso' : 'Aguardando',
            amostra_cor_id: 'c' + ((i % 18) + 1),
            numeracao_id: (comCamarote && i === 1) ? 'ncam' : ('n' + ((i % 106) + 1)),
        });
    }
    const cores = [];
    for (let i = 1; i <= 18; i++) {
        // Metade das tintas escuras de proposito: e' nelas que o texto preto fixo
        // sumia dentro da propria caixa.
        const hex = i % 2 ? '#0b1020' : '#e8e4d9';
        cores.push({ id: 'c' + i, name: 'Cor de teste ' + i, formato_id: 'f1', cor_referencia: hex });
    }
    const numeracoes = [];
    for (let i = 1; i <= 106; i++) {
        numeracoes.push({ id: 'n' + i, name: 'Numeracao de teste ' + i, formato_id: 'f1', tipo: 'TICKET', ticket_qtd: 1 });
    }
    numeracoes.push({ id: 'ncam', name: 'Camarote de teste', formato_id: 'f1', tipo: 'CAMAROTE' });

    return {
        osItens: { '1': itens },
        produtosGlobais: [{ id_produto: 'p1', nomeReal: 'Ingresso 100x50', setor_pcp: 'LASER' }],
        formatos: [{ id: 'f1', name: 'Ingresso 100x50', id_formato_num: 9, default_saida_id: 's1' }],
        saidas: [{ id: 's1', name: 'SRA3' }],
        cores, numeracoes,
        selectedOSItems: [],
        activeOSItem: null,
        pedidoAberto: { osId: '1' },
    };
}

(async function () {
    const navegador = await puppeteer.launch({ headless: 'new' });
    const aba = await navegador.newPage();
    await aba.setViewport({ width: 1920, height: 1080 });

    await aba.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>` +
        `<div id="view-pedido"><div id="ped-os-queue" style="display:none;">` +
        `<div id="ped-os-queue-body"></div><div id="ped-fila-vazia" style="display:none;"></div>` +
        `</div><div id="ped-preview-home"></div></div></body></html>`,
        { waitUntil: 'load' }
    );

    async function desenhar(estado) {
        await aba.evaluate(`
            window.state = ${JSON.stringify(estado)};
            var state = window.state;
            ${REAIS.map(extrair).join('\n')}
            // Dubles: nao mudam o desenho da fila.
            function getOSItens(id) { return state.osItens[id] || []; }
            function recolherJanelaParaCasa() {}
            function moverJanelaParaModelo() { return true; }
            function autoSaveOSItemField() {}
            function aplicarFiltrosDaFila() {}
            function updatePedImprimirButtonsVisibility() {}
            function atualizarBarraDeSoma() {}
            function filtroDeCorDaFila() { return {}; }
            function escHtmlSimples(s) { return String(s == null ? '' : s); }
            function normalizarStatusImpressao(s) {
                return String(s || '').toUpperCase().includes('IMPRESSO') ? 'Impresso' : 'Aguardando';
            }
            function globalNormStr(s) { return String(s || '').trim().toLowerCase(); }
            function globalFuzzyMatch() { return false; }
            // A rede de seguranca dos seletores nao entra sozinha aqui: cada
            // teste decide quando ela roda, para medir os dois estados.
            function agendarRedeDosSeletores() {}
            window.encherSeletorDaFila = encherSeletorDaFila;
            window.encherSeletoresPendentes = encherSeletoresPendentes;
            renderPedOSQueue();
        `);
    }

    // ── 1. A fila cabe em 100%, sem o zoom ──────────────────────────────────
    await desenhar(cenario(52, false));

    const medida = await aba.evaluate(() => {
        // A pergunta do operador nao e' "quanto a tabela mede", e' "cabe na
        // tela do chao de fabrica em 100%?". Entao a caixa e' apertada ate a
        // largura util de uma tela comum e se pergunta se sobrou rolagem
        // horizontal — que e' o que o zoom de 0,8 existia para evitar.
        const caixa = document.getElementById('ped-os-queue');
        caixa.style.width = '1500px';
        const rolagem = document.querySelector('#ped-os-queue-body .table-responsive');
        const tabela = document.querySelector('#ped-os-queue-body table');
        return {
            linhas: document.querySelectorAll('#ped-os-queue-body tbody tr').length,
            precisaRolar: tabela.scrollWidth > rolagem.clientWidth + 1,
            sobra: Math.round(rolagem.clientWidth - tabela.scrollWidth),
            zoomNoCss: getComputedStyle(document.getElementById('view-pedido')).zoom,
        };
    });
    ok(medida.linhas === 52, 'a fila desenha os 52 modelos do maior pedido real', medida);
    ok(!medida.precisaRolar,
       'a fila cabe numa tela de 1.500 px em 100% — era ~2.130 px com os rotulos repetidos, e por isso existia o zoom de 0,8',
       medida);
    ok(medida.zoomNoCss === '1' || medida.zoomNoCss === 'normal',
       'e o zoom de 0,8 saiu do style.css: a fonte grande da fila volta ao tamanho de verdade',
       medida);

    // ── 1b. UMA escala so na tela, a 100% ───────────────────────────────────
    //
    // Tirado o zoom de 0,8, a fila passou a desenhar 25% maior do que sempre
    // foi, e o usuario descreveu a distorcao: a fila ficava melhor a 80% e a
    // janela de visualizacao melhor a 100%. Duas escalas na mesma tela.
    //
    // A fila continua sendo a parte de fonte MAIOR da pagina — ela e' lida em
    // pe, na frente da impressora —, mas dentro de uma distancia que convive
    // com a janela no mesmo 100%.
    const escala = await aba.evaluate(() => {
        const px = el => parseFloat(getComputedStyle(el).fontSize);
        return {
            campo: px(document.querySelector('#ped-os-queue-body tbody input[type="number"]')),
            seletor: px(document.querySelector('#ped-os-queue-body tbody select')),
            nome: px(document.querySelector('#ped-os-queue-body tbody td[title="Nome do Modelo"]')),
            cabecalho: px(document.querySelector('#ped-os-queue-body thead th')),
        };
    });
    ok(escala.campo <= 16 && escala.seletor <= 16,
       'os campos da fila cabem na escala de 100% — a 1,2rem de antes so' + ' fechava com o zoom de 0,8',
       escala);
    ok(escala.campo >= 14 && escala.nome >= 13,
       'e continuam maiores que os controles da janela: a fila e lida em pe, na frente da impressora',
       escala);

    // ── 1c. O nome do modelo e' a coluna mais larga ────────────────────────
    //
    // Pedido do usuario: Qtd, N. inicial, N. final, Bloco e Cor a 65% da
    // largura que tinham, e o que sobrar vai para o nome — que e' por onde ele
    // reconhece a peca, e vinha cortado.
    const colunas = await aba.evaluate(() => {
        const larg = {};
        document.querySelectorAll('#ped-os-queue-body thead th').forEach(t => {
            larg[t.textContent.trim() || 'marcar'] = Math.round(t.getBoundingClientRect().width);
        });
        return larg;
    });
    ok(colunas['Modelo'] === Math.max(...Object.values(colunas)),
       'o nome do modelo e a coluna mais larga da fila', colunas);
    for (const campo of ['Qtd', 'N. inicial', 'N. final', 'Bloco']) {
        ok(colunas[campo] < colunas['Modelo'] / 4,
           `a coluna ${campo} guarda tres ou quatro digitos e nao ocupa mais que isso`, colunas);
    }
    ok(colunas['Cor'] < colunas['Numeração'],
       'e a Cor cabe em menos espaco que a Numeracao, cujo nome e longo', colunas);

    // ── 1d. O quadro de cada modelo: cantos redondos e respiro entre eles ───
    const quadro = await aba.evaluate(() => {
        const linhas = document.querySelectorAll('#ped-os-queue-body tbody tr.fila-linha');
        const a = linhas[0].getBoundingClientRect(), b = linhas[1].getBoundingClientRect();
        const raio = el => parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0;
        return {
            raioDaLinha: raio(linhas[0]),
            raioDaPrimeiraCelula: raio(linhas[0].querySelector('td:first-child')),
            raioDaUltimaCelula: parseFloat(
                getComputedStyle(linhas[0].querySelector('td:last-child')).borderTopRightRadius) || 0,
            distancia: Math.round(b.top - a.bottom),
        };
    });
    ok(quadro.raioDaLinha >= 8, 'o quadro de cada modelo tem os cantos arredondados', quadro);
    ok(quadro.raioDaPrimeiraCelula >= 8 && quadro.raioDaUltimaCelula >= 8,
       'nas duas pontas — com border-collapse separate, quem desenha os cantos sao as celulas',
       quadro);
    ok(quadro.distancia >= 10,
       'e ha respiro entre um modelo e o seguinte: as linhas sao quadros, nao uma grade colada',
       quadro);

    // ── 2. O cabecalho de coluna existe, e os rotulos sairam das linhas ─────
    const cabecalho = await aba.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('#ped-os-queue-body thead th')).map(t => t.textContent.trim());
        // Os rotulos que sobreviviam eram <span> soltos ao lado do campo. O
        // texto das <option> nao conta (uma delas se chama "FxVerso").
        const spans = Array.from(document.querySelectorAll('#ped-os-queue-body tbody tr td > div > span'))
            .map(s => s.textContent.trim());
        return { ths, rotulosNaLinha: spans.filter(t => /^(QTD|NI|NF|Bloco|COR|Núm\.|Verso|Status)$/.test(t)) };
    });
    ok(cabecalho.ths.join('|') === '|Código|Modelo|Qtd|N. inicial|N. final|Bloco|Cor|Numeração|Verso|Status',
       'o cabecalho nomeia as colunas uma vez so', cabecalho.ths);
    ok(cabecalho.rotulosNaLinha.length === 0,
       'e as linhas nao repetem mais os rotulos', cabecalho.rotulosNaLinha);

    // ── 3. O resumo do produto traz TRES numeros ────────────────────────────
    const resumo = await aba.evaluate(() => {
        const cab = document.querySelector('#ped-os-queue-body .card-header');
        const selo = Array.from(cab.querySelectorAll('span')).find(s => s.textContent.includes('Total:'));
        const caixa = cab.getBoundingClientRect(), s = selo.getBoundingClientRect();
        const centroCaixa = caixa.left + caixa.width / 2, centroSelo = s.left + s.width / 2;
        return {
            texto: selo.textContent.replace(/\s+/g, ' ').trim(),
            desvioDoCentro: Math.round(Math.abs(centroCaixa - centroSelo)),
        };
    });
    ok(/Total: 52\.000 - Impressas: 17\.000 - Faltam: 35\.000/.test(resumo.texto),
       'o resumo diz quanto tem, quanto ja saiu e quanto falta', resumo);
    ok(resumo.desvioDoCentro < 90, 'e fica no centro da linha do produto', resumo);

    // ── 4. O nome da tinta e legivel na propria caixa ───────────────────────
    const contraste = await aba.evaluate(() => {
        function luz(c) {
            const m = c.match(/\d+/g).map(Number);
            const f = v => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
            return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]);
        }
        let pior = 99;
        document.querySelectorAll('#ped-os-queue-body td[title="Cor"] select').forEach(s => {
            const e = getComputedStyle(s);
            const a = luz(e.color), b = luz(e.backgroundColor);
            const razao = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
            if (razao < pior) pior = razao;
        });
        return Math.round(pior * 10) / 10;
    });
    ok(contraste >= 4.5,
       'o nome da tinta se le sobre a propria tinta, clara ou escura (contraste minimo 4,5:1)',
       contraste);

    // ── 5. Caixa MISTURADA mantem os rotulos na linha ───────────────────────
    //
    // As quatro colunas do meio mudam de significado no CAMAROTE. Um cabecalho
    // so mentiria para metade das linhas.
    await desenhar(cenario(6, true));
    const misturada = await aba.evaluate(() => ({
        temCabecalho: !!document.querySelector('#ped-os-queue-body thead'),
        temRotulo: /Q_CAM/.test(document.querySelector('#ped-os-queue-body tbody tr').textContent),
    }));
    ok(!misturada.temCabecalho && misturada.temRotulo,
       'caixa que mistura Camarote e comum volta aos rotulos na linha, sem cabecalho que mentiria',
       misturada);

    // ── 6. Os seletores nascem com a opcao escolhida, e so ──────────────────
    //
    // 124 opcoes por linha eram quase tres quartos dos elementos da tela, para
    // o operador ver UMA linha de cada seletor. A fila se redesenha a cada
    // clique num modelo.
    await desenhar(cenario(52, false));
    const enxuto = await aba.evaluate(() => ({
        nos: document.querySelectorAll('#ped-os-queue-body *').length,
        opcoes: document.querySelectorAll('#ped-os-queue-body option').length,
        seletores: document.querySelectorAll('#ped-os-queue-body select[data-lista]').length,
        // O valor escolhido tem de estar la desde o primeiro desenho: e' o que
        // o operador LE sem abrir nada.
        corLida: document.querySelector('#ped-os-queue-body td[title="Cor"] select').selectedOptions[0].textContent,
        numLida: document.querySelector('#ped-os-queue-body td[title="Numeração"] select').selectedOptions[0].textContent,
    }));
    ok(enxuto.seletores === 104, 'os 52 modelos trazem os 104 seletores de Cor e Numeracao', enxuto);
    ok(enxuto.opcoes < 400,
       'que nascem com a opcao escolhida e nao com as 124 da lista inteira', enxuto);
    ok(enxuto.nos < 3200, 'a fila cabe em menos de 3.200 elementos — eram 8.892', enxuto);
    ok(/Cor de teste/.test(enxuto.corLida) && /Numeracao de teste/.test(enxuto.numLida),
       'e o operador continua LENDO a cor e a numeracao do modelo sem abrir nada', enxuto);

    // ── 7. Abrir o seletor traz a lista inteira, sem perder a escolha ───────
    const aberto = await aba.evaluate(() => {
        const s = document.querySelector('#ped-os-queue-body td[title="Cor"] select');
        const antes = s.value;
        s.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return { antes, depois: s.value, opcoes: s.options.length,
                 pintadas: Array.from(s.options).filter(o => o.style.backgroundColor).length };
    });
    ok(aberto.opcoes === 19, 'abrir o seletor de Cor traz as 18 cores do formato mais a opcao vazia', aberto);
    ok(aberto.depois === aberto.antes, 'e a cor escolhida continua escolhida', aberto);
    ok(aberto.pintadas === 18, 'com cada opcao pintada com a propria tinta', aberto);

    // ── 8. A rede de seguranca enche o que ninguem abriu ────────────────────
    //
    // Cada estacao da grafica usa um navegador diferente. Um seletor que nao
    // enchesse deixaria o operador sem conseguir trocar a cor do modelo.
    const rede = await aba.evaluate(() => {
        encherSeletoresPendentes();
        const vazios = Array.from(document.querySelectorAll('#ped-os-queue-body select[data-lista]'))
            .filter(s => s.options.length <= 1).length;
        return { vazios, opcoes: document.querySelectorAll('#ped-os-queue-body option').length };
    });
    ok(rede.vazios === 0, 'passado o tempo, nenhum seletor fica com a lista pela metade', rede);
    ok(rede.opcoes > 6000, 'a lista inteira esta la quando o operador precisar dela', rede);

    await navegador.close();

    if (falhas) {
        console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
        process.exit(1);
    }
    console.log('OK: ' + total + ' verificacoes da fila do pedido passaram.');
})().catch(e => { console.error(e); process.exit(1); });
