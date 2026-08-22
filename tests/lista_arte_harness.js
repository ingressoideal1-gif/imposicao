// Lista de Arte: pedido liberado para producao so aparece no card "Pedidos
// Concluidos".
//
// Roda em node, sem navegador: `node tests/lista_arte_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// A funcao e LIDA do `script.js` e avaliada aqui — nao copiada. Uma copia
// continuaria passando depois de o original mudar, que e exatamente o defeito
// que este projeto ja produziu tres vezes com o clone script.js -> pedido.js.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrair(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

function extrairConst(nome) {
    const i = SCRIPT.indexOf('\nconst ' + nome + ' = [');
    if (i < 0) throw new Error('nao achei a lista ' + nome + ' no script.js');
    const fim = SCRIPT.indexOf('];', i);
    if (fim < 0) throw new Error('nao achei o fim da lista ' + nome);
    return SCRIPT.slice(i, fim + 2);
}

const { pedidoSaiuDaArte } = new Function(
    extrairConst('SINAIS_SAIU_DA_ARTE') + '\n' + extrair('pedidoSaiuDaArte')
    + '\nreturn { pedidoSaiuDaArte };')();

// ─── Quem saiu da arte ───────────────────────────────────────────────────────

(function oStatusInternoDeProducaoTiraDaArte() {
    // E o valor que liberarParaProducao() grava. E o caso do pedido do dia a dia.
    ok(pedidoSaiuDaArte({ status_interno: 'EM PRODUCAO' }), 'EM PRODUCAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EM PRODUÇÃO' }), 'com cedilha tambem');
    ok(pedidoSaiuDaArte({ status_interno: 'em producao' }), 'em caixa baixa tambem');
    ok(pedidoSaiuDaArte({ status_interno: '  EM PRODUCAO  ' }), 'com espaco em volta tambem');
})();

(function osOutrosSinaisDeQueSaiuDaArte() {
    ok(pedidoSaiuDaArte({ status_interno: 'EM IMPRESSAO' }), 'EM IMPRESSAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'FINALIZADA' }), 'FINALIZADA sai da arte');
    // liberarParaProducao() grava nos dois campos; ler so um deixaria passar o
    // pedido que veio do Vibecode com o sinal no `status`.
    ok(pedidoSaiuDaArte({ status: 'EM PRODUCAO' }), 'o sinal tambem vale no campo status');
})();

(function asPalavrasDoParceiroQueTambemSaemDaArte() {
    // 20/08/2026: pedido ja embalado continuava ocupando a tela do designer.
    // As palavras foram escolhidas contando o que existe nas 8.268 propostas.
    ok(pedidoSaiuDaArte({ status_interno: 'IMPRESSO' }), 'IMPRESSO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EM ACABAMENTO' }), 'EM ACABAMENTO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EXPEDICAO' }), 'EXPEDICAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EXPEDIÇÃO' }), 'EXPEDICAO com cedilha tambem');
    ok(pedidoSaiuDaArte({ status_interno: 'EM TRANSITO' }), 'EM TRANSITO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'EM TRÂNSITO' }), 'EM TRANSITO com acento tambem');
    ok(pedidoSaiuDaArte({ status_interno: 'ENTREGUE' }), 'ENTREGUE sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'REVISAO PRODUCAO' }), 'REVISAO PRODUCAO sai da arte');
    ok(pedidoSaiuDaArte({ status_interno: 'REVISÃO PRODUÇÃO' }), 'REVISAO PRODUCAO com acento tambem');
})();

(function asDuasPalavrasQueNAOPodemEntrar() {
    // Sao 3.363 e 3.224 dos 8.268 pedidos do ERP -- dois tercos do banco, e o
    // pedido mais novo do dia esta em LIBERADO. Qualquer uma das duas aqui
    // esvaziaria a Lista de Arte inteira.
    ok(!pedidoSaiuDaArte({ status_interno: 'APROVADO' }),
        'APROVADO (3.363 pedidos) NAO tira da arte -- e estado comercial');
    ok(!pedidoSaiuDaArte({ status_interno: 'LIBERADO' }),
        'LIBERADO (3.224 pedidos) NAO tira da arte -- e estado comercial');
    // O atendente revisa ANTES de mandar ao cliente: ainda e trabalho de arte.
    ok(!pedidoSaiuDaArte({ status_interno: 'REVISAO ATENDENTE' }),
        'REVISAO ATENDENTE NAO tira da arte');
    // Cancelado nao "saiu" da arte, deixou de existir. Card de concluidos e de
    // trabalho feito.
    ok(!pedidoSaiuDaArte({ status_interno: 'CANCELADO' }),
        'CANCELADO NAO vai para o card de concluidos');
    ok(!pedidoSaiuDaArte({ status_interno: 'NOVO' }), 'NOVO e arte');
    ok(!pedidoSaiuDaArte({ status_interno: 'AGUARDANDO' }), 'AGUARDANDO e arte');
    ok(!pedidoSaiuDaArte({ status_interno: 'NOVO_ARTE_APROVADA' }), 'NOVO_ARTE_APROVADA e arte');
})();

(function quemContinuaNaArte() {
    ok(!pedidoSaiuDaArte({ status: 'EM ARTE' }), 'pedido em arte fica');
    ok(!pedidoSaiuDaArte({ status: 'APROVADA', status_interno: '' }), 'pedido aprovado fica');
    ok(!pedidoSaiuDaArte({ status: 'AGUARD. APROVAÇÃO' }), 'pedido em aprovacao fica');
    ok(!pedidoSaiuDaArte({}), 'pedido sem status nenhum fica');
    ok(!pedidoSaiuDaArte(null), 'e pedido nulo nao quebra a lista');
})();

// ─── Onde a regra e aplicada ─────────────────────────────────────────────────
//
// A classificacao saiu de dentro do `renderOrdens` e virou a funcao
// `classificarPedidoNaArte`, para a caixa "Designers Ideal" poder contar os
// pedidos com o MESMO criterio dos cards. O que este bloco guarda continua
// sendo o mesmo: a ordem das perguntas.

(function saiuDaArteEAPrimeiraPergunta() {
    // Se esta pergunta nao vier antes das outras tres, o pedido liberado volta a
    // ser contado em "Em Arte"/"Em Aprovacao"/"Aprovados" e reaparece na tabela.
    ok(/if \(pedidoSaiuDaArte\(os\)\) fila = 'concluidos';[\s\S]{0,120}?else if \(isTotalmenteAprovado\) fila = 'aprovados';/.test(SCRIPT),
        'o pedido que saiu da arte e separado antes de entrar em qualquer fila');
})();

(function oRenderUsaAFuncaoEmVezDeUmaCopia() {
    // Duas classificacoes parecidas divergem no primeiro ajuste que alguem fizer
    // numa delas -- e a divergencia aparece como pedido que soma num lugar e
    // some noutro.
    ok(/const c = classificarPedidoNaArte\(os\);/.test(SCRIPT),
        'o renderOrdens classifica pela funcao');
    ok(/if \(c\.fila === 'concluidos'\) ordensConcluidosArte\.push\(os\);/.test(SCRIPT),
        'e enche os baldes com o que ela responde');

    // O badge da Lista de Impressao depende deste campo gravado no pedido.
    ok(/os\.status_calculado = c\.statusCalculado;/.test(SCRIPT),
        'o status_calculado continua sendo gravado no pedido');
})();

(function oCardContaOMesmoBalde() {
    // Card e filas tem de sair do mesmo lugar: dois criterios parecidos que
    // divergem deixariam pedido fora de todos os cards ao mesmo tempo.
    ok(/const totalConcluidosArte = ordensConcluidosArte\.length;/.test(SCRIPT),
        'o card "Pedidos Concluidos" conta o balde que a classificacao encheu');
    ok(/statPedidosConcluidosArteEl\.textContent = totalConcluidosArte/.test(SCRIPT),
        'e esse total e o que vai para a tela');
})();

(function oFiltroDeStatusNaoRessuscita() {
    // Filtrar por status varria state.ordens inteiro e trazia de volta, na
    // tabela, justamente os pedidos que ja tinham saido da arte.
    ok(!/baseOrdensArte = state\.ordens;/.test(SCRIPT),
        'o filtro de status nao varre state.ordens');
    ok(/baseOrdensArte = \[\.\.\.ordensFilaArte, \.\.\.ordensAprovacao, \.\.\.ordensAprovados\];/.test(SCRIPT),
        'ele varre so quem continua na arte');
})();

// ─── Os cinco cards abrem a lista deles ──────────────────────────────────────
//
// Usuario, 19/08/2026: "ao clicar em qualquer um dos cards, deve atualizar a
// pagina conforme os status de cada card". O de Concluidos era o unico mudo --
// e, desde que os pedidos em producao passaram a contar SO nele, era tambem o
// unico caminho para ve-los nesta pagina. Card que conta e nao abre vira beco.

(function todosOsCincoCardsAbremAFilaDeles() {
    const CARDS = [
        ['card-stat-pedidos-todos', 'todos'],
        ['card-stat-pedidos-fila', 'fila'],
        ['card-stat-pedidos-aprovacao', 'aprovacao'],
        ['card-stat-pedidos-aprovados', 'aprovados'],
        ['card-stat-pedidos-concluidos', 'concluidos'],
    ];
    CARDS.forEach(([id, tipo]) => {
        const i = INDEX.indexOf('id="' + id + '"');
        ok(i > 0, 'o card ' + id + ' existe');
        // A tag inteira: `class` vem ANTES do `id` no markup, e uma fatia que
        // comecasse no id perderia justamente o `clickable-card`.
        const linha = INDEX.slice(INDEX.lastIndexOf('<div', i), INDEX.indexOf('>', i));
        ok(linha.includes(`setFiltroFilaArte('${tipo}')`), id + ' filtra por ' + tipo, linha);
        ok(linha.includes('clickable-card'), id + ' se apresenta como clicavel');
        ok(linha.includes('title="'), id + ' diz em texto o que o clique faz');
    });
})();

(function oCardDeConcluidosAbreOBaldeDeConcluidos() {
    ok(/activeFilaTipo === 'concluidos'\)\s*\{\s*baseOrdensArte = ordensConcluidosArte;/.test(SCRIPT),
        'a fila de Concluidos e o balde que o card conta');
    ok(/Pedidos Conclu[ií]dos`/.test(SCRIPT), 'e a tabela muda de titulo');
    ok(/cardConcluidosEl\.style\.border/.test(SCRIPT), 'e o card escolhido se destaca');
    ok(/\[cardTodosEl, cardFilaEl, cardAprovacaoEl, cardAprovadosEl, cardConcluidosEl\]/.test(SCRIPT),
        'e ele volta ao normal quando outro card e escolhido');
})();

(function aCasaVaziaDeConcluidosNaoFalaDeArte() {
    // "Nenhum pedido em fase de arte" debaixo do card de Concluidos diria a
    // coisa errada sobre a coisa certa: eles justamente nao estao mais em arte.
    ok(/Nenhum pedido saiu da arte para a produ/.test(SCRIPT),
        'a casa vazia de Concluidos tem frase propria');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

// ─── O catalogo de numeracoes e relido ao abrir o pedido ─────────────────────
//
// 22/08/2026: a "Expointer 2026" ja estava sem CSV no banco, e o card do modelo
// 1000496 (pedido 21085) ainda dizia "gerado 19500": a aba tinha o catalogo de
// horas antes. A mescla e pura e e LIDA do script.js.

(function oCatalogoERelidoAoAbrirOPedido() {
    const { mesclarNumeracoesNoCatalogo } = new Function(
        extrair('mesclarNumeracoesNoCatalogo') + '\nreturn { mesclarNumeracoesNoCatalogo };')();

    const catalogo = [
        { id: 'a', name: 'Expointer 2026', csv_data: new Array(19500).fill({}) },
        { id: 'b', name: '1000475' },
    ];
    const n = mesclarNumeracoesNoCatalogo(catalogo, [
        { id: 'a', name: 'Expointer 2026', csv_data: null },                    // o CSV foi tirado em outra aba
        { id: 'c', name: '1000496', csv_data: new Array(4000).fill({}) },       // criada em outra aba
    ]);
    ok(n === 2, 'duas numeracoes mescladas', n);
    ok(catalogo.length === 3, 'a que nao existia entrou no catalogo');
    ok(catalogo.find(x => x.id === 'a').csv_data === null, 'a linha nova substitui a velha pelo id');
    ok(catalogo.find(x => x.id === 'c').csv_data.length === 4000, 'a nova traz o CSV de verdade');
    ok(catalogo.find(x => x.id === 'b').name === '1000475', 'quem nao veio no lote fica como estava');
    ok(mesclarNumeracoesNoCatalogo(catalogo, null) === 0 && mesclarNumeracoesNoCatalogo(null, []) === 0,
        'sem lista, nada muda');

    // E os tres caminhos que desenham a partir do catalogo releem antes.
    const nav = SCRIPT.indexOf("console.log('[Nav] Carregando itens da OS...')");
    ok(nav > 0, 'achei a abertura do pedido na Lista de Arte');
    const trecho = SCRIPT.slice(nav, nav + 1500);
    ok(/await loadOSItens\(realOSId\)[\s\S]{0,900}await recarregarNumeracoesDoPedido\(realOSId\)/.test(trecho),
        'abrir o pedido na Lista de Arte rele as numeracoes dele depois dos itens');
    ok(/async function enviarParaImposicao\([\s\S]{0,900}await recarregarNumeracoesDoPedido\(osId\)/.test(SCRIPT),
        'mandar o modelo para a Imposicao rele as numeracoes do pedido');
    ok(/async function abrirImposicaoDoPedido\([\s\S]{0,400}await recarregarNumeracoesDoPedido\(osId\)/.test(SCRIPT),
        'abrir o pedido inteiro na Imposicao rele as numeracoes');
    ok(/async function recarregarNumeracoesDoPedido\([\s\S]{0,1500}catch \(e\)/.test(SCRIPT),
        'a releitura nunca lanca: sem rede a tela segue com o que tem');

    // A linha relida entra com a MESMA forma que o api() entrega: sem o elemento
    // METADATA e com print_mode. Na v683 ela entrava crua, e o lapis do card abria
    // o editor com um elemento a mais.
    const { normalizarNumeracaoLida } = new Function(
        extrair('normalizarNumeracaoLida') + '\nreturn { normalizarNumeracaoLida };')();
    const crua = { id: 'x', elements: [{ id: 'el_1', type: 'QR' }, { id: 'metadata', type: 'METADATA', print_mode: 'duplex' }] };
    normalizarNumeracaoLida(crua);
    ok(crua.elements.length === 1 && crua.elements[0].type === 'QR', 'o METADATA sai dos elements');
    ok(crua.print_mode === 'duplex', 'e o print_mode vem dele quando a coluna nao tem');
    ok(normalizarNumeracaoLida({ id: 'y', elements: [] }).print_mode === 'front', 'sem nada, print_mode e front');
    ok(/\(data \|\| \[\]\)\.map\(normalizarNumeracaoLida\)/.test(SCRIPT),
        'a releitura do pedido normaliza antes de mesclar');
    ok(/data\.forEach\(normalizarNumeracaoLida\)/.test(SCRIPT) && /normalizarNumeracaoLida\(data\);/.test(SCRIPT),
        'o api() tambem usa a mesma funcao, na lista e por id');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
