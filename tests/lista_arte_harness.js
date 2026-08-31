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
    // CANCELADO vai para o card de concluidos (regra de 28/08/2026), mas por
    // OUTRA porta: o `pedidoCancelado`, testado mais abaixo. Fora desta lista
    // ele tem de continuar, porque ela e tambem a entrada dos paineis
    // (`pedidosJaNaGrafica`) -- e cancelado nao entra nos paineis.
    ok(!pedidoSaiuDaArte({ status_interno: 'CANCELADO' }),
        'CANCELADO NAO entra em SINAIS_SAIU_DA_ARTE -- essa lista abre a porta dos paineis');
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

// ─── O cancelado tambem e "concluido" (28/08/2026) ───────────────────────────
//
// Usuario: "pedidos com status 'cancelado' na coluna status_interno da tabela
// propostas considerar pedido concluido (card)". Ele sai da fila do designer,
// que abria um pedido morto para descobrir que nao havia nada a fazer.

const { pedidoCancelado } = new Function(
    extrairConst('SINAIS_CANCELADO') + '\n' + extrair('pedidoCancelado')
    + '\nreturn { pedidoCancelado };')();

(function oCanceladoEReconhecido() {
    ok(pedidoCancelado({ status_interno: 'CANCELADO' }), 'CANCELADO e cancelado');
    ok(pedidoCancelado({ status_interno: 'CANCELADA' }), 'no feminino tambem');
    ok(pedidoCancelado({ status_interno: 'cancelado' }), 'em caixa baixa tambem');
    ok(pedidoCancelado({ status_interno: '  CANCELADO  ' }), 'com espaco em volta tambem');
})();

(function soOStatusInternoConta() {
    // O usuario nomeou a coluna. O `status` da OS carrega override local e
    // status de arte -- um "CANCELADO" ali significaria outra coisa.
    ok(!pedidoCancelado({ status: 'CANCELADO' }),
        'o campo status da OS NAO cancela o pedido -- so o status_interno da proposta');
    ok(!pedidoCancelado({ status_interno: 'EM PRODUCAO' }), 'quem esta em producao nao e cancelado');
    ok(!pedidoCancelado({}), 'pedido sem status nenhum nao e cancelado');
    ok(!pedidoCancelado(null), 'e pedido nulo nao quebra a lista');
})();

(function oCanceladoNaoAbreAPortaDosPaineis() {
    // A regra so RECLASSIFICA quem ja esta na tela. Se `CANCELADO` entrasse na
    // lista de cima, os paineis de Arte, Producao e Acabamento receberiam todos
    // os cancelados do ERP, inclusive os que a grafica nunca viu.
    ok(!/'CANCELAD[AO]'/.test(extrairConst('SINAIS_SAIU_DA_ARTE')),
        'CANCELADO continua fora de SINAIS_SAIU_DA_ARTE');
})();

(function oCanceladoEAPerguntaAnteriorATODAS() {
    // Antes de `pedidoSaiuDaArte` e antes das tres filas: com a arte aprovada no
    // ERP, o cancelado caia em "Aprovados" e voltava para a frente do designer.
    ok(/if \(pedidoCancelado\(os\)\) \{\s*return \{ statusCalculado: 'CANCELADA', fila: 'concluidos' \};/.test(SCRIPT),
        'o cancelado e separado antes de qualquer outra pergunta, e vai para concluidos');
    // Badge proprio: em Concluidos, "Em Arte" seria justamente a mentira que
    // fazia o designer abrir o pedido.
    ok(/'CANCELADA':\s*\{ icon: '❌'/.test(SCRIPT),
        'e o status CANCELADA tem badge proprio no getStatusBadge');
})();

(function aColunaDeTempoNaoCarimbaProducaoNoCancelado() {
    // Na lista de Concluidos a coluna vira "Entrou em Producao". O cancelado
    // nunca entrou -- a celula diz o que houve em vez de carimbar uma data.
    ok(/if \(pedidoCancelado\(os\)\) \{[\s\S]{0,400}?>Cancelado<\/td>/.test(SCRIPT),
        'a celula de tempo do cancelado diz "Cancelado"');
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
    // O `, { comBanco: false }` entrou em 26/08/2026: a tela de Amostras abre sem
    // o `csv_data` (22 MB no pedido 21202) e os bancos chegam em segundo plano.
    // O que este teste guarda continua sendo a ORDEM -- itens, depois numeracoes.
    ok(/await loadOSItens\(realOSId\)[\s\S]{0,900}await recarregarNumeracoesDoPedido\(realOSId[,)]/.test(trecho),
        'abrir o pedido na Lista de Arte rele as numeracoes dele depois dos itens');
    // `[,)]` no fim: em 27/08/2026 estes dois passaram a ler ENXUTO tambem, com
    // `, { comBanco: false }`. Trocar de modelo no 21202 baixava 17 MB por
    // clique e a tela ficava parada -- ver test_csv_sob_demanda.py. O que este
    // teste guarda continua sendo que a releitura ACONTECE.
    ok(/async function enviarParaImposicao\([\s\S]{0,2500}await recarregarNumeracoesDoPedido\(osId[,)]/.test(SCRIPT),
        'mandar o modelo para a Imposicao rele as numeracoes do pedido');
    ok(/async function abrirImposicaoDoPedido\([\s\S]{0,900}await recarregarNumeracoesDoPedido\(osId[,)]/.test(SCRIPT),
        'abrir o pedido inteiro na Imposicao rele as numeracoes');
    ok(/async function recarregarNumeracoesDoPedido\([\s\S]{0,3000}catch \(e\)/.test(SCRIPT),
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

// ─── Elemento de banco de dados sem banco ou sem coluna trava o PRONTO ──────
//
// Regra do usuario, 22/08/2026, nascida do pedido 21085: onze modelos apontavam
// para uma numeracao com QR de banco de dados e nenhum CSV, e nada na tela
// dizia isso. As funcoes sao LIDAS do script.js, com um `state` de mentira.

(function bancoIncompletoTravaOPronto() {
    const fonte = ['numeracaoIdDoItem', 'numeracaoDoModelo', 'resolverNumeracaoParaModelo', 'vinculoDeBancoDoModelo', 'bancoDeDadosIncompletoDoModelo']
        .map(extrair).join('\n');
    const state = { numeracoes: [] };
    const api = new Function('state', fonte + '\nreturn { bancoDeDadosIncompletoDoModelo };')(state);
    const regra = api.bancoDeDadosIncompletoDoModelo;

    const qr = (col) => ({ id: 'el_1', type: 'QR', source: 'database', csv_column: col });
    const texto = { id: 'el_2', type: 'TEXT' };
    state.numeracoes.push(
        { id: 'ok',        elements: [qr('CODIGO'), texto], csv_headers: ['CODIGO', 'NOME'], csv_data: [{ CODIGO: '1', NOME: 'A' }] },
        { id: 'sem-csv',   elements: [qr('CODIGO'), texto], csv_headers: [], csv_data: null },
        { id: 'sem-col',   elements: [qr(''), texto],       csv_headers: ['CODIGO'], csv_data: [{ CODIGO: '1' }] },
        { id: 'col-errada',elements: [qr('CPF'), texto],    csv_headers: ['CODIGO'], csv_data: [{ CODIGO: '1' }] },
        { id: 'sem-banco', elements: [texto],               csv_data: null },
        { id: 'sem-cabec', elements: [qr('CODIGO')],        csv_headers: [], csv_data: [{ CODIGO: '1', __id: 1 }] },
    );
    const modelo = (numId) => ({ id: 'm-' + numId, amostra_num_id: numId });

    ok(regra(modelo('ok')) === null, 'CSV carregado e coluna existente: nada a apontar');
    ok(regra(modelo('sem-banco')) === null, 'numeracao sem elemento de banco nao e cobrada por CSV');
    ok(regra(modelo('sem-cabec')) === null, 'sem csv_headers, as chaves da linha valem como colunas');
    const a = regra(modelo('sem-csv'));
    ok(a && a.motivo === 'sem_banco' && /nenhum CSV/.test(a.texto), 'elemento de banco sem CSV e apontado', a);
    const b = regra(modelo('sem-col'));
    ok(b && b.motivo === 'coluna' && /QR sem coluna/.test(b.texto), 'elemento de banco sem coluna e apontado', b);
    const c = regra(modelo('col-errada'));
    ok(c && c.motivo === 'coluna' && /"CPF" não existe/.test(c.texto), 'coluna que nao existe no CSV e apontada', c);
    ok(regra({ id: 'x', amostra_num_id: 'nao-existe' }) === null, 'modelo cuja numeracao nao esta no catalogo nao trava');
    ok(regra(null) === null, 'sem modelo, nada');

    // E a regra esta ligada nos dois lugares: no botao do card e no clique.
    // A lista de travas cresce (em 25/08/2026 entrou a `travaDeGlifo`, do
    // caractere que a fonte nao desenha), entao a conferencia e pela PRESENCA
    // de cada uma na expressao do `disabled`, e nao pela frase inteira.
    ok(/travaDeCelulas \|\| travaDeBanco[^?]*\? 'disabled'/.test(SCRIPT), 'o botao MARCAR PRONTO fica trancado pela trava de banco');
    ok(/\$\{faixaBancoIncompleto\}/.test(SCRIPT), 'o card mostra a faixa do banco incompleto');
    // `return false;` desde as acoes em lote (22/08/2026): a funcao passou a
    // devolver se gravou; a trava continua interrompendo o PRONTO do mesmo jeito.
    ok(/const bancoIncompleto = bancoDeDadosIncompletoDoModelo\(itemAlvo\);\s*if \(bancoIncompleto\) \{[\s\S]{0,400}return( false)?;/.test(SCRIPT),
        'o clique em PRONTO confere a regra e para, com aviso');
    ok(/ehTelaDoCliente \? null : bancoDeDadosIncompletoDoModelo\(item\)/.test(SCRIPT),
        'no link do cliente a trava nao aparece: ele nao tem como consertar a numeracao');
})();

// --- AGUARDANDO e' arte com o designer, nao com o cliente (31/08/2026) ------
//
// O ERP cria a linha de `pedidos_artes` com status 'AGUARDANDO'. Enquanto essa
// palavra esteve na lista `ARTE_EM_APROVACAO`, TODO pedido novo nascia
// classificado como "Aguard. Aprovacao" e caia na Fila de Aprovacao -- sem a
// arte ter sido marcada como pronta nem encaminhada ao atendimento. Foi o que o
// usuario relatou no pedido 21413.
//
// A palavra que significa o contrario e' `AGUARDANDO_APROVACAO`, e ela fica.

const estadoArte = {};
const { classificarPedidoNaArte } = new Function('state',
    extrairConst('SINAIS_SAIU_DA_ARTE') + '\n'
    + extrairConst('SINAIS_CANCELADO') + '\n'
    + extrairConst('ARTE_REPROVADOS') + '\n'
    + extrairConst('ARTE_APROVADOS') + '\n'
    + extrairConst('ARTE_EM_APROVACAO') + '\n'
    + extrairConst('ARTE_COM_O_DESIGNER') + '\n'
    + extrair('pedidoSaiuDaArte') + '\n'
    + extrair('pedidoCancelado') + '\n'
    + extrair('classificarPedidoNaArte')
    + '\nreturn { classificarPedidoNaArte };')(estadoArte);

// Monta o pedido do jeito que o `loadOrdens` monta: a arte do ERP em
// `state.todasArtes`, o link do cliente em `state.linksCliente`.
function classificarComArte(statusDaArte, extra) {
    extra = extra || {};
    estadoArte.todasArtes = [{ id_int: 900, status: statusDaArte, entrega_dados: extra.entrega || null }];
    estadoArte.modelosGlobais = {};
    estadoArte.osItens = {};
    estadoArte.linksCliente = extra.link ? { 'os-900': 'https://exemplo/cliente/900-x' } : {};
    estadoArte.linksClienteData = extra.link
        ? { 'os-900': { token: 'x', cliente_abriu_em: extra.abriu || null } }
        : {};
    const os = Object.assign({ id: 'os-900', numero: '900', status: '' }, extra.os || {});
    return classificarPedidoNaArte(os);
}

(function aArteQueEsperaODesignerFicaEmArte() {
    const c = classificarComArte('AGUARDANDO');
    ok(c.fila === 'fila', 'AGUARDANDO fica no card "Em Arte"', c);
    ok(c.statusCalculado === 'Em Arte', 'e o badge dele diz "Em Arte"', c);

    const d = classificarComArte('EM ARTE');
    ok(d.fila === 'fila' && d.statusCalculado === 'Em Arte', 'EM ARTE tambem', d);

    // O que o proprio loadOrdens grava quando a OS vem 'ARTE' ou 'NOVO'.
    const e = classificarComArte('AGUARDANDO', { os: { status: 'ARTE_EM_ANDAMENTO' } });
    ok(e.fila === 'fila' && e.statusCalculado === 'Em Arte', 'ARTE_EM_ANDAMENTO tambem', e);
})();

(function aPalavraOPOSTAContinuaValendo() {
    const c = classificarComArte('AGUARDANDO_APROVACAO');
    ok(c.fila === 'aprovacao', 'AGUARDANDO_APROVACAO vai para a Fila de Aprovacao', c);
    ok(c.statusCalculado === 'Aguard. Aprovação', 'e o badge diz "Aguard. Aprovacao"', c);

    const d = classificarComArte('AGUARD. APROVAÇÃO');
    ok(d.fila === 'aprovacao', 'a forma com acento tambem', d);
})();

(function oLinkExistirNaoMoveMaisOPedido() {
    // Ate 31/08/2026 a existencia do link significava "a arte saiu para o
    // cliente", porque o link so nascia quando o atendente decidia mandar. Nesse
    // dia o link passou a nascer junto com a arte pronta -- entao ele existe
    // para todo pedido que o designer terminou, e nao prova nada.
    const c = classificarComArte('AGUARDANDO', { link: true });
    ok(c.fila === 'fila', 'link gerado, cliente nao olhou: fica em "Em Arte"', c);
    ok(c.statusCalculado === 'Em Arte', 'e o badge continua "Em Arte"', c);
})();

(function quemMoveOPedidoEOClienteOlhar() {
    // `cliente_abriu_em` e' carimbado pelo banco no primeiro gesto do cliente na
    // tela do link. E' o unico sinal que significa "uma pessoa olhou".
    const c = classificarComArte('AGUARDANDO', { link: true, abriu: '2026-08-31T18:00:00Z' });
    ok(c.fila === 'aprovacao', 'cliente olhou: vai para a Fila de Aprovacao', c);
    ok(c.statusCalculado === 'Aguard. Aprovação', 'e o badge diz "Aguard. Aprovacao"', c);

    // Refazer a arte zera a marca. Sem isso, o pedido que voltou de uma
    // alteracao saltaria para "Aguard. Aprovacao" com a abertura da versao
    // ANTERIOR -- o cliente nunca teria visto a arte corrigida.
    const d = classificarComArte('AGUARDANDO', { link: true, abriu: null });
    ok(d.fila === 'fila', 'marca zerada depois de refazer a arte: volta para "Em Arte"', d);
})();

(function oClienteOlharVenceAPalavraENVIARARTE() {
    // O `os.status` vem do adiantamento local (5 min) e da coluna do link, e os
    // dois ainda dizem ENVIAR ARTE no instante em que o cliente abre -- que e' o
    // caso comum, porque ele abre logo depois de receber. Sem esta regra o badge
    // ficaria presa em "Enviar Arte" com o cliente ja olhando a arte.
    const c = classificarComArte('ENVIAR ARTE', { link: true, abriu: '2026-08-31T18:00:00Z' });
    ok(c.statusCalculado === 'Aguard. Aprovação', 'cliente olhou vence a palavra ENVIAR ARTE', c);

    // Mas a arte aprovada continua vencendo os dois: e' a pergunta anterior.
    const d = classificarComArte('APROVADO', { link: true, abriu: '2026-08-31T18:00:00Z' });
    ok(d.statusCalculado === 'Aprovada', 'e a arte aprovada continua vencendo tudo', d);
})();

(function aArteProntaContinuaNaFilaDeAprovacao() {
    // O estagio 2 nao muda: arte pronta e' trabalho do atendente, e a linha dele
    // e' onde esta o botao de copiar o link.
    const c = classificarComArte('ENVIAR ARTE', { link: true });
    ok(c.statusCalculado === 'Enviar Arte', 'ENVIAR ARTE continua com o badge "Enviar Arte"', c);
    ok(c.fila === 'aprovacao', 'e continua na Fila de Aprovacao', c);
})();

(function aRegraAntigaNaoPodeVoltar() {
    // `temLinkGerado` era a variavel que fazia a existencia do link mover o
    // pedido. Ela sumiu; se voltar, todo pedido pronto vira "Aguard. Aprovacao".
    ok(!/temLinkGerado/.test(SCRIPT),
        'a variavel temLinkGerado nao existe mais no script.js');
    ok(/const clienteAbriuOLink = !!\(dadosDoLink && dadosDoLink\.cliente_abriu_em\);/.test(SCRIPT),
        'quem responde agora e a marca cliente_abriu_em');
})();

(function oRestoDaClassificacaoNaoMudou() {
    const aprovado = classificarComArte('APROVADO', { entrega: 'APROVADO' });
    ok(aprovado.fila === 'aprovados', 'arte e entrega aprovadas continuam em "Aprovados"', aprovado);

    const emProducao = classificarComArte('AGUARDANDO', { os: { status_interno: 'EM PRODUCAO' } });
    ok(emProducao.fila === 'concluidos', 'quem saiu para a producao continua em "Concluidos"', emProducao);

    const cancelado = classificarComArte('AGUARDANDO', { os: { status_interno: 'CANCELADO' } });
    ok(cancelado.fila === 'concluidos', 'o cancelado continua em "Concluidos"', cancelado);

    const alterada = classificarComArte('REPROVADO');
    ok(alterada.statusCalculado === 'Em Alteração', 'a reprovada continua "Em Alteracao"', alterada);
})();

(function aListaDeAprovacaoNaoPodeVoltarACarregarAPalavra() {
    // O erro se refaz com uma virgula. A trava e' sobre a lista, nao sobre o caso.
    ok(!/'AGUARDANDO'/.test(extrairConst('ARTE_EM_APROVACAO')),
        'ARTE_EM_APROVACAO nao contem a palavra crua AGUARDANDO');
    ok(/'AGUARDANDO_APROVACAO'/.test(extrairConst('ARTE_EM_APROVACAO')),
        'mas continua contendo AGUARDANDO_APROVACAO');
    ok(/'AGUARDANDO'/.test(extrairConst('ARTE_COM_O_DESIGNER')),
        'e AGUARDANDO esta em ARTE_COM_O_DESIGNER');
})();

(function oFiltroDeStatusConcordaComOBadge() {
    // Filtrar por "Em Arte" tem de trazer justamente os pedidos em arte.
    ok(/'AGUARDANDO': 'Em Arte',/.test(SCRIPT),
        'o mapa do filtro manda AGUARDANDO para "Em Arte"');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
