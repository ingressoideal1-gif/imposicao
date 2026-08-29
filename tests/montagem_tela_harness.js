// A TELA DA MONTAGEM, DESENHADA NUM CHROME DE VERDADE.
//
// O harness do núcleo (montagem_harness.js) cobra a tradução das posições, que
// é onde mora a correção. Este cobra o que só aparece DESENHANDO: se a lista, o
// selo, a trava e a prévia saem, se cabem na tela, e se o estado vazio explica
// a tela para quem chega com uma folha estragada na mão.
//
// Usa a view DE VERDADE, recortada do index.html, o style.css de verdade e as
// funções de verdade do montagem.js. Nada sai desta máquina.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const puppeteer = require(path.join(RAIZ, 'node_modules', 'puppeteer'));

const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');
const MTG = fs.readFileSync(path.join(RAIZ, 'frontend', 'montagem.js'), 'utf8');

const FOTO = process.argv[2] || null;

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortarView() {
    const i = HTML.indexOf('<section id="view-montagem"');
    if (i < 0) throw new Error('nao achei a view da Montagem no index.html');
    const f = HTML.indexOf('<section id="view-impressoras"', i);
    return HTML.slice(i, f);
}

function extrair(nome) {
    let i = MTG.indexOf('\nfunction ' + nome + '(');
    if (i < 0) i = MTG.indexOf('\nasync function ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = MTG.indexOf('\n}', i);
    return MTG.slice(i, fim + 2);
}

const FUNCOES = [
    'posicoesDaMontagem', 'totalDeItensDoModelo', 'porQueNaoCabeNaMontagem',
    'posicoesCombinadas', 'totalDeCelulasDaMontagem', 'contaDaMontagem',
    'grupoDaMontagem', '_mtgCelulasPorFolha', 'renderMontagem', 'limparMontagem',
    'removerDaMontagem', '_mtgHtmlDaRecusa', 'payloadDaMontagem', '_mtgNumeracaoDoItem',
    // A resolucao do formato: o caminho que faltava na primeira versao.
    'formatoDoItem', 'saidaIdDoItem', 'pecaDaMontagem',
    // O numero do modelo impresso em cada item (29/08/2026).
    'imprimirNumeroNaMontagem',
    // ONDE O PDF VAI PARAR (29/08/2026): a pasta da estacao, o download e a
    // lightbox — os tres caminhos que substituiram a janela nova bloqueada.
    'pastaDaMontagem', 'abrirNaTelaDaMontagem', 'nomeDoArquivoDaMontagem',
    '_mtgDicaDoDestino', 'onMontagemPastaChange', 'encherPastasDaMontagem',
    'gravarPdfNaEstacao', 'baixarPdfDaMontagem', 'abrirPdfDaMontagemNaTela',
    'gerarPdfDaMontagem',
];

// Três pedidos, quatro modelos, todos do mesmo formato/cor/saída/face.
const PECAS = [
    { id: '1000565', osId: 'a', pedido: '21202', nome: '05/set CAMAROTE PRESIDENTE',   qtd: 3000, pos: [1, 6, 22] },
    { id: '1000589', osId: 'a', pedido: '21202', nome: '11/set CAMAROTE PATROCINADORES', qtd: 1920, pos: [340, 341, 342, 343] },
    { id: '1000412', osId: 'b', pedido: '21188', nome: 'STAFF PALCO',                  qtd: 150,  pos: [7, 12, 88] },
    { id: '1000203', osId: 'c', pedido: '20990', nome: 'PULSEIRA CAMAROTE OURO',       qtd: 800,  pos: [3, 4, 5, 6] },
];

(async () => {
    // ── 1. O que se lê no ARQUIVO ───────────────────────────────────────────
    ok(/id="view-montagem"/.test(HTML), 'a view da Montagem existe no index.html');
    ok(/id="nav-montagem"/.test(HTML), 'e o botão do menu também');
    ok(/montagem\.js\?v=/.test(HTML), 'e o script entra na página com carimbo de versão');

    const iPedido = HTML.indexOf('id="nav-pedido"');
    const iMtg = HTML.indexOf('id="nav-montagem"');
    ok(iPedido > 0 && iMtg > iPedido,
       'a Montagem vem DEPOIS do Pedido no menu — ela recolhe o que sobrou dele');

    // A tela é gerada na estação, e não há caminho para a nuvem.
    ok(!/imposicao\.onrender\.com|MOTOR_NUVEM/.test(MTG),
       'a Montagem não tem caminho para a nuvem: impressão só acontece pela estação');
    ok(/localhost:8080|127\.0\.0\.1:9000/.test(MTG), 'ela procura a estação nesta máquina');

    const navegador = await puppeteer.launch({
        headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    const aba = await navegador.newPage();
    await aba.setViewport({ width: 1600, height: 1000, deviceScaleFactor: FOTO ? 2 : 1 });

    await aba.setContent(
        `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>` +
        `<body><div class="main-content" style="padding:24px;">${recortarView()}</div></body></html>`,
        { waitUntil: 'load' });

    await aba.evaluate(() => {
        const v = document.getElementById('view-montagem');
        if (v) { v.style.display = 'block'; v.classList.add('active'); }
    });

    // CONCATENAÇÃO, e não template literal: as funções extraídas do montagem.js
    // trazem `${...}` dentro dos próprios templates (o HTML da lista, o da
    // recusa), e num template literal do harness eles seriam interpolados AQUI,
    // com as variáveis erradas — ou, como aconteceu, num erro de sintaxe dentro
    // do Chrome, longe da causa.
    const PRELUDIO = [
        "const state = {",
        "  montagem: { grupos: [], pedidoSel: null, modeloSel: null },",
        // O catalogo que a resolucao do formato consulta. O produto 501 e' o
        // caminho de verdade: `formato_id` nao existe em pedidos_modelos, e a
        // Montagem resolve pelo produto do ERP.
        "  formatos: [{ id: 'F1', id_formato_num: 77, nome: 'Triband 245x20 mm',",
        "               cols: 1, rows: 10, default_saida_id: 'S1' }],",
        "  produtosGlobais: [{ id_produto: 501, id_formato: 77 }],",
        "  saidas:   [{ id: 'S1', nome: 'SRA3' }],",
        "  numeracoes: [], osItens: {}, ordens: [],",
        "};",
        "function escapeHtml(s) {",
        "  return String(s == null ? '' : s).replace(/[&<>\"']/g, function (c) {",
        "    return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]; });",
        "}",
        "function fatiaCsvDoItem() { return null; }",
        "function resolverNumeracaoParaModelo(n) { return n; }",
        "function numeracaoIdDoItem(i) { return i.amostra_num_id; }",
        "function onMontagemPosicoesChange() {}",
    ].join('\n');

    const POSLUDIO = [
        "window.state = state;",
        "window.renderMontagem = renderMontagem;",
        "window.removerDaMontagem = removerDaMontagem;",
        "window.limparMontagem = limparMontagem;",
        "window.porQueNaoCabeNaMontagem = porQueNaoCabeNaMontagem;",
        "window.payloadDaMontagem = payloadDaMontagem;",
        "window.pecaDaMontagem = pecaDaMontagem;",
        "window.imprimirNumeroNaMontagem = imprimirNumeroNaMontagem;",
        "window.posicoesCombinadas = posicoesCombinadas;",
        // O ITEM como ele chega do banco: SEM formato_id. Quem resolve o
        // formato e' o `pecaDaMontagem`, pelo produto — que e' o caminho que
        // faltava e derrubou a primeira versao em producao.
        "window.__item = function (p) { return {",
        "  id: p.id, nome_modelo: p.nome, quantidade: p.qtd,",
        "  _vibe_id_produto: 501, cor: 'Azul Celeste', verso_tipo: 'Frente',",
        "  amostra_num_id: null, arte_url: 'x.pdf', num_inicial: 1 }; };",
        "window.__montar = function (pecas) {",
        "  state.montagem.grupos = pecas.map(function (p) { return {",
        "    osId: p.osId, itemId: p.id, pedidoNumero: p.pedido, nome: p.nome,",
        "    qtd: p.qtd, posicoes: p.pos.slice(),",
        "    peca: pecaDaMontagem(window.__item(p)) }; });",
        "  renderMontagem();",
        "};",
    ].join('\n');

    await aba.evaluate(PRELUDIO + '\n' + FUNCOES.map(extrair).join('\n') + '\n' + POSLUDIO);

    // ── 2. O estado vazio se explica ────────────────────────────────────────
    await aba.evaluate(() => renderMontagem());
    const vazio = await aba.evaluate(() => {
        const v = document.querySelector('.mtg-vazio');
        return {
            existe: !!v,
            texto: v ? v.textContent.replace(/\s+/g, ' ').trim() : '',
            temGarantia: !!document.querySelector('.mtg-garantia'),
            travaEscondida: document.getElementById('mtg-trava').style.display === 'none',
            pdfTravado: document.getElementById('mtg-btn-pdf').disabled,
            badgeEscondido: (document.getElementById('badge-montagem') || {}).style === undefined
                ? true : true,
        };
    });
    ok(vazio.existe, 'a tela vazia mostra o convite, e não uma tabela sem linha', vazio);
    ok(/pedidos diferentes/.test(vazio.texto),
       'e diz a coisa que a tela existe para fazer: juntar pedidos diferentes', vazio.texto.slice(0, 120));
    ok(/mesmo formato, cor, saída e face/.test(vazio.texto),
       'e diz a condição, para o operador não descobrir na recusa', vazio.texto.slice(0, 200));
    ok(vazio.temGarantia,
       'e a garantia do código igual ao original está à vista — é o que dá confiança de refazer');
    ok(vazio.travaEscondida, 'a trava do formato nasce escondida: não há folha ainda');
    ok(vazio.pdfTravado, 'e o Gerar PDF nasce travado');

    // ── 3. Com células ──────────────────────────────────────────────────────
    await aba.evaluate(pecas => window.__montar(pecas), PECAS);

    const cheio = await aba.evaluate(() => {
        const selo = document.getElementById('mtg-selo');
        const trava = document.getElementById('mtg-trava');
        return {
            linhas: document.querySelectorAll('#mtg-lista .data-table tr').length - 1,
            posicoes: document.querySelectorAll('.mtg-pos').length,
            selo: selo.textContent.replace(/\s+/g, ' ').trim(),
            seloClasse: selo.className,
            travaVisivel: trava.style.display !== 'none',
            travaTexto: trava.textContent.replace(/\s+/g, ' ').trim(),
            resumo: document.getElementById('mtg-resumo').textContent,
            celulas: document.querySelectorAll('.mtg-celula').length,
            vazias: document.querySelectorAll('.mtg-celula-vazia').length,
            folhaNum: document.getElementById('mtg-folha-num').textContent,
            pdfTravado: document.getElementById('mtg-btn-pdf').disabled,
        };
    });
    ok(cheio.linhas === 4, 'quatro modelos, quatro linhas', cheio);
    ok(cheio.posicoes === 14, 'e catorze posições ao todo', cheio);
    ok(/3 pedido\(s\) · 4 modelo\(s\)/.test(cheio.resumo), 'o resumo conta pedidos e modelos', cheio);
    ok(/2 folha\(s\)/.test(cheio.selo) && /14 célula\(s\)/.test(cheio.selo),
       'o selo diz folhas e células', cheio.selo);
    ok(/sobram 6 célula\(s\)/.test(cheio.selo), 'e a sobra, que é o resto', cheio.selo);
    ok(/tem-sobra/.test(cheio.seloClasse),
       'com sobra o selo fica AMARELO — o amarelo é reservado à sobra', cheio.seloClasse);
    ok(cheio.travaVisivel, 'a trava aparece com a primeira célula');
    ok(/Triband/.test(cheio.travaTexto) && /Azul Celeste/.test(cheio.travaTexto)
        && /SRA3/.test(cheio.travaTexto) && /Só frente/.test(cheio.travaTexto),
       'e diz as QUATRO coisas que a folha aceita', cheio.travaTexto);
    ok(cheio.celulas === 10, 'a prévia desenha uma folha inteira do formato (10 células)', cheio);
    ok(cheio.vazias === 0, 'e a primeira folha está cheia — a sobra cai na última', cheio);
    ok(/FOLHA 1 DE 2/.test(cheio.folhaNum), 'e diz de quantas folhas ela é', cheio);
    ok(!cheio.pdfTravado, 'com células, o Gerar PDF libera');

    // ── 3b. A TIRAGEM de cada modelo aparece na lista ───────────────────────
    //
    // Pedido do usuário em 29/08/2026. É contra esse número que a posição vale:
    // "#340" só existe num modelo de 1.920, e sem ele na tela o operador digita
    // no escuro.
    const tiragens = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const cab = Array.from(document.querySelectorAll('#mtg-lista th')).map(e => e.textContent.trim());
        const linhas = Array.from(document.querySelectorAll('#mtg-lista .data-table tr')).slice(1);
        return {
            cabecalho: cab,
            valores: linhas.map(tr => tr.children[2].textContent.trim()),
            dica: linhas[0].children[2].getAttribute('title') || '',
        };
    }, PECAS);
    ok(tiragens.cabecalho.indexOf('Tiragem') === 2,
       'a coluna Tiragem vem depois do Modelo e antes das Posições', tiragens.cabecalho);
    ok(tiragens.valores.join('|') === '3.000|1.920|150|800',
       'e traz a tiragem de CADA modelo, com separador de milhar', tiragens.valores);
    ok(/posição vale/.test(tiragens.dica),
       'e a dica explica para que serve o número', tiragens.dica);

    // ── 3c. O número do modelo impresso em cada item ────────────────────────
    //
    // Mesmo conceito das "Opções do modelo" do Pedido, e a mesma mecânica: o
    // motor imprime `arte["nome"]`, e esse campo é o ÚNICO que decide se sai.
    const numero = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const cx = document.getElementById('mtg-imprimir-numero');
        const desmarcado = payloadDaMontagem(state.montagem.grupos).multi_artes.map(a => a.nome);
        cx.checked = true;
        const marcado = payloadDaMontagem(state.montagem.grupos).multi_artes.map(a => a.nome);
        cx.checked = false;
        return { nasceDesmarcada: cx.defaultChecked === false, desmarcado, marcado,
                 rotulo: cx.closest('.mtg-opcao').textContent.replace(/\s+/g, ' ').trim() };
    }, PECAS);
    ok(numero.nasceDesmarcada,
       'a caixa nasce DESMARCADA — novidade que muda o papel entra desligada', numero);
    ok(numero.desmarcado.every(n => n === ''),
       'desmarcada, o payload manda `nome` VAZIO: nada sai impresso', numero.desmarcado);
    ok(numero.marcado.join(',') === '1000565,1000589,1000412,1000203',
       'marcada, cada arte leva o NÚMERO DO SEU modelo — e não um número só para a folha', numero.marcado);
    ok(/número do modelo em cada item/.test(numero.rotulo),
       'e o rótulo é o mesmo do Pedido, para o operador reconhecer', numero.rotulo);

    // ── 3d. ONDE O PDF VAI PARAR ─────────────────────────────────────
    //
    // Foi aqui que a tela falhou em producao, em 29/08/2026: ela entregava o
    // PDF com `window.open(blobUrl)`, o navegador bloqueia janela nova depois
    // que o gesto do clique vence (cinco segundos, no Chrome), e a montagem
    // sumia sem erro nenhum -- o toast dizia "gerada" e nao havia arquivo.
    // SEM OS COMENTARIOS: a explicacao do defeito CITA o `window.open`, e um
    // teste que casa com a citacao em vez da chamada nao guarda nada.
    const MTG_CODIGO = MTG.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    ok(!/window\.open\(/.test(MTG_CODIGO),
       'a Montagem não entrega o PDF por janela nova — o navegador a bloqueia');
    ok(/hotfolder\/drop/.test(MTG) && /hotfolder\/escolher/.test(MTG),
       'quem escolhe a pasta e quem grava no disco é a ESTAÇÃO, não o navegador');
    ok(/a\.download = nome/.test(MTG),
       'e sem pasta escolhida o PDF desce por <a download>, que nada bloqueia');

    const destino = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const feito = [];
        const pdf = new Blob(['%PDF-1.4'], { type: 'application/pdf' });

        window._mtgEstacao = async () => 'http://127.0.0.1:9000';
        window.toast = (m, tipo) => feito.push(tipo + ': ' + m);
        window.baixarPdfDaMontagem = (b, n) => feito.push('baixou ' + n);
        window.abrirPdfDaMontagemNaTela = (b, n) => feito.push('abriu ' + n);
        window.gravarPdfNaEstacao = async (base, pasta) => {
            feito.push('gravou em ' + pasta);
            return pasta + '\\montagem.pdf';
        };
        window.fetch = async () => ({ ok: true, blob: async () => pdf });

        const sel = document.getElementById('mtg-pasta');
        const cx = document.getElementById('mtg-abrir');

        return (async () => {
            const r = { nasceMarcada: cx.defaultChecked === true };

            sel.innerHTML = '<option value="">Baixar pelo navegador</option>'
                          + '<option value="D:\\Hot">Hot</option>';

            sel.value = ''; cx.checked = false; feito.length = 0;
            await gerarPdfDaMontagem();
            r.semPasta = feito.slice();

            sel.value = 'D:\\Hot'; cx.checked = true; feito.length = 0;
            await gerarPdfDaMontagem();
            r.comPasta = feito.slice();

            window.gravarPdfNaEstacao = async () => { throw new Error('a pasta sumiu'); };
            feito.length = 0;
            await gerarPdfDaMontagem();
            r.pastaQuebrada = feito.slice();

            r.nome = nomeDoArquivoDaMontagem(new Date(2026, 7, 29, 14, 5));
            return r;
        })();
    }, PECAS);

    ok(destino.nasceMarcada,
       'a caixa "abrir na tela" nasce MARCADA: é ela que devolve o PDF que sumia', destino);
    ok(destino.semPasta.some(l => /^baixou montagem_/.test(l))
       && !destino.semPasta.some(l => /gravou/.test(l)),
       'sem pasta escolhida, o PDF desce pelo navegador', destino.semPasta);
    ok(!destino.semPasta.some(l => /^abriu /.test(l)),
       'e com a caixa desmarcada ele não abre na tela', destino.semPasta);
    ok(destino.comPasta.some(l => l === 'gravou em D:\\Hot')
       && !destino.comPasta.some(l => /^baixou/.test(l)),
       'com pasta escolhida, quem grava é a estação — e o navegador não baixa nada',
       destino.comPasta);
    ok(destino.comPasta.some(l => /^abriu montagem_/.test(l)),
       'e marcada a caixa, o PDF abre na tela do painel', destino.comPasta);
    ok(destino.comPasta.some(l => /success: .*D:\\Hot/.test(l)),
       'o aviso diz ONDE o arquivo ficou — pasta não se procura no escuro', destino.comPasta);
    ok(destino.pastaQuebrada.some(l => /^baixou montagem_/.test(l)),
       'pasta que falha na hora de gravar NÃO perde o trabalho: o PDF desce pelo navegador',
       destino.pastaQuebrada);
    ok(destino.pastaQuebrada.some(l => /warning: .*a pasta sumiu/.test(l)),
       'e o operador fica sabendo o que falhou, com o motivo do disco', destino.pastaQuebrada);
    ok(destino.nome === 'montagem_2026-08-29_1405.pdf',
       'o nome do arquivo leva data E hora: refazer célula acontece o dia inteiro', destino.nome);

    // A lista de pastas vem da estacao, e pasta que sumiu aparece MARCADA.
    const pastas = await aba.evaluate(() => {
        window._mtgEstacao = async () => 'http://127.0.0.1:9000';
        window.fetch = async () => ({ ok: true, json: async () => ({ ok: true, pastas: [
            { path: 'D:\\Hot', nome: 'Hot', existe: true },
            { path: 'Z:\\Sumida', nome: 'Sumida', existe: false },
            { path: '\\\\rede\\lenta', nome: 'lenta', existe: null },
        ] }) });
        return encherPastasDaMontagem().then(() => {
            const sel = document.getElementById('mtg-pasta');
            const dica = document.getElementById('mtg-destino-dica');
            sel.value = '';
            onMontagemPastaChange();
            const semPasta = dica.textContent;
            sel.value = 'D:\\Hot';
            onMontagemPastaChange();
            return {
                opcoes: Array.from(sel.options).map(o => o.textContent),
                primeira: sel.options[0].value,
                semPasta, comPasta: dica.textContent,
            };
        });
    });
    ok(pastas.primeira === '',
       'a primeira opção é "baixar pelo navegador": sem estação a tela continua entregando');
    ok(/Sumida \(não encontrada\)/.test(pastas.opcoes.join('|')),
       'pasta que a estação conferiu e não achou aparece marcada', pastas.opcoes);
    ok(!/lenta \(não encontrada\)/.test(pastas.opcoes.join('|')),
       'mas pasta que só demorou a responder NÃO é acusada de sumida', pastas.opcoes);
    ok(/downloads do navegador/.test(pastas.semPasta) && /a estação/.test(pastas.comPasta),
       'e a dica diz o que vai acontecer com o arquivo, antes de gerar', pastas);

    // ── 4. A folha que fecha certo fica VERDE ───────────────────────────────
    const verde = await aba.evaluate(() => {
        window.__montar([{ id: 'x', osId: 'a', pedido: '1', nome: 'n', qtd: 99,
                           pos: [1,2,3,4,5,6,7,8,9,10] }]);
        const selo = document.getElementById('mtg-selo');
        return { classe: selo.className, texto: selo.textContent.replace(/\s+/g, ' ').trim() };
    });
    ok(/fecha-certo/.test(verde.classe), 'sem sobra o selo fica VERDE', verde);
    ok(/sem sobra/.test(verde.texto), 'e diz que a folha fecha certo', verde.texto);

    // ── 5. Tirar um modelo ──────────────────────────────────────────────────
    const depois = await aba.evaluate(pecas => {
        window.__montar(pecas);
        removerDaMontagem(1);
        return {
            linhas: document.querySelectorAll('#mtg-lista .data-table tr').length - 1,
            posicoes: document.querySelectorAll('.mtg-pos').length,
            combinadas: posicoesCombinadas(state.montagem.grupos).join(','),
        };
    }, PECAS);
    ok(depois.linhas === 3 && depois.posicoes === 10, 'tirar um modelo tira as células dele', depois);
    // Tirado o modelo de 1.920, as bases passam a ser 0 e 3000 e 3150.
    ok(depois.combinadas === '1,6,22,3007,3012,3088,3153,3154,3155,3156',
       'e as posições combinadas se REFAZEM: o deslocamento some junto com o modelo', depois);

    // ── 6. O payload ────────────────────────────────────────────────────────
    const payload = await aba.evaluate(pecas => {
        window.__montar(pecas);
        return payloadDaMontagem(state.montagem.grupos);
    }, PECAS);
    ok(payload.layout_schema === 'multi_artes',
       'o payload usa multi_artes — o caminho que o motor já valida para pedidos diferentes', payload.layout_schema);
    ok(payload.multi_artes.length === 4, 'uma arte por modelo', payload.multi_artes.length);
    ok(payload.multi_artes.every(a => a.pedido && a.modelo),
       'e cada arte declara o SEU pedido e o SEU modelo — sem isso o motor recusa a folha');
    ok(payload.multi_artes.map(a => a.qtd).join(',') === '3000,1920,150,800',
       'cada arte leva a TIRAGEM INTEIRA, não as células pedidas', payload.multi_artes.map(a => a.qtd));
    // As bases são 0, 3000, 4920 (3000+1920) e 5070 (4920+150).
    ok(payload.refazer_celulas.join(',') === '1,6,22,3340,3341,3342,3343,4927,4932,5008,5073,5074,5075,5076',
       'e as posições vão traduzidas para o fluxo combinado', payload.refazer_celulas);
    ok(payload.refazer_de === 0 && payload.refazer_ate === 0,
       'a faixa de folhas fica zerada: com células, ela não se aplica');

    // ── 7. Cabe na tela ─────────────────────────────────────────────────────
    const layout = await aba.evaluate(pecas => {
        window.__montar(pecas);
        const corpo = document.querySelector('.mtg-corpo');
        const lista = document.querySelector('.mtg-lista-card');
        const prev = document.querySelector('.mtg-previa-card');
        const r = corpo.getBoundingClientRect();
        return {
            umaLinha: Math.abs(lista.getBoundingClientRect().top - prev.getBoundingClientRect().top) < 4,
            larguraPrevia: Math.round(prev.getBoundingClientRect().width),
            vazando: Math.round(r.right) > document.documentElement.clientWidth + 1,
            alturasCelula: Array.from(document.querySelectorAll('.mtg-celula'))
                .map(e => Math.round(e.getBoundingClientRect().height)),
        };
    }, PECAS);
    ok(layout.umaLinha, 'em 1600px a lista e a prévia ficam lado a lado', layout);
    ok(layout.larguraPrevia === 380, 'a prévia tem a largura fixa que o desenho pediu', layout);
    ok(!layout.vazando, 'e nada vaza da tela', layout);
    ok(new Set(layout.alturasCelula).size === 1,
       'todas as células da folha têm a mesma altura', layout);

    if (FOTO) {
        await aba.evaluate(pecas => window.__montar(pecas), PECAS);
        const el = await aba.$('#view-montagem');
        await el.screenshot({ path: FOTO });
        console.log('foto em ' + FOTO);
    }

    await navegador.close();

    if (falhas) {
        console.error(`\n${falhas} de ${total} verificacoes FALHARAM.`);
        process.exit(1);
    }
    console.log(`OK: ${total} verificacoes da tela da Montagem passaram.`);
})().catch(e => { console.error(e); process.exit(1); });
