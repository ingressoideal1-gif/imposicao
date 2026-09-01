// O HISTORICO DEIXA DE SER RECORTADO, NAS TRES TELAS (01/09/2026).
//
// Comecou com uma pergunta sobre o card "Pedidos Concluidos" da Lista de Arte e
// terminou valendo para as tres listas de ARQUIVO do sistema:
//
//   Lista de Arte      -> card "Pedidos Concluidos"
//   Painel de Producao -> botao "Impresso"
//   Painel do Acabamento -> botao "Expedicao"
//
// As tres crescem para sempre e nunca voltam a diminuir. As tres passam a sair
// de 30 em 30, com a busca alcancando tudo. As filas de trabalho continuam
// inteiras: o operador precisa ver de uma vez tudo o que tem pela frente.
//
// Quatro defeitos foram consertados nessa leva, e cada um tem caso aqui:
//
//   1. O pedido sem linha em `produtos_proposta` nao existia em painel nenhum.
//      A montagem percorria PRODUTOS, entao quem nao tinha nenhum jamais era
//      construido -- foi assim que o 21347 sumiu, em EXPEDICAO e com arte
//      lancada.
//   2. As tres listas de arquivo desenhavam tudo de uma vez.
//   3. O botao "Impresso" da Producao saia de `ordensImpressao`, que exige
//      status EM PRODUCAO: o pedido sumia do historico de impressao assim que o
//      ERP o mandava para o acabamento ou a expedicao.
//   4. O botao "Expedicao" do Acabamento so aceitava `status_interno` igual a
//      EXPEDICAO: bastava a expedicao embarcar (EM TRANSITO) para o comprovante
//      do trabalho da bancada sumir.
//
// A REGRA QUE ESTE ARQUIVO PROTEGE ACIMA DE TUDO: a pagina RECORTA o que ja foi
// filtrado, nunca o contrario. Se o corte subir para antes do filtro, a
// pesquisa passa a achar so o que esta na pagina aberta -- que e justamente o
// defeito que esta mudanca veio consertar.
//
// Roda em node, sem navegador: `node tests/historico_de_artes_harness.js`.
// As funcoes sao LIDAS do script.js e avaliadas aqui -- nao copiadas.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const ACABAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'acabamento.js'), 'utf8');
const INDEX = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
const PRODUCAO = fs.readFileSync(path.join(RAIZ, 'frontend', 'producao.html'), 'utf8');

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

function lerConstante(nome) {
    const m = SCRIPT.match(new RegExp('const ' + nome + ' = (\\d+);'));
    if (!m) throw new Error('nao achei a constante ' + nome + ' no script.js');
    return m[1];
}

// ─── O DOM de mentira ───────────────────────────────────────────────────────
//
// So o suficiente para as funcoes de desenho: elas escrevem `innerHTML` e mexem
// em `style.display`. Guardar o HTML resultante e o que permite conferir o que
// o operador veria.

const elementos = {};
const dom = {
    criar(id) {
        elementos[id] = { id, innerHTML: '', style: {}, value: '' };
        return elementos[id];
    },
    document: { getElementById(id) { return elementos[id] || null; } },
};

const state = {};

const api = new Function('document', 'state', 'window', `
    const HISTORICO_POR_PAGINA = ${lerConstante('HISTORICO_POR_PAGINA')};
    const ULTIMOS_PEDIDOS_POR_PAGINA = ${lerConstante('ULTIMOS_PEDIDOS_POR_PAGINA')};
    ${extrair('escapeHtml')}
    ${extrair('desenharRodapeDePaginas')}
    ${extrair('zerarPaginaSeMudou')}
    ${extrair('recortarPaginaDoHistorico')}
    ${extrair('desenharPaginacaoArte')}
    ${extrair('desenharPaginacaoImpressos')}
    ${extrair('normalizarBuscaPedido')}
    ${extrair('desenharUltimosPedidos')}
    ${extrair('buscarUltimosPedidos')}
    ${extrair('irParaPaginaUltimosPedidos')}
    return { HISTORICO_POR_PAGINA, desenharRodapeDePaginas, zerarPaginaSeMudou,
             recortarPaginaDoHistorico, desenharPaginacaoArte, desenharPaginacaoImpressos,
             normalizarBuscaPedido, desenharUltimosPedidos, buscarUltimosPedidos,
             irParaPaginaUltimosPedidos };
`)(dom.document, state, {});

// ─── 1. O rodape de paginas, comum as tres telas ────────────────────────────

(function oRodapeDePaginas() {
    ok(api.HISTORICO_POR_PAGINA === 30,
       'sao 30 por pagina, como o usuario pediu nas tres telas');

    const caixa = dom.criar('paginacao-arte');

    api.desenharPaginacaoArte(false, 1, 9, 260);
    ok(caixa.style.display === 'none' && caixa.innerHTML === '',
       'nas filas de trabalho o rodape nao aparece -- so o arquivo e paginado');

    api.desenharPaginacaoArte(true, 1, 1, 12);
    ok(caixa.style.display === 'none',
       'uma pagina so nao e paginacao: o rodape continua escondido');

    api.desenharPaginacaoArte(true, 1, 4, 100);
    ok(caixa.style.display === 'flex', 'com mais de uma pagina o rodape aparece');
    ok(!caixa.innerHTML.includes('Anteriores'),
       'na primeira pagina nao ha "Anteriores" para onde voltar');
    ok(caixa.innerHTML.includes('Próximos'), 'na primeira pagina ha "Proximos"');
    ok(caixa.innerHTML.includes('irParaPaginaConcluidos(2)'),
       '"Proximos" leva para a pagina seguinte');
    ok(caixa.innerHTML.includes('100 pedidos no histórico'),
       'o rodape diz o total do HISTORICO, e nao quantos couberam na pagina');

    api.desenharPaginacaoArte(true, 4, 4, 100);
    ok(caixa.innerHTML.includes('irParaPaginaConcluidos(3)'),
       'na ultima pagina "Anteriores" volta uma');
    ok(!caixa.innerHTML.includes('Próximos'),
       'na ultima pagina nao ha "Proximos"');

    // O mesmo rodape, com o rotulo e a funcao de cada tela.
    const daProducao = dom.criar('paginacao-impressao');
    api.desenharPaginacaoImpressos(true, 2, 5, 140);
    ok(daProducao.innerHTML.includes('irParaPaginaImpressos(1)')
       && daProducao.innerHTML.includes('irParaPaginaImpressos(3)'),
       'o rodape da Producao chama a funcao da Producao nos dois botoes');
    ok(daProducao.innerHTML.includes('140 pedidos já impressos'),
       'e conta os pedidos com o rotulo daquela tela');

    const doAcabamento = dom.criar('paginacao-acabamento');
    api.desenharRodapeDePaginas('paginacao-acabamento', true, 1, 3, 70,
                                'irParaPaginaExpedicao', 'na expedição');
    ok(doAcabamento.innerHTML.includes('irParaPaginaExpedicao(2)')
       && doAcabamento.innerHTML.includes('70 pedidos na expedição'),
       'o mesmo rodape serve ao Acabamento -- tres telas, um desenho so');
})();

// ─── 2. O recorte e a volta para a primeira pagina ──────────────────────────

(function oRecorteEAAssinatura() {
    const lista = [];
    for (let i = 0; i < 96; i++) lista.push({ numero: 21500 - i });

    state.paginaConcluidos = 1;
    let r = api.recortarPaginaDoHistorico(lista, 'paginaConcluidos');
    ok(r.itens.length === 30 && r.totalPaginas === 4 && r.itens[0].numero === 21500,
       '96 pedidos viram 4 paginas de 30, comecando pelo primeiro da lista');

    state.paginaConcluidos = 4;
    r = api.recortarPaginaDoHistorico(lista, 'paginaConcluidos');
    ok(r.itens.length === 6, 'a ultima pagina traz o resto');

    state.paginaConcluidos = 99;
    r = api.recortarPaginaDoHistorico(lista, 'paginaConcluidos');
    ok(r.pagina === 4 && state.paginaConcluidos === 4,
       'pagina fora da faixa e presa na ultima -- a lista encolhe quando um '
       + 'pedido muda de estado, e a pagina guardada pode ter sumido');

    state.paginaConcluidos = 3;
    api.zerarPaginaSeMudou('paginaConcluidos', 'filtro-A');
    ok(state.paginaConcluidos === 1, 'recorte novo volta para a primeira pagina');
    state.paginaConcluidos = 3;
    api.zerarPaginaSeMudou('paginaConcluidos', 'filtro-A');
    ok(state.paginaConcluidos === 3,
       'e o MESMO recorte nao mexe na pagina -- senao trocar de pagina zeraria a si mesmo');

    // Cada lista tem a sua pagina: paginar os concluidos nao pode mover a
    // pagina dos impressos.
    state.paginaImpressos = 5;
    api.zerarPaginaSeMudou('paginaConcluidos', 'filtro-B');
    ok(state.paginaImpressos === 5, 'as tres listas paginam independentes');
})();

// ─── 3. Na Lista de Arte, o recorte e o ULTIMO passo ────────────────────────

(function oRecorteEOUltimoPassoNaArte() {
    const i = SCRIPT.indexOf('function renderOrdens');
    ok(i > 0, 'achei o renderOrdens');
    const corpo = SCRIPT.slice(i);

    const posBusca = corpo.indexOf('const matchSearch = num.includes(searchArte)');
    const posContador = corpo.indexOf("document.getElementById('os-arte-count-badge')");
    const posRecorte = corpo.indexOf("recortarPaginaDoHistorico(filteredArte, 'paginaConcluidos')");

    ok(posBusca > 0 && posContador > 0 && posRecorte > 0,
       'achei a busca, o contador e o recorte da Lista de Arte');
    ok(posBusca < posRecorte,
       'a busca da arte acontece ANTES do recorte -- senao a pesquisa so acharia '
       + 'o que esta na pagina aberta');
    ok(posContador < posRecorte,
       'o contador do topo e calculado ANTES do recorte, para dizer quantos '
       + 'pedidos o filtro achou no historico inteiro');

    ok(corpo.includes('tbodyArte.innerHTML = arteNaTela.map('),
       'a tabela de arte desenha a PAGINA, e nao a lista inteira');
    ok(/if \(listaEhDosConcluidos\) \{/.test(corpo),
       'o recorte esta preso ao card dos concluidos: fora desse `if` ele '
       + 'passaria a paginar tambem as filas de trabalho');
})();

// ─── 4. No Painel de Producao, o botao "Impresso" ve TODOS os impressos ─────

(function oBotaoImpresso() {
    const i = SCRIPT.indexOf('function renderOrdens');
    const corpo = SCRIPT.slice(i);

    ok(corpo.includes("const listaEhDosImpressos = (state.filtroPrazo || 'geral') === 'impressos';"),
       'a tela sabe quando esta no botao "Impresso"');
    ok(corpo.includes('? state.ordens.filter(os => pedidoTotalmenteImpresso(os))'),
       'no botao "Impresso" a base e `state.ordens` INTEIRA: o pedido nao pode '
       + 'sumir do historico so porque o ERP o mandou para o acabamento');
    ok(corpo.includes('const filteredImpressaoSemPrazo = baseImpressao.filter('),
       'os filtros de busca e setor rodam sobre essa base nova');

    // A fila de trabalho continua sendo a fila: `ordensImpressao` segue
    // alimentando as metricas e o alerta de atraso.
    ok(corpo.includes('state.temPedidosAtrasados = ordensImpressao.some('),
       'o alerta de atraso continua olhando a FILA, e nao o historico -- pedido '
       + 'ja impresso e entregue nao pode acender o alarme de atrasado');
    ok(corpo.includes("document.getElementById('stat-pedidos-fila')"),
       'as metricas do topo continuam contando a fila');

    const posBusca = corpo.indexOf('const matchSearch = num.includes(searchImpressao)');
    const posContador = corpo.indexOf("document.getElementById('os-impressao-count-badge')");
    const posRecorte = corpo.indexOf("recortarPaginaDoHistorico(filteredImpressao, 'paginaImpressos')");
    ok(posBusca > 0 && posContador > 0 && posRecorte > 0,
       'achei a busca, o contador e o recorte da Producao');
    ok(posBusca < posRecorte && posContador < posRecorte,
       'na Producao o recorte tambem e o ultimo passo');
    ok(corpo.includes('tbodyImpressao.innerHTML = impressaoNaTela.map('),
       'a fila de impressao desenha a PAGINA');
    ok(corpo.includes('if (listaEhDosImpressos) {'),
       'o recorte da Producao vale so no botao "Impresso"');
})();

// ─── 5. No Acabamento, o botao "Expedicao" ve tudo o que ja saiu ────────────

(function oBotaoExpedicao() {
    ok(ACABAMENTO.includes("if (tela.prazo === 'expedicao') return todos.filter(jaPassouDaGrafica);"),
       'a base do botao "Expedicao" e tudo o que ja passou da grafica '
       + '(EXPEDICAO, EM TRANSITO, ENTREGUE) -- e nao so o que esta parado em EXPEDICAO');
    ok(ACABAMENTO.includes("if (tela.prazo === 'expedicao') return jaPassouDaGrafica(os);"),
       'e o recorte de prazo usa a mesma regua');
    ok(ACABAMENTO.includes("const naTela = naExpedicao ? recortarPagina(lista) : lista;"),
       'so o botao "Expedicao" e paginado');
    ok(ACABAMENTO.includes('tbody.innerHTML = naTela.map('),
       'a tabela do acabamento desenha a PAGINA');

    const posBusca = ACABAMENTO.indexOf("const busca = (campoBusca ? campoBusca.value : '')");
    const posContador = ACABAMENTO.indexOf("os-acabamento-count-badge");
    const posRecorte = ACABAMENTO.indexOf('const naTela = naExpedicao ?');
    ok(posBusca > 0 && posBusca < posRecorte && posContador < posRecorte,
       'no Acabamento o recorte tambem vem depois da busca e do contador');

    ok(ACABAMENTO.includes('parseInt(window.HISTORICO_POR_PAGINA) || 30'),
       'o tamanho da pagina vem do script.js, e nao de uma copia -- tres telas '
       + 'do mesmo sistema com tres numeros diferentes seria pior que nao paginar');
    ok(ACABAMENTO.includes("fn('desenharRodapeDePaginas')"),
       'o rodape tambem vem do script.js');
    ok(ACABAMENTO.includes('window.irParaPaginaExpedicao = irParaPaginaExpedicao;'),
       'o botao do rodape acha a funcao que troca a pagina');
})();

// ─── 6. O pedido sem produto nasce assim mesmo ──────────────────────────────

(function oPedidoSemProdutoNasce() {
    const i = SCRIPT.indexOf('async function loadOrdensFromVibecode');
    ok(i > 0, 'achei o loadOrdensFromVibecode');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n/**', i + 10));

    ok(corpo.includes(".in('status_interno', SINAIS_SAIU_DA_ARTE)"),
       'as propostas sao lidas TAMBEM por status: e a unica consulta que '
       + 'descobre o pedido que nao tem produto nem arte');
    ok(corpo.includes('(propostas || []).forEach(pr =>'),
       'depois de agrupar os produtos, as propostas que sobraram viram pedido');
    ok(/if \(!pedidoEntraNoPainel\(key, pedidosComerciais, state\.todasArtes, jaNaGrafica\)\) return;/.test(corpo),
       'o pedido sem produto passa pela MESMA porta dos outros -- a lista nao '
       + 'vira catalogo dos 8 mil pedidos do banco');
    ok(corpo.includes('const criarOS = (key, createdAt)'),
       'os dois caminhos montam a OS pela mesma funcao, para nao divergirem');
})();

// ─── 7. Os HTML que desenham as listas ganharam os rodapes ──────────────────

(function osHtml() {
    ok(INDEX.includes('id="paginacao-arte"') && PRODUCAO.includes('id="paginacao-arte"'),
       'a Lista de Arte tem rodape nas DUAS paginas que a desenham');
    ok(INDEX.includes('id="paginacao-impressao"') && PRODUCAO.includes('id="paginacao-impressao"'),
       'o Painel de Producao tambem -- esquecer a producao.html deixaria metade '
       + 'das estacoes sem paginacao');
    ok(INDEX.includes('id="paginacao-acabamento"'),
       'o Painel do Acabamento tem rodape (ele so existe no index.html)');
})();

// ─── 8. O box "Ultimos Pedidos do Cliente" ──────────────────────────────────

(function oBoxDoCliente() {
    const osId = 'vibe_21347';
    dom.criar('ultimos-pedidos-lista-' + osId);
    const campo = dom.criar('ultimos-pedidos-busca-' + osId);
    const lista = elementos['ultimos-pedidos-lista-' + osId];

    // 20 pedidos do mesmo cliente, do mais novo ao mais antigo.
    const pedidos = [];
    for (let n = 0; n < 20; n++) {
        pedidos.push({ id_int: 21400 - n, created_at: '2026-08-' + String(28 - n).padStart(2, '0') });
    }
    const eventoMap = {
        21400: { nome_evento: 'Baile de São João' },
        21390: { nome_evento: 'Festa da Uva' },
    };

    state.historicoCliente = {
        [osId]: { pedidos, eventoMap, clienteNome: 'ANGELA BEATRIZ', currentNumInt: 21347, pagina: 1, busca: '' },
    };
    const dados = state.historicoCliente[osId];

    api.desenharUltimosPedidos(osId);
    ok((lista.innerHTML.match(/selecionarPedidoDoCliente\(/g) || []).length === 6,
       'a primeira pagina do box mostra 6 pedidos');
    ok(lista.innerHTML.includes('#21400') && !lista.innerHTML.includes('#21390'),
       'comeca pelo mais novo, e o 7o pedido ficou para a proxima pagina');
    ok(lista.innerHTML.includes('20 pedidos'),
       'o rodape do box diz quantos pedidos o cliente tem ao todo');

    api.irParaPaginaUltimosPedidos(osId, 2);
    ok(lista.innerHTML.includes('#21394') && !lista.innerHTML.includes('#21400'),
       'a pagina 2 mostra os 6 seguintes');

    api.irParaPaginaUltimosPedidos(osId, 99);
    ok(dados.pagina === 4, 'pagina fora da faixa e presa na ultima');

    // A busca varre TODOS os pedidos, e nao a pagina aberta.
    campo.value = '21390';
    api.buscarUltimosPedidos(osId);
    ok(dados.pagina === 1, 'buscar volta para a primeira pagina');
    ok(lista.innerHTML.includes('#21390') && !lista.innerHTML.includes('#21400'),
       'a busca por numero acha o pedido que estava na pagina 2');

    campo.value = 'sao joao';
    api.buscarUltimosPedidos(osId);
    ok(lista.innerHTML.includes('#21390') === false && lista.innerHTML.includes('#21400'),
       'a busca por evento casa sem acento: "sao joao" acha "São João"');

    campo.value = 'nao existe esse evento';
    api.buscarUltimosPedidos(osId);
    ok(lista.innerHTML.includes('Nenhum pedido deste cliente'),
       'busca sem resultado diz o que houve, em vez de mostrar caixa vazia');

    ok(api.normalizarBuscaPedido('São João') === 'sao joao',
       'o normalizador tira acento e caixa');
    ok(api.normalizarBuscaPedido(null) === '',
       'e aguenta campo vazio sem quebrar');
})();

// ─── 9. O box le o cliente pelo numero do ERP, e nao so pelo nome ───────────

(function oClienteEIdentificadoPeloNumero() {
    const i = SCRIPT.indexOf('async function loadUltimosPedidos');
    ok(i > 0, 'achei o loadUltimosPedidos');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n/**', i));

    ok(corpo.includes('id_cliente.eq.'),
       'o historico e buscado pelo NUMERO do cliente: so pelo nome traria o '
       + 'pedido de outro cliente de nome parecido');
    ok(corpo.includes(".ilike('cliente'"),
       'e tambem pelo nome, para nao perder a proposta antiga sem numero');
    ok(corpo.includes('id_faturado'),
       'o numero de faturamento entra junto -- os dois divergem de verdade');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' casos falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' casos do historico passaram.');
