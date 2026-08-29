// A Lista de Arte depois dos tres pedidos de 19/08/2026:
//
//  1. a caixa "Designers Ideal" soma so os pedidos do card "Em Arte";
//  2. a linha do pedido perde os dois links (Vibe e copiar);
//  3. entra a coluna Preview, igual a do Painel de Producao.
//
// Nada aqui e copia da regra: as funcoes sao recortadas do script.js e
// executadas.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + detalhe : ''));
}

function recortar(nome) {
    const i = SCRIPT.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    return SCRIPT.slice(i, SCRIPT.indexOf('\n}', i) + 2);
}

function recortarConst(nome) {
    const i = SCRIPT.indexOf('const ' + nome + ' = [');
    if (i < 0) throw new Error('nao achei a lista ' + nome);
    return SCRIPT.slice(i, SCRIPT.indexOf('];', i) + 2);
}

// ─── 1. Em que fila cada pedido cai ──────────────────────────────────────────

function classificador(state) {
    const fonte = [
        recortarConst('SINAIS_SAIU_DA_ARTE'),
        recortarConst('SINAIS_CANCELADO'),
        recortar('pedidoCancelado'),
        recortarConst('ARTE_REPROVADOS'),
        recortarConst('ARTE_APROVADOS'),
        recortarConst('ARTE_EM_APROVACAO'),
        recortar('pedidoSaiuDaArte'),
        recortar('classificarPedidoNaArte'),
        recortar('pedidoEstaEmArte'),
    ].join('\n');
    return new Function('state', 'window',
        fonte + '\nreturn { classificarPedidoNaArte, pedidoEstaEmArte };')(state, {});
}

const VAZIO = { ordens: [], todasArtes: [], modelosGlobais: {}, osItens: {}, linksCliente: {} };

(function cadaPedidoCaiNoCardCerto() {
    const api = classificador(VAZIO);
    const fila = os => api.classificarPedidoNaArte(os).fila;

    ok(fila({ numero: 1, status: 'EM ARTE' }) === 'fila', 'pedido em arte fica em Em Arte');
    ok(fila({ numero: 2, status: 'EM ALTERACAO' }) === 'fila', 'e pedido em alteracao tambem');
    ok(fila({ numero: 3, status: 'ARTE PRONTA' }) === 'aprovacao', 'arte pronta vai para a Fila de Aprovacao');
    ok(fila({ numero: 4, status: 'AGUARD. APROVAÇÃO' }) === 'aprovacao', 'e o que aguarda o cliente tambem');
    ok(fila({ numero: 5, status: 'APROVADA' }) === 'aprovacao',
        'arte aprovada sem os dados de entrega ainda espera');
    ok(fila({ numero: 6, status_interno: 'EM PRODUCAO' }) === 'concluidos',
        'quem foi para a producao sai da arte');
    ok(fila({ numero: 7, status: 'FINALIZADA' }) === 'concluidos', 'e o finalizado tambem');

    // Aprovado de verdade = arte E dados de entrega.
    const comEntrega = classificador(Object.assign({}, VAZIO, {
        todasArtes: [{ id_int: 8, status: 'APROVADA', entrega_dados: 'APROVADO' }],
    }));
    ok(comEntrega.classificarPedidoNaArte({ numero: 8, status: 'APROVADA' }).fila === 'aprovados',
        'com a entrega aprovada, vai para a Fila de Aprovados');
})();

(function oPedidoNoBalcaoNaoVoltaParaAArte() {
    // 25/08/2026, pedidos 21105 e 21107: os dois tinham ido a producao e
    // reapareceram na Fila de Aprovacao. O ERP havia trocado o `status_interno`
    // para `A RETIRAR` (retirada local, material pronto no balcao), palavra que
    // o `SINAIS_SAIU_DA_ARTE` nao conhecia. Com a arte APROVADA e a entrega
    // vazia, a classificacao pela arte joga o pedido exatamente na aprovacao --
    // por isso o teste reproduz as duas coisas juntas, e nao so o status.
    const api = classificador(Object.assign({}, VAZIO, {
        todasArtes: [
            { id_int: 21105, status: 'APROVADO', entrega_dados: null },
            { id_int: 21107, status: 'APROVADO', entrega_dados: null },
        ],
    }));
    ok(api.classificarPedidoNaArte({ numero: 21105, status_interno: 'A RETIRAR' }).fila === 'concluidos',
        'pedido pronto no balcao fica em Pedidos Concluidos, nao volta para a arte');
    ok(api.classificarPedidoNaArte({ numero: 21107, status_interno: 'A RETIRAR' }).fila === 'concluidos',
        'e o 21107, igual');
    ok(api.classificarPedidoNaArte({ numero: 21105, status_interno: 'RETIRADO' }).fila === 'concluidos',
        'depois que o cliente leva, tambem nao volta');
})();

(function oPedidoComLinkGeradoSaiDeEmArte() {
    // Gerar o link para o cliente move o pedido para a Fila de Aprovacao mesmo
    // sem o status ter mudado -- e por isso ele deixa de contar para o designer.
    const api = classificador(Object.assign({}, VAZIO, { linksCliente: { 'os-9': 'abc' } }));
    ok(api.classificarPedidoNaArte({ id: 'os-9', numero: 9, status: 'EM ARTE' }).fila === 'aprovacao',
        'pedido com link gerado esta esperando o cliente');
})();

// ─── 2. A caixa "Designers Ideal" conta so o card Em Arte ────────────────────

(function aCaixaDosDesignersContaSoOQueEstaEmArte() {
    // O trecho que conta, recortado do proprio renderDesignersBoxHTML.
    const i = SCRIPT.indexOf('const ordensEmArte = (state.ordens || []).filter(pedidoEstaEmArte);');
    ok(i > 0, 'a caixa filtra os pedidos por pedidoEstaEmArte');
    ok(SCRIPT.indexOf('const allOrdens = state.ordens || [];') < 0,
        'e nao varre mais state.ordens inteiro');

    const iForEach = SCRIPT.indexOf('ordensEmArte.forEach(o => {', i);
    ok(iForEach > i && iForEach - i < 2500, 'a soma percorre a lista ja filtrada', iForEach - i);

    // A conta em si: um designer com quatro pedidos, dos quais so dois estao em
    // arte, precisa mostrar 2 -- e nao 4.
    const state = {
        ordens: [
            { id: 'a', numero: 101, status: 'EM ARTE' },
            { id: 'b', numero: 102, status: 'EM ALTERACAO' },
            { id: 'c', numero: 103, status: 'ARTE PRONTA' },
            { id: 'd', numero: 104, status_interno: 'EM PRODUCAO' },
        ],
        todasArtes: [], modelosGlobais: {}, osItens: {
            a: [{}, {}], b: [{}], c: [{}, {}, {}], d: [{}, {}, {}, {}],
        }, linksCliente: {},
    };
    const api = classificador(state);
    const emArte = state.ordens.filter(api.pedidoEstaEmArte);

    ok(emArte.length === 2, 'dos quatro pedidos, dois estao em arte', emArte.map(o => o.numero));

    const modelos = emArte.reduce((acc, o) => acc + (state.osItens[o.id] || []).length, 0);
    ok(modelos === 3, 'e a soma dos modelos e a dos dois, nao a dos quatro', modelos);
})();

// ─── 3. A linha do pedido ficou so com o numero ──────────────────────────────

const iLinha = SCRIPT.indexOf("navigateToAmostrasFromOS('${os.id}')");
const LINHA = SCRIPT.slice(iLinha, SCRIPT.indexOf('</tr>', iLinha));

(function aLinhaPerdeuOsDoisLinks() {
    ok(iLinha > 0, 'achei a linha da Lista de Arte');
    ok(LINHA.indexOf('linkDoPedidoNoVibe') < 0, 'a linha nao leva mais ao Vibe');
    ok(LINHA.indexOf('icon-vibe.png') < 0, 'nem mostra o icone dele');
    ok(LINHA.indexOf('copiarLinkDoPedido') < 0, 'e nao tem mais o botao de copiar o link');
    ok(LINHA.indexOf('${os.numero}</span>') > 0, 'o numero do pedido continua la');
})();

(function oLinkDoVibeContinuaDentroDoPedido() {
    // Ele nao foi removido do sistema -- mudou de lugar. E o botao de copiar,
    // esse sim, foi excluido, e nao mudou de lugar nenhum.
    ok(/vibeEl\.innerHTML = os\.numero \? botaoDoVibeHtml\(os\.numero\) : ''/.test(SCRIPT),
        'o cabecalho do pedido aberto continua com o botao do Vibe');
    ok(SCRIPT.indexOf('copiarLinkDoPedido') < 0,
        'e o botao de copiar nao reapareceu em lugar nenhum');
})();

// ─── 4. A coluna Preview, igual a do Painel de Producao ──────────────────────

(function aColunaPreviewEntrouEntreVendedorETempo() {
    ['index.html', 'producao.html'].forEach(arq => {
        const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', arq), 'utf8');
        const iTabela = HTML.indexOf('id="table-arte"');
        ok(iTabela > 0, arq + ': achei a tabela da Lista de Arte');

        const cabecalho = HTML.slice(iTabela, HTML.indexOf('</thead>', iTabela));
        const iVendedor = cabecalho.indexOf('Vendedor / Designer');
        const iPreview = cabecalho.indexOf('Preview');
        const iTempo = cabecalho.indexOf('>Tempo<');

        ok(iPreview > 0, arq + ': a coluna Preview existe');
        ok(iVendedor > 0 && iPreview > iVendedor, arq + ': ela vem depois de Vendedor');
        ok(iTempo > 0 && iPreview < iTempo, arq + ': e antes da coluna Tempo');
        ok(cabecalho.indexOf('Data Libera') < 0, arq + ': a coluna Data Liberacao deu lugar a Tempo');
    });
})();

(function asColunasDoCabecalhoBatemComAsDaLinha() {
    // Cabecalho e linha se desencontrando e a falha classica de mexer em tabela:
    // o conteudo continua aparecendo, so que debaixo do titulo errado.
    const HTML = fs.readFileSync(path.join(RAIZ, 'frontend', 'index.html'), 'utf8');
    const iTabela = HTML.indexOf('id="table-arte"');
    const cabecalho = HTML.slice(iTabela, HTML.indexOf('</thead>', iTabela));
    const ths = (cabecalho.match(/<th[ >]/g) || []).length;

    // Duas celulas nao estao escritas na linha: elas vem prontas de funcoes que
    // devolvem o <td> inteiro. A do Tempo (com a cor e o titulo) e, desde
    // 25/08/2026, a do Pagamento (o carimbo PAGO, ou o traco).
    const literais = (LINHA.match(/<td[ >]/g) || []).length;
    const porFuncao = ['celulaDeTempoHtml(os)', 'celulaDePagamentoHtml(os)'];
    porFuncao.forEach(f => ok(LINHA.indexOf(f) > 0, 'a linha pede a celula pela ' + f));

    const tds = literais + porFuncao.length;
    ok(ths === tds, 'a linha tem uma celula para cada titulo', 'th=' + ths + ' td=' + tds);
    ok(ths === 10, 'que sao dez: Preview, Tempo e Pagamento entre as antigas', ths);
})();

(function oPreviewDaListaEOMesmoDoPainelDeProducao() {
    // "Igual ao do Painel de Producao" so continua verdade enquanto for o mesmo
    // codigo desenhando os dois.
    ok(/function previewDaArteDoPedidoHtml\(os\)/.test(SCRIPT), 'o preview mora numa funcao');

    const chamadas = (SCRIPT.match(/previewDaArteDoPedidoHtml\(os\)/g) || []).length;
    ok(chamadas === 3, 'chamada pelas duas tabelas (mais a declaracao)', chamadas);

    const iArte = LINHA.indexOf('previewDaArteDoPedidoHtml(os)');
    ok(iArte > 0, 'a linha da Lista de Arte pede o preview');

    // A celula fica entre a do vendedor e a do tempo.
    const iVend = LINHA.indexOf('os.vendedor');
    const iTempo = LINHA.indexOf('celulaDeTempoHtml(os)');
    ok(iVend > 0 && iArte > iVend, 'depois do vendedor');
    ok(iTempo > 0 && iArte < iTempo, 'e antes da coluna Tempo');
})();

(function oQueOPreviewDesenhaEmCadaCaso() {
    function preview(state, os) {
        const fonte = recortar('previewDaArteDoPedidoHtml');
        return new Function('state', fonte + '\nreturn previewDaArteDoPedidoHtml;')(state)(os);
    }
    const base = { modelosGlobais: {}, osItens: {}, todasArtes: [] };

    // Pedido sem arte nenhuma mostra a imagem "sem foto" da casa, escolhida pelo
    // usuario em 29/08/2026. Antes era um quadro cinza com o emoji da moldura,
    // que nas duas listas parecia falha de carregamento.
    const semArte = preview(base, { id: 'a', numero: 300 });
    ok(semArte.indexOf('Sem arte cadastrada') > 0, 'pedido sem arte se anuncia como tal', semArte.slice(0, 80));
    ok(semArte.indexOf('sem_foto.jpg') > 0,
        'e o lugar vazio e a imagem "sem foto" do bucket, nao um emoji', semArte.slice(0, 120));

    const comImagem = preview(Object.assign({}, base, {
        osItens: { a: [{ modelo: 1, amostra_arte_base64: 'data:image/png;base64,AAA' }] },
    }), { id: 'a', numero: 301 });
    ok(comImagem.indexOf('<img') > 0 && comImagem.indexOf('data:image/png;base64,AAA') > 0,
        'com arte, mostra a miniatura', comImagem.slice(0, 80));
    // Ate 24/08/2026 esta verificacao travava o nome errado: o preview chamava
    // openClienteLightbox, que so existe no cliente.js — e o index.html nao
    // carrega o cliente.js. O clique nao fazia nada, e o teste passava. Por isso
    // agora nao basta o nome: a funcao chamada tem de EXISTIR no script.js.
    const chamada = (comImagem.match(/onclick="[^"]*?;\s*([A-Za-z0-9_$]+)\(/) || [])[1];
    ok(chamada === 'abrirLightboxImagem', 'e o clique amplia', chamada);
    ok(new RegExp('\\nfunction ' + chamada + '\\(').test(SCRIPT),
        'e quem amplia mora no proprio script.js, senao o clique nao faz nada', chamada);

    // PDF nao vira imagem: sai o icone que abre o arquivo. Rasterizar a arte do
    // cliente esta fora de cogitacao neste projeto.
    const comPdf = preview(Object.assign({}, base, {
        osItens: { a: [{ modelo: 1, arte_url: 'https://exemplo/arte.pdf' }] },
    }), { id: 'a', numero: 302 });
    ok(comPdf.indexOf('<img') < 0, 'arte em PDF nao e rasterizada para virar miniatura');
    ok(comPdf.indexOf('Arte em PDF') > 0, 'ela sai como um atalho para abrir o arquivo', comPdf.slice(0, 90));

    // O modelo de numero mais baixo e o que representa o pedido.
    const varios = preview(Object.assign({}, base, {
        osItens: { a: [
            { modelo: 3, amostra_arte_base64: 'data:image/png;base64,TRES' },
            { modelo: 1, amostra_arte_base64: 'data:image/png;base64,UM' },
        ] },
    }), { id: 'a', numero: 303 });
    ok(varios.indexOf('base64,UM') > 0, 'entre varios modelos, mostra o de numero mais baixo');

    // O clique no preview nao pode abrir o pedido junto.
    ok(comImagem.indexOf('event.stopPropagation()') > 0,
        'e o clique no preview nao abre o pedido junto');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
