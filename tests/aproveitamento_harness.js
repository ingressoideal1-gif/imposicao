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
               'quantidadeDoModelo', 'itemAtivoDoPedido', 'itensDaImposicao',
               'rotuloDoModelo', 'porQueNaoCombina', 'modoDeImpressaoDoModelo',
               'limiarDeSobra', 'sobraDaImposicao', 'sobraMereceAviso', 'textoDaSobra',
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
    return Object.assign({
        formatos: [CREDENCIAL], numeracoes: [], cores: [],
        ordens: [{ id: 'os1', numero: '20495' }, { id: 'os2', numero: '20508' }],
        osItens: { os1: itensOs1 },
        selectedOSItems: selecionados || [],
        activeOSItem: { osId: 'os1', itemId: itensOs1[0].id },
        produtosCombinaveis: new Set()
    }, extra || {});
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

(function semFormatoNaoInventaConta() {
    const st = estado([modelo('SemFmt', 29, { formato_id: 'nao-existe' })]);
    ok(api(st).sobraDaImposicao() === null, 'sem formato devolve null em vez de um numero inventado');
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
