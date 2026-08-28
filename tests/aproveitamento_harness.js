// Aproveitamento de folha: a medida do desperdício, o limiar do aviso, quem pode
// entrar na folha e a composição que melhor a fecha.
//
// Roda em node, sem navegador: `node tests/aproveitamento_harness.js`.
// Sai com código 1 se algum caso falhar.
//
// As funções são LIDAS do `script.js` e avaliadas aqui, com um `state` de
// mentira — não copiadas. Uma cópia continuaria passando depois de o original
// mudar, que é o defeito que a clonagem `script.js` → `pedido.js` já produziu
// três vezes neste projeto.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

global.window = global.window || {};
global.document = { getElementById: () => null };
require(path.join(RAIZ, 'frontend', 'csv-editor.js'));

const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['linhasAtivasCsv', 'numeracaoIdDoItem', 'fatiaCsvDoItem',
               // `numeracaoDoModelo` entrou no script.js junto com as regras de
               // bloqueio do negocio e a `quantidadeDoModelo` passou a chama-la.
               // Sem o nome nesta lista, o harness inteiro morria com
               // "numeracaoDoModelo is not defined" antes da primeira conta.
               'numeracaoDoModelo',
               'quantidadeDoModelo', 'itemAtivoDoPedido', 'itensDaImposicao',
               'rotuloDoModelo', 'porQueNaoCombina', 'modoDeImpressaoDoModelo',
               'limiarPadraoDeSobra', 'limiarDoProduto', 'limiarDeSobra',
               'sobraDaImposicao', 'sobraMereceAviso', 'textoDaSobra',
               'modeloLiberadoParaImprimir', 'itensJaNaFolha', 'osDaImposicao',
               'candidatosDoPedido', 'melhorComposicao', 'produtoLiberadoParaCombinar',
               'problemaNaSelecao'];

function api(st) {
    return new Function('state', 'window',
        NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
        + '\nreturn { ' + NOMES.join(', ') + ' };')(st, global.window);
}

// ─── O cenário: credencial PVC, 4 células por folha ──────────────────────────

const CREDENCIAL = { id: 'f1', name: 'Credencial 90x140', cols: 2, rows: 2 };

function modelo(nome, qtd, extra) {
    return Object.assign({
        id: 'm-' + nome, modelo: '100' + nome.length + qtd, nome_modelo: nome,
        quantidade: qtd, formato_id: 'f1', saida_id: 's1', padrao: 'Credencial PVC',
        verso_tipo: 'Frente', modo_pdf: false,
        amostra_status: 'APROVADA', status_impressao: 'Aguardando',
        os_id: 'os1', _vibe_id_produto: 'p1'
    }, extra || {});
}

function estado(itensOs1, selecionados, extra) {
    const st = Object.assign({
        formatos: [CREDENCIAL], numeracoes: [], cores: [],
        ordens: [{ id: 'os1', numero: '20495' }, { id: 'os2', numero: '20508' }],
        osItens: { os1: itensOs1 },
        selectedOSItems: selecionados || [],
        activeOSItem: { osId: 'os1', itemId: itensOs1[0].id },
        produtosCombinaveis: new Set()
    }, extra || {});
    // O que o Sumário teria acabado de mostrar. Com um modelo só, é daqui que a
    // sobra sai — ver registrarContaDaTela() no script.js.
    if (st.contaDaTela === undefined) {
        const fmt = (st.formatos || [])[0];
        const poses = fmt ? (parseInt(fmt.cols) || 0) * (parseInt(fmt.rows) || 0) : 0;
        const it = itensOs1[0];
        st.contaDaTela = { total: parseInt(it.quantidade) || 0, poses, item: it };
    }
    return st;
}

// ─── A medida do desperdício ─────────────────────────────────────────────────

(function oExemploDoUsuario() {
    // "impressao de 29 credenciais, o formato da credencial possui 4 celulas,
    //  29 credenciais vai gerar 7 folhas completas e 1 folha com apenas 25% de uso"
    const st = estado([modelo('Tchequia', 29)]);
    const a = api(st);
    const s = a.sobraDaImposicao();

    ok(!!s, 'a sobra sai com um modelo so — e o caso das 29 credenciais');
    ok(s.poses === 4, 'quatro celulas por folha', s && s.poses);
    ok(s.itens === 29, 'vinte e nove itens', s && s.itens);
    ok(s.folhas === 8, 'oito folhas', s && s.folhas);
    ok(s.vazias === 3, 'sobram tres celulas', s && s.vazias);
    ok(Math.round(s.fracao * 100) === 75, 'setenta e cinco por cento de uma folha', s && s.fracao);
})();

(function aFolhaQueFechaCerto() {
    const st = estado([modelo('Cheia', 28)]);
    const s = api(st).sobraDaImposicao();
    ok(s.vazias === 0, 'multiplo das celulas nao deixa sobra', s);
    ok(!api(st).sobraMereceAviso(s), 'sem sobra nao ha o que avisar');
    ok(/fecha certo/.test(api(st).textoDaSobra(s)), 'e o selo diz isso', api(st).textoDaSobra(s));
})();

(function aSobraDeVariosModelosEDaSoma() {
    const itens = [modelo('A', 29), modelo('B', 6)];
    const st = estado(itens, [{ itemId: itens[0].id, osId: 'os1' }, { itemId: itens[1].id, osId: 'os1' }]);
    const s = api(st).sobraDaImposicao();
    ok(s.itens === 35, 'soma os dois modelos', s && s.itens);
    ok(s.vazias === 1, '35 em folhas de 4 deixa uma celula', s && s.vazias);
})();

(function aContaDeUmModeloSoEADoSumario() {
    // O selo nasceu medindo pelo `formato_id` do modelo — um campo que so existe
    // em memoria e nem sempre esta preenchido. O resultado foi um selo INVISIVEL
    // enquanto o Sumario, ao lado, mostrava formato, total e folhas. Agora as
    // duas contas sao a mesma, e por construcao.
    const semFmtNoItem = estado([modelo('X', 29, { formato_id: null, quantidade: 29 })]);
    const s = api(semFmtNoItem).sobraDaImposicao();
    ok(!!s, 'modelo sem formato_id continua medindo, porque a conta vem do Sumario');
    ok(s && s.vazias === 3, 'e o numero e o mesmo', s && s.vazias);

    // Sumario escondido (sem formato ou sem saida na tela) = nada a medir.
    const semSumario = estado([modelo('X', 29)], null, { contaDaTela: null });
    ok(api(semSumario).sobraDaImposicao() === null,
        'sem Sumario o selo some, em vez de mostrar um numero inventado');

    // E o total vem do Sumario, nao da quantidade do modelo: com banco de dados
    // eles diferem, e quem manda no papel e o que a tela mostrou.
    const outroTotal = estado([modelo('X', 29)], null,
        { contaDaTela: { total: 30, poses: 4, item: modelo('X', 29) } });
    ok(api(outroTotal).sobraDaImposicao().itens === 30,
        'o total e o do Sumario', api(outroTotal).sobraDaImposicao().itens);
})();

(function cadaAbaPublicaAContaDeQuemEstaVISIVEL() {
    // Aba Imposicao: quem mostra os numeros e o Sumario, e e' ele quem publica.
    ok(/registrarContaDaTela\(total, perSheet/.test(SCRIPT),
        'o Sumario da aba Imposicao publica o que mostrou');
    ok((SCRIPT.match(/registrarContaDaTela\(0, 0\)/g) || []).length >= 2,
        'e as duas desistencias dele apagam a conta');

    // Aba Pedido: o Sumario esta dentro do bloco escondido, e os campos Formato
    // e Saida DELE ficam vazios -- `updatePedSummary` desiste na primeira
    // conferencia e nunca chega ao fim. Quem sabe quantas folhas o trabalho tem
    // e' a previa, que escreve "FOLHA 1 DE 7" na tela. Foi o segundo ato do
    // defeito de 18/08/2026: mudar o selo de lugar nao bastou, porque a conta
    // continuava saindo de uma funcao que desistia antes.
    ok(/registrarContaDaTela\(total_items, poses_per_sheet/.test(PEDIDO),
        'a previa da aba Pedido publica o que mostrou');
    ok((PEDIDO.match(/registrarContaDaTela\(0, 0\)/g) || []).length >= 3,
        'e as tres desistencias da previa apagam a conta');

    // E o Sumario da aba Pedido nao pode voltar a publicar: ele apagaria, com
    // zero, a conta que a previa acabou de escrever.
    const iSum = PEDIDO.indexOf('function updatePedSummary');
    const fimSum = PEDIDO.indexOf('\nfunction ', iSum + 10);
    const corpoSum = PEDIDO.slice(iSum, fimSum > 0 ? fimSum : undefined);
    ok(corpoSum.indexOf('registrarContaDaTela') < 0,
        'o Sumario da aba Pedido nao mexe na conta');
})();

(function oNumeroApareceNoSumario() {
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    ok(html.indexOf('id="sum-vazias"') >= 0, 'a aba Imposicao tem a linha Celulas vazias');
    ok(html.indexOf('id="ped-sum-vazias"') >= 0, 'a aba Pedido tem a linha Celulas vazias');
    ok(/'sum-vazias', 'ped-sum-vazias'/.test(SCRIPT), 'e alguem as preenche');
})();

(function oSeloNaoPodeMorarNumBlocoEscondido() {
    // O defeito de 18/08/2026: a aba Pedido tem um `<div style="display: none
    // !important">` que engole toda a parte de baixo do cartao de configuracao
    // — mapa de teatro, camarote, Sumario, upload da arte e os botoes Gerar
    // PDF/Imprimir. O operador usa os botoes do cabecalho da Pre-visualizacao.
    //
    // O selo foi posto la dentro. Ele EXISTIA, era preenchido, e nao podia
    // aparecer. Os testes olhavam o `style.display` do proprio elemento e nunca
    // os ancestrais, entao passaram todos.
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

    // A faixa de cada bloco escondido por `display: none !important`, contando
    // profundidade de <div> ate ele fechar.
    const faixas = [];
    const abre = /<div[^>]*style="[^"]*display:\s*none\s*!important[^"]*"[^>]*>/gi;
    let m;
    while ((m = abre.exec(html)) !== null) {
        const inicio = m.index;
        let profundidade = 0, i = inicio;
        const tags = /<div\b|<\/div>/gi;
        tags.lastIndex = inicio;
        let t;
        while ((t = tags.exec(html)) !== null) {
            profundidade += (t[0].toLowerCase() === '</div>') ? -1 : 1;
            if (profundidade === 0) { i = tags.lastIndex; break; }
        }
        faixas.push([inicio, i]);
    }
    ok(faixas.length > 0, 'o bloco escondido da aba Pedido continua existindo (o teste tem o que vigiar)');

    const dentroDeAlgumEscondido = (id) => {
        const pos = html.indexOf('id="' + id + '"');
        if (pos < 0) return 'nao existe';
        return faixas.some(f => pos > f[0] && pos < f[1]);
    };

    // Estes tem de estar VISIVEIS: sao o que o operador precisa ver e clicar.
    ['ped-sobra-selo', 'ped-sobra-texto', 'ped-sobra-btn',
     'ped-opcoes-modelo', 'ped-soma-bar',
     'imp-sobra-selo', 'imp-opcoes-modelo', 'imp-soma-bar'].forEach(id => {
        ok(dentroDeAlgumEscondido(id) === false,
            id + ' nao pode ficar dentro de um bloco display:none !important', dentroDeAlgumEscondido(id));
    });
})();

// ─── O limiar ────────────────────────────────────────────────────────────────

(function oLimiarEFracaoDeFolha() {
    const quatro = estado([modelo('A', 29)]);          // sobram 3 de 4 = 75%
    ok(api(quatro).sobraMereceAviso(api(quatro).sobraDaImposicao()),
        'sobrar tres celulas de quatro avisa');

    // O mesmo numero de celulas num formato grande nao e desperdicio grande.
    const vinte = estado([modelo('A', 37)], null, { formatos: [{ id: 'f1', name: 'Grande', cols: 4, rows: 5 }] });
    const s = api(vinte).sobraDaImposicao();
    ok(s.vazias === 3, 'sobram tres celulas de vinte', s && s.vazias);
    ok(!api(vinte).sobraMereceAviso(s), 'e ai nao avisa: sao 15% de uma folha');
})();

(function oLimiarSaiDoAdmEResisteALixo() {
    const st = estado([modelo('A', 37)], null, { formatos: [{ id: 'f1', name: 'Grande', cols: 4, rows: 5 }] });
    ok(api(st).limiarDeSobra() === 0.5, 'sem nada gravado, meia folha');

    st.limiarSobra = 0.1;
    ok(api(st).sobraMereceAviso(api(st).sobraDaImposicao()),
        'baixando o limiar para 10%, os mesmos 15% passam a avisar');

    ['', null, 'abc', -1, 0, 5].forEach(v => {
        st.limiarSobra = v;
        ok(api(st).limiarDeSobra() === 0.5, 'valor invalido cai no padrao: ' + JSON.stringify(v));
    });
})();

(function oLimiarEIndependentePorProduto() {
    // Pedido do usuario em 18/08/2026: meia folha de PVC de credencial nao custa
    // o mesmo que meia folha de papel de pulseira.
    const pvc = modelo('Credencial', 29, { _vibe_id_produto: '901' });   // sobram 3 de 4 = 75%
    const st = estado([pvc], null, { limiarSobra: 0.9, limiaresPorProduto: {} });

    ok(!api(st).sobraMereceAviso(api(st).sobraDaImposicao()),
        'com o padrao em 90%, uma sobra de 75% nao avisa');

    st.limiaresPorProduto = { '901': 0.5 };
    ok(api(st).sobraMereceAviso(api(st).sobraDaImposicao()),
        'o produto com limiar proprio de 50% passa a avisar');

    // E o produto ao lado, sem valor proprio, continua no padrao.
    const outro = estado([modelo('Pulseira', 29, { _vibe_id_produto: '101' })],
                         null, { limiarSobra: 0.9, limiaresPorProduto: { '901': 0.5 } });
    ok(!api(outro).sobraMereceAviso(api(outro).sobraDaImposicao()),
        'produto sem valor proprio segue o padrao geral');

    ok(api(st).limiarDoProduto('901') === 0.5, 'o limiar do produto e o dele', api(st).limiarDoProduto('901'));
    ok(api(st).limiarDoProduto('101') === 0.9, 'o de quem nao tem e o padrao', api(st).limiarDoProduto('101'));

    // Lixo no banco nao pode virar aviso que nunca aparece nem que aparece sempre.
    [null, '', 'abc', 0, -1, 5].forEach(v => {
        st.limiaresPorProduto = { '901': v };
        ok(api(st).limiarDoProduto('901') === 0.9,
            'limiar invalido do produto cai no padrao: ' + JSON.stringify(v));
    });

    // O limiar viaja junto com a conta, para nenhum chamador esquecer de aplica-lo.
    st.limiaresPorProduto = { '901': 0.25 };
    ok(api(st).sobraDaImposicao().limiar === 0.25,
        'sobraDaImposicao devolve o limiar do produto', api(st).sobraDaImposicao().limiar);
})();

(function asDuasConfiguracoesDoProdutoNaoSeApagam() {
    // Uma linha, dois controles. Um upsert que mandasse so o campo mexido
    // apagaria o outro: marcar a caixa limparia o limiar, e digitar o limiar
    // desmarcaria a caixa.
    ok(/function gravarProdutoCombinavel/.test(SCRIPT),
        'existe um unico ponto que grava a linha do produto');
    const g = SCRIPT.slice(SCRIPT.indexOf('async function gravarProdutoCombinavel'),
                           SCRIPT.indexOf('async function gravarProdutoCombinavel') + 1400);
    ok(/liberado: atual\.liberado/.test(g), 'ele parte do liberado que ja estava');
    ok(/atual\.limiar_sobra/.test(g), 'e do limiar que ja estava');
    ok(/Object\.assign/.test(g), 'e so entao aplica a mudanca por cima');
})();

// ─── Quem pode entrar na folha ───────────────────────────────────────────────

(function soEntraOQueJaEstaLiberado() {
    const st = estado([modelo('A', 29)]);
    const a = api(st);

    ok(a.modeloLiberadoParaImprimir(modelo('B', 4)) === true,
        'arte aprovada e aguardando impressao entra');
    ok(a.modeloLiberadoParaImprimir(modelo('B', 4, { status_impressao: 'IMPRESSO' })) === false,
        'ja impresso nao entra');
    ok(a.modeloLiberadoParaImprimir(modelo('B', 4, { amostra_status: 'PENDENTE' })) === false,
        'arte pendente nao entra — o aproveitamento nao fura fila');
    ok(a.modeloLiberadoParaImprimir(modelo('B', 4, { amostra_status: 'REPROVADA' })) === false,
        'arte reprovada nao entra');
    ok(a.modeloLiberadoParaImprimir(null) === false, 'nada nao entra');
})();

(function oCandidatoPassaPelaMesmaRecusaDaSelecaoManual() {
    const itens = [
        modelo('Este', 29),
        modelo('Combina', 3),
        modelo('OutraCor', 3, { padrao: 'Papel comum' }),
        modelo('OutroFmt', 3, { formato_id: 'f2' }),
        modelo('Impresso', 3, { status_impressao: 'IMPRESSO' })
    ];
    const st = estado(itens);
    const nomes = api(st).candidatosDoPedido().map(c => c.item.nome_modelo);

    ok(nomes.indexOf('Combina') >= 0, 'o compativel entra', nomes);
    ok(nomes.indexOf('Este') < 0, 'o que ja esta na folha nao se sugere sozinho', nomes);
    ok(nomes.indexOf('OutraCor') < 0, 'cor diferente fica de fora', nomes);
    ok(nomes.indexOf('OutroFmt') < 0, 'formato diferente fica de fora', nomes);
    ok(nomes.indexOf('Impresso') < 0, 'ja impresso fica de fora', nomes);
})();

(function produtoLiberadoEUmaPermissaoSeparada() {
    const st = estado([modelo('A', 29)]);
    const a = api(st);
    ok(a.produtoLiberadoParaCombinar(modelo('B', 3)) === false,
        'sem liberacao no ADM, ninguem combina entre pedidos');
    st.produtosCombinaveis = new Set(['p1']);
    ok(api(st).produtoLiberadoParaCombinar(modelo('B', 3)) === true,
        'liberado no ADM, o produto pode');
    ok(api(st).produtoLiberadoParaCombinar(modelo('B', 3, { _vibe_id_produto: 'p9' })) === false,
        'outro produto continua fora');
})();

// ─── A composição: a conta exata ─────────────────────────────────────────────

function candidatos(pares) {
    return pares.map(p => ({ item: modelo(p[0], p[1]), osId: p[2] || 'os1', qtd: p[1] }));
}

(function fechaAFolhaComOMenorNumeroDeModelos() {
    const st = estado([modelo('A', 29)]);
    const s = api(st).sobraDaImposicao();          // sobram 3
    // Ha duas maneiras de fechar: 3 sozinho, ou 1 + 2. A escolha e a de um modelo.
    const c = api(st).melhorComposicao(s, candidatos([['Um', 1], ['Dois', 2], ['Tres', 3]]));

    ok(!!c, 'achou composicao');
    ok(c.vazias === 0, 'a folha fecha', c && c.vazias);
    ok(c.candidatos.length === 1, 'com um modelo so, e nao dois', c && c.candidatos.map(x => x.item.nome_modelo));
    ok(c.candidatos[0].item.nome_modelo === 'Tres', 'o que fecha sozinho', c && c.candidatos[0].item.nome_modelo);
    ok(c.itens === 32 && c.folhas === 8, '32 itens em 8 folhas', c && [c.itens, c.folhas]);
})();

(function somaVariosQuandoNenhumFechaSozinho() {
    const st = estado([modelo('A', 29)]);
    const s = api(st).sobraDaImposicao();          // sobram 3
    const c = api(st).melhorComposicao(s, candidatos([['Um', 1], ['Dois', 2]]));
    ok(!!c && c.vazias === 0, 'um mais dois fecham a folha', c && c.vazias);
    ok(c.candidatos.length === 2, 'e sao os dois', c && c.candidatos.length);
})();

(function aceitaMelhoraParcial() {
    const st = estado([modelo('A', 29)]);
    const s = api(st).sobraDaImposicao();          // sobram 3
    const c = api(st).melhorComposicao(s, candidatos([['Dois', 2]]));
    ok(!!c, 'dois itens ja melhoram');
    ok(c.vazias === 1, 'passa de tres celulas vazias para uma', c && c.vazias);
})();

(function naoSugereOQuePioraOuNaoMuda() {
    const st = estado([modelo('A', 29)]);
    const s = api(st).sobraDaImposicao();          // sobram 3
    // Um candidato de 4 itens ocupa uma folha inteira e deixa a sobra igual.
    ok(api(st).melhorComposicao(s, candidatos([['Quatro', 4]])) === null,
        'multiplo das celulas nao muda a sobra, entao nao vira sugestao');
    ok(api(st).melhorComposicao(s, []) === null, 'sem candidato nao ha sugestao');

    const semSobra = api(estado([modelo('A', 28)])).sobraDaImposicao();
    ok(api(st).melhorComposicao(semSobra, candidatos([['Um', 1]])) === null,
        'folha que ja fecha nao recebe sugestao');
})();

(function aContaEExataMesmoComMuitosCandidatos() {
    const st = estado([modelo('A', 37)], null, { formatos: [{ id: 'f1', name: 'Grande', cols: 4, rows: 5 }] });
    const s = api(st).sobraDaImposicao();          // 37 em 20 → sobram 3
    ok(s.vazias === 3, 'sobram tres de vinte', s && s.vazias);
    // Nenhum candidato sozinho fecha; 21 + 22 = 43, e 37+43 = 80 = 4 folhas cheias.
    const c = api(st).melhorComposicao(s, candidatos([['A', 21], ['B', 22], ['C', 9]]));
    ok(!!c && c.vazias === 0, 'a busca acha a soma que fecha, e nao so o candidato obvio', c && c.vazias);
})();

// ─── A trava de cruzar pedidos ───────────────────────────────────────────────

(function cruzarPedidoPorAcidenteContinuaRecusado() {
    const st = estado([modelo('A', 29)], [
        { itemId: 'm-A', osId: 'os1' },
        { itemId: 'm-B', osId: 'os2' }
    ]);
    st.osItens.os2 = [modelo('B', 3, { id: 'm-B', os_id: 'os2' })];
    const recado = api(st).problemaNaSelecao();
    ok(typeof recado === 'string', 'sem decisao, a selecao que cruza pedidos e recusada', recado);
    ok(/aproveitamento/i.test(recado || ''), 'e o recado diz por onde juntar de proposito', recado);
})();

(function cruzarPedidoPorDecisaoPassa() {
    const st = estado([modelo('A', 29)], [
        { itemId: 'm-A', osId: 'os1' },
        { itemId: 'm-B', osId: 'os2' }
    ], { combinacaoEntrePedidos: true });
    st.osItens.os2 = [modelo('B', 3, { id: 'm-B', os_id: 'os2' })];
    ok(api(st).problemaNaSelecao() === null,
        'com a composicao aceita, o cruzamento passa');
})();

(function modeloNaoCarregadoContinuaRecusadoAteComADecisao() {
    // A outra metade da trava: o item pode estar marcado e o pedido dele nao
    // carregado. Ai `sItem` vira undefined e a arte sai com qtd 0, em silencio.
    const st = estado([modelo('A', 29)], [
        { itemId: 'm-A', osId: 'os1' },
        { itemId: 'm-Z', osId: 'os2' }
    ], { combinacaoEntrePedidos: true });
    const recado = api(st).problemaNaSelecao();
    ok(typeof recado === 'string' && /carregados/.test(recado),
        'decidir cruzar pedido nao dispensa ter os itens carregados', recado);
})();

// ─── A lista do ADM e a mesma que ele ja ve nas telas de pedido ──────────────

(function aListaDoAdmUsaAReferenciaDasTelasDePedido() {
    // O nome que a grafica usa e `nomeReal` — assim mesmo, com o R maiusculo,
    // que e como a coluna existe na tabela do parceiro. Em 18/08/2026 a aba nova
    // do ADM nao o conhecia e mostrava "Produto #101" em tudo.
    const nomes = new Function('state', 'window',
        extrairFuncao(SCRIPT, 'nomeDoProdutoGlobal')
        + extrairFuncao(SCRIPT, 'produtosDaProducao')
        + 'return { nomeDoProdutoGlobal, produtosDaProducao };');

    const st = {
        produtosGlobais: [
            { id_produto: 101, nomeReal: 'Pulseira Triband', setor_pcp: 'LASER', ativo: true },
            { id_produto: 901, nomeReal: 'Credencial PVC', setor_pcp: 'PVC', ativo: true },
            { id_produto: 401, nomeReal: 'Ingresso MOBI', setor_pcp: 'LASER', ativo: true },
            { id_produto: 50, nomeReal: 'Cordao Estoque', setor_pcp: null, ativo: true },
            { id_produto: 51, nomeReal: 'Item Fiscal', setor_pcp: '', ativo: true }
        ]
    };
    const a = nomes(st, global.window);

    ok(a.nomeDoProdutoGlobal(st.produtosGlobais[0]) === 'Pulseira Triband',
        'o nome vem de nomeReal', a.nomeDoProdutoGlobal(st.produtosGlobais[0]));
    ok(/^Produto #/.test(a.nomeDoProdutoGlobal({ id_produto: 9 })),
        'sem nomeReal, diz o numero em vez de "undefined"');

    const lista = a.produtosDaProducao().map(p => p.nomeReal);
    ok(lista.length === 3, 'so os produtos com setor no PCP entram', lista);
    ok(lista.indexOf('Cordao Estoque') < 0 && lista.indexOf('Item Fiscal') < 0,
        'item de estoque e de nota fiscal ficam de fora', lista);
    ok(lista[0] === 'Credencial PVC' && lista[2] === 'Pulseira Triband',
        'em ordem alfabetica', lista);

    // E a tela de pedido, que e a referencia, continua lendo o mesmo campo.
    ok(/prodObj\.nomeReal/.test(PEDIDO), 'a fila do Painel de Producao usa nomeReal');
    ok(/prodObj\.nomeReal/.test(SCRIPT), 'a fila da Lista de Arte usa nomeReal');
})();

// ─── As duas telas ───────────────────────────────────────────────────────────

(function oSeloEstaNasDuasAbas() {
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    ['imp-sobra-selo', 'imp-sobra-texto', 'imp-sobra-btn',
     'ped-sobra-selo', 'ped-sobra-texto', 'ped-sobra-btn'].forEach(id => {
        ok(html.indexOf('id="' + id + '"') >= 0, 'o index.html tem ' + id);
    });
    ok(/atualizarSeloDeSobra\(\)/.test(SCRIPT), 'e alguem pinta o selo');
})();

(function oSeloTemDestaqueEEmAmarelo() {
    // O selo nasceu em 0,82rem e cinza sobre cinza, e o operador nao o via.
    // Em 18/08/2026 o usuario pediu fonte maior e amarelo. Este teste existe
    // para que o destaque nao volte a se dissolver num estilo inline discreto.
    const html = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    const css  = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

    ['imp-sobra-selo', 'ped-sobra-selo'].forEach(id => {
        const tag = html.slice(html.indexOf('id="' + id + '"') - 200,
                               html.indexOf('id="' + id + '"') + 200);
        ok(/class="[^"]*\bselo-sobra\b/.test(tag), id + ' usa a classe selo-sobra', tag);
    });

    const bloco = (seletor) => {
        const i = css.indexOf(seletor + ' {');
        return i < 0 ? '' : css.slice(i, css.indexOf('}', i));
    };

    const base = bloco('.selo-sobra');
    const tam = /font-size:\s*([\d.]+)rem/.exec(base);
    ok(tam && parseFloat(tam[1]) >= 1, 'a fonte do selo e maior que a do corpo', tam && tam[1]);
    ok(/font-weight:\s*(700|bold)/.test(base), 'e vem em negrito', base);

    ok(/var\(--amber\)/.test(bloco('.selo-sobra.tem-sobra')), 'com sobra o selo fica amarelo');
    ok(/var\(--green\)/.test(bloco('.selo-sobra.fecha-certo')),
        'e verde quando a folha fecha certo — senao o amarelo perde o sentido de atencao');
    ok(/box-shadow/.test(bloco('.selo-sobra.merece-aviso')), 'acima do limiar ele ainda ganha brilho');

    // E quem poe as classes e a funcao que ja pinta o selo.
    const pinta = extrairFuncao(SCRIPT, 'atualizarSeloDeSobra');
    ok(/classList\.toggle\('tem-sobra',\s*s\.vazias > 0\)/.test(pinta), 'o amarelo segue a sobra', );
    ok(/classList\.toggle\('fecha-certo',\s*s\.vazias === 0\)/.test(pinta), 'o verde segue a folha fechada');
    ok(/classList\.toggle\('merece-aviso',\s*oferecer\)/.test(pinta), 'e o brilho segue o limiar');
})();

(function oPedidoDeCadaArteVaiNoPayload() {
    // Sem isto, uma folha com dois pedidos manda todos os QRs com o pedido
    // errado — coluna errada do pool e prefixo errado. So aparece na portaria.
    ok(/pedido: arte\._pedido \|\| null/.test(SCRIPT), 'a tela Imposicao manda o pedido por arte');
    ok(/pedido: arte\._pedido \|\| null/.test(PEDIDO), 'a tela Pedido manda o pedido por arte');
    ok(/_pedido: numeroDoPedidoDoItem\(s\.osId\)/.test(SCRIPT), 'e o valor sai do pedido do modelo');
    ok(/numeroDoPedidoDoItem\(s\.osId\)/.test(PEDIDO), 'nas duas telas');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
