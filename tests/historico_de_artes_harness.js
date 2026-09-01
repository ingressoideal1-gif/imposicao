// O HISTORICO DE ARTES DEIXA DE SER RECORTADO (01/09/2026).
//
// Tres coisas escondiam historico do usuario, e as tres cairam na mesma leva:
//
//   1. O pedido sem linha em `produtos_proposta` nao existia em painel nenhum.
//      A montagem percorria PRODUTOS, entao quem nao tinha nenhum jamais era
//      construido -- foi assim que o 21347 sumiu, em EXPEDICAO e com arte
//      lancada. A porta (`pedidoEntraNoPainel`) ja o aceitava desde 24/08; o
//      que faltava era alguem monta-lo.
//   2. O card "Pedidos Concluidos" desenhava a lista inteira de uma vez. Ele e
//      arquivo, cresce para sempre, e passou a sair de 30 em 30.
//   3. O box "Ultimos Pedidos do Cliente" mostrava 6 e parava ali. O cliente
//      maior da casa tem 326 pedidos.
//
// O que este harness protege, e por que cada caso existe:
//
//   - a pagina RECORTA, e nao FILTRA: o contador do topo e a busca continuam
//     falando do historico inteiro. Se um dia o slice subir para antes do
//     filtro, a pesquisa passa a achar so o que esta na pagina aberta -- que e
//     justamente o defeito que esta mudanca veio consertar.
//   - a busca do box do cliente varre todos os pedidos carregados, e nao a
//     pagina; e casa sem acento, porque "Sao Joao" e "São João" sao o mesmo
//     evento para quem digita com pressa.
//
// Roda em node, sem navegador: `node tests/historico_de_artes_harness.js`.
// As funcoes sao LIDAS do script.js e avaliadas aqui -- nao copiadas.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
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

// ─── O DOM de mentira ───────────────────────────────────────────────────────
//
// So o suficiente para as duas funcoes de desenho: elas escrevem `innerHTML` e
// mexem em `style.display`. Guardar o HTML resultante e o que permite conferir
// o que o operador veria.

function criarDom() {
    const elementos = {};
    return {
        elementos,
        criar(id) {
            elementos[id] = { id, innerHTML: '', style: {}, value: '' };
            return elementos[id];
        },
        document: {
            getElementById(id) { return elementos[id] || null; },
        },
    };
}

const dom = criarDom();

const ambiente = new Function('document', 'state', 'window', `
    ${extrair('escapeHtml')}
    ${extrair('desenharPaginacaoArte')}
    ${extrair('normalizarBuscaPedido')}
    ${extrair('desenharUltimosPedidos')}
    ${extrair('buscarUltimosPedidos')}
    ${extrair('irParaPaginaUltimosPedidos')}
    const ULTIMOS_PEDIDOS_POR_PAGINA = ${lerPorPagina()};
    return { desenharPaginacaoArte, normalizarBuscaPedido, desenharUltimosPedidos,
             buscarUltimosPedidos, irParaPaginaUltimosPedidos };
`);

function lerPorPagina() {
    const m = SCRIPT.match(/const ULTIMOS_PEDIDOS_POR_PAGINA = (\d+);/);
    if (!m) throw new Error('nao achei o ULTIMOS_PEDIDOS_POR_PAGINA no script.js');
    return m[1];
}

const state = {};
const api = ambiente(dom.document, state, {});

// ─── 1. O rodape de paginas do card "Pedidos Concluidos" ────────────────────

(function oRodapeDePaginas() {
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
    ok(caixa.innerHTML.includes('100 pedidos'),
       'o rodape diz o total do HISTORICO, e nao quantos couberam na pagina');

    api.desenharPaginacaoArte(true, 4, 4, 100);
    ok(caixa.innerHTML.includes('irParaPaginaConcluidos(3)'),
       'na ultima pagina "Anteriores" volta uma');
    ok(!caixa.innerHTML.includes('Próximos'),
       'na ultima pagina nao ha "Proximos"');
})();

// ─── 2. A pagina RECORTA depois de filtrar, nunca antes ─────────────────────
//
// Este caso e de leitura do fonte, e nao de execucao: o recorte mora dentro do
// `renderOrdens`, que nao roda fora do navegador. O que ele protege e a ORDEM
// -- filtrar, ordenar, so entao cortar --, porque inverte-la faria a busca
// enxergar apenas a pagina aberta.

(function oRecorteEOUltimoPasso() {
    const i = SCRIPT.indexOf('function renderOrdens');
    ok(i > 0, 'achei o renderOrdens');
    const corpo = SCRIPT.slice(i);

    const posBusca = corpo.indexOf('const matchSearch = num.includes(searchArte)');
    const posContador = corpo.indexOf("document.getElementById('os-arte-count-badge')");
    const posRecorte = corpo.indexOf('arteNaTela = filteredArte.slice(inicio');

    ok(posBusca > 0 && posContador > 0 && posRecorte > 0,
       'achei a busca, o contador e o recorte dentro do renderOrdens');
    ok(posBusca < posRecorte,
       'a busca acontece ANTES do recorte -- senao a pesquisa so acharia o que '
       + 'esta na pagina aberta, que e o defeito que esta mudanca consertou');
    ok(posContador < posRecorte,
       'o contador do topo e calculado ANTES do recorte, para dizer quantos '
       + 'pedidos o filtro achou no historico inteiro');

    ok(corpo.includes('tbodyArte.innerHTML = arteNaTela.map('),
       'a tabela desenha a PAGINA (`arteNaTela`), e nao a lista inteira');
    ok(/const CONCLUIDOS_POR_PAGINA = 30;/.test(corpo),
       'sao 30 por pagina, como o usuario pediu');
})();

// ─── 3. O pedido sem produto nasce assim mesmo ──────────────────────────────
//
// Tambem por leitura: a montagem e uma funcao async de 200 linhas que fala com
// o banco. O que precisa ficar travado sao as duas pernas que faltavam.

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

// ─── 4. Os dois HTML que desenham a Lista de Arte ganharam o rodape ─────────

(function osDoisHtml() {
    ok(INDEX.includes('id="paginacao-arte"'),
       'o index.html tem onde desenhar o rodape de paginas');
    ok(PRODUCAO.includes('id="paginacao-arte"'),
       'a producao.html tambem -- as duas desenham a mesma Lista de Arte, e '
       + 'esquecer uma deixa metade das estacoes sem paginacao');
})();

// ─── 5. O box "Ultimos Pedidos do Cliente" ──────────────────────────────────

(function oBoxDoCliente() {
    const osId = 'vibe_21347';
    dom.criar('ultimos-pedidos-lista-' + osId);
    const campo = dom.criar('ultimos-pedidos-busca-' + osId);
    const lista = dom.elementos['ultimos-pedidos-lista-' + osId];

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
    ok(dados.pagina === 4,
       'pagina fora da faixa e presa na ultima -- a lista encolhe quando a '
       + 'busca filtra, e a pagina guardada pode ter deixado de existir');

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

// ─── 6. O box le o cliente pelo numero do ERP, e nao so pelo nome ───────────

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
console.log('OK: ' + total + ' casos do historico de artes passaram.');
