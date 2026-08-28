// A BARRA DO PRODUTO DIZ QUANTO TEM, QUANTO FALTA, E FILTRA POR COR (28/08/2026).
//
// Pedido do usuario: "no modal de cada produto (Triband, Mobi, Tex ...) no
// local marcado na imagem (barra do titulo do produto) colocar a informacao da
// quantidade total do produto (soma das quantidades de todos os modelos) e a
// quantidade restante. Substituir o drop no final desta mesma linha por um drop
// com as cores de cada produto, ao selecionar no drop uma cor, mostra apenas na
// tela os produtos da mesma cor."
//
// E, no mesmo dia: "Adicionar no topo da pagina, lateral direita da tela, lado
// oposto do titulo, um botao escrito 'Aguardando' quando clicado mostra apenas
// os modelos ainda nao impressos, desmarcado mostra todos".
//
// As funcoes sao RECORTADAS do pedido.js e executadas -- nada aqui e copia da
// regra. O que este arquivo cobre:
//
//   1. a conta (total e restante), inclusive o Parcial, que conta inteiro;
//   2. a cor resolvida UMA vez, do mesmo jeito que a bolinha da linha sempre
//      resolveu -- pelo id, pelo nome exato, e so entao pelo aproximado;
//   3. os dois filtros que escondem linha em vez de redesenhar a fila -- a COR,
//      por produto, e o AGUARDANDO, do topo da pagina, que valem somados;
//   4. e a trave que importa no papel: modelo escondido SAI da selecao, senao
//      ele continuaria marcado fora de vista e sairia impresso junto.
const fs = require('fs');
const path = require('path');
const RAIZ = path.dirname(__dirname);
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortar(fonte, nome, ondeVive) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no ' + ondeVive);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

function recortarConst(fonte, nome, fim) {
    const i = fonte.indexOf('const ' + nome + ' = ');
    if (i < 0) throw new Error('nao achei a const ' + nome + ' no script.js');
    return fonte.slice(i, fonte.indexOf(fim, i) + fim.length);
}

// --- Um DOM do tamanho da fila, e nada mais ---------------------------------

function linha(itemId, chaveDaCor, impresso) {
    return {
        id: 'ped-queue-row-' + itemId,
        style: { display: '' },
        getAttribute: nome => {
            if (nome === 'data-cor-chave') return chaveDaCor;
            if (nome === 'data-impresso') return impresso ? 'sim' : 'nao';
            return null;
        },
    };
}

function caixa(chaveDaCaixa, linhas) {
    return {
        _linhas: linhas,
        style: { display: '' },
        getAttribute: nome => (nome === 'data-caixa-cor' ? chaveDaCaixa : null),
        querySelectorAll: sel => (sel === 'tr[data-cor-chave]' ? linhas : []),
    };
}

function montar(caixas) {
    const linhasTodas = caixas.reduce((acc, c) => acc.concat(c._linhas), []);

    // O botao do topo da pagina e o recado da lista vazia sao nos fixos do HTML.
    const botao = {
        classes: new Set(),
        atributos: {},
        title: '',
        classList: {
            toggle: (c, on) => { if (on) botao.classes.add(c); else botao.classes.delete(c); },
        },
        setAttribute: (n, v) => { botao.atributos[n] = v; },
        get ligado() { return botao.classes.has('active'); },
    };
    const recado = { style: { display: 'none' } };

    const documento = {
        querySelectorAll: sel =>
            (sel === '#ped-os-queue-body [data-caixa-cor]' ? caixas : []),
        getElementById: id => {
            if (id === 'btn-ped-so-aguardando') return botao;
            if (id === 'ped-fila-vazia') return recado;
            return linhasTodas.find(l => l.id === id) || null;
        },
    };

    const state = { selectedOSItems: [], cores: [] };

    let redesenhos = 0;

    const fonte = [
        recortar(SCRIPT, 'normalizarStatusImpressao', 'script.js'),
        recortarConst(SCRIPT, 'globalNormStr', ": '';"),
        recortarConst(SCRIPT, 'globalFuzzyMatch', '\n};'),
        recortar(PEDIDO, 'contaDoProduto', 'pedido.js'),
        recortar(PEDIDO, 'resolverCorDoModelo', 'pedido.js'),
        recortar(PEDIDO, 'filtroDeCorDaFila', 'pedido.js'),
        recortar(PEDIDO, 'soAguardandoLigado', 'pedido.js'),
        recortar(PEDIDO, 'alternarSoAguardando', 'pedido.js'),
        recortar(PEDIDO, 'pintarBotaoSoAguardando', 'pedido.js'),
        recortar(PEDIDO, 'aplicarFiltrosDaFila', 'pedido.js'),
        recortar(PEDIDO, 'desmarcarModelosEscondidos', 'pedido.js'),
        recortar(PEDIDO, 'filtrarFilaPorCor', 'pedido.js'),
        'return { contaDoProduto, resolverCorDoModelo, filtroDeCorDaFila,'
        + ' soAguardandoLigado, alternarSoAguardando, aplicarFiltrosDaFila,'
        + ' desmarcarModelosEscondidos, filtrarFilaPorCor };',
    ].join('\n');

    const api = new Function('state', 'document', 'renderPedOSQueue', fonte)(
        state, documento, () => { redesenhos++; });

    return { api, state, botao, recado, redesenhos: () => redesenhos };
}

// --- 1. A conta do produto --------------------------------------------------

(function totalEeRestante() {
    const { api } = montar([]);
    const conta = api.contaDoProduto;

    const itens = [
        { id: 1, qtd: 1000, status_impressao: 'Impresso' },
        { id: 2, qtd: 1000, status_impressao: 'Aguardando' },
        { id: 3, qtd: 1000, status_impressao: 'Aguardando' },
    ];

    ok(conta(itens).total === 3000, 'o total soma a quantidade de TODOS os modelos', conta(itens));
    ok(conta(itens).restante === 2000, 'o restante desconta so o que ja esta impresso', conta(itens));

    // Parcial conta inteiro: a tela nao guarda quantos itens dele ja sairam.
    const comParcial = [
        { id: 1, qtd: 500, status_impressao: 'Parcial' },
        { id: 2, qtd: 500, status_impressao: 'Impresso' },
    ];
    ok(conta(comParcial).restante === 500,
       'modelo em Parcial conta como restante inteiro -- a conta erra para o lado de sobrar',
       conta(comParcial));

    // As grafias que o ERP usa para o mesmo estado.
    ok(conta([{ id: 1, qtd: 10, status_impressao: 'IMPRESSO' }]).restante === 0,
       'IMPRESSO em caixa alta e o mesmo estado');
    ok(conta([{ id: 1, qtd: 10, impressao: 'Impresso' }]).restante === 0,
       'o campo antigo `impressao` vale como status');
    ok(conta([{ id: 1, qtd: 10, status_impressao: 'Aguard.' }]).restante === 10,
       '"Aguard." e Aguardando');
    ok(conta([{ id: 1, qtd: 10, status_impressao: 'Revisao' }]).restante === 10,
       'modelo em Revisao ainda falta imprimir');

    // Nada de NaN na barra do titulo.
    ok(conta([{ id: 1 }, { id: 2, qtd: '' }, { id: 3, qtd: 'abc' }]).total === 0,
       'modelo sem quantidade nao vira NaN no titulo');
    ok(conta([{ id: 1, quantidade: 250 }]).total === 250,
       'o nome alternativo `quantidade` tambem e lido');
    ok(conta([]).total === 0 && conta(null).total === 0,
       'produto sem modelo nenhum da zero, nao explode');

    // O restante nunca fica negativo, mesmo com dado torto do ERP.
    ok(conta([{ id: 1, qtd: -50, status_impressao: 'Impresso' },
              { id: 2, qtd: 10, status_impressao: 'Aguardando' }]).restante >= 0,
       'restante nunca aparece negativo na tela');
})();

// --- 2. A cor do modelo, resolvida uma vez so -------------------------------

(function aCorSaiIgualParaABolinhaEParaOFiltro() {
    const { api, state } = montar([]);

    state.cores = [
        { id: 10, name: 'Vermelho', cor_referencia: '#ff0000' },
        { id: 20, name: 'Azul Royal', cor_referencia: '#0000ff' },
    ];
    const cores = state.cores;

    const porId = api.resolverCorDoModelo({ id: 1, amostra_cor_id: 10 }, cores);
    ok(porId.rotulo === 'Vermelho' && porId.corRefHex === '#ff0000',
       'o id da cor manda quando existe', porId);

    const porNome = api.resolverCorDoModelo({ id: 2, cor: 'vermelho' }, cores);
    ok(porNome.chave === porId.chave,
       'o nome escrito a mao chega na MESMA chave que o id -- senao o filtro'
       + ' esconderia linha que a bolinha pinta', [porNome.chave, porId.chave]);

    const comEspaco = api.resolverCorDoModelo({ id: 3, cor: 'AZUL ROYAL' }, cores);
    ok(comEspaco.chave === api.resolverCorDoModelo({ id: 4, amostra_cor_id: 20 }, cores).chave,
       'caixa e espaco nao criam uma cor a mais no drop');

    // Cor que o ERP escreveu e o catalogo nao tem: continua sendo uma cor.
    const solta = api.resolverCorDoModelo({ id: 5, cor: 'Dourado Especial' }, cores);
    ok(solta.rotulo === 'Dourado Especial' && solta.chave !== '__sem_cor__',
       'cor fora do catalogo continua no filtro -- ela sai no papel do mesmo jeito', solta);

    const semCor = api.resolverCorDoModelo({ id: 6 }, cores);
    ok(semCor.chave === '__sem_cor__' && semCor.corRefHex === '',
       'modelo sem cor tem chave propria, e nao se mistura com as outras', semCor);
})();

// --- 3. O filtro esconde linha; nao redesenha a fila ------------------------

(function escolherUmaCorDeixaSoAquelasLinhas() {
    const linhas = [linha(1, 'vermelho'), linha(2, 'azul'), linha(3, 'vermelho')];
    const { api, state, redesenhos } = montar([caixa('OS1::7', linhas)]);

    api.filtrarFilaPorCor('OS1::7', 'vermelho');
    ok(linhas.map(l => l.style.display).join('|') === '|none|',
       'so as linhas da cor escolhida ficam na tela', linhas.map(l => l.style.display));
    ok(redesenhos() === 0,
       'trocar a cor no cabecalho NAO redesenha a fila -- e gesto de olhar, nao de salvar');

    api.filtrarFilaPorCor('OS1::7', '');
    ok(linhas.every(l => l.style.display === ''),
       '"Todas as cores" devolve a lista inteira', linhas.map(l => l.style.display));

    // Nada vai ao banco: a escolha vive em memoria, para o proximo redesenho
    // reaplica-la.
    api.filtrarFilaPorCor('OS1::7', 'azul');
    ok(state.filtroCorDaFila['OS1::7'] === 'azul',
       'a escolha fica guardada para sobreviver ao proximo redesenho', state.filtroCorDaFila);

    // Desenhou de novo? O filtro volta sozinho, sem passar pelo select.
    linhas.forEach(l => { l.style.display = ''; });
    api.aplicarFiltrosDaFila();
    ok(linhas.map(l => l.style.display).join('|') === 'none||none',
       'o redesenho reaplica a cor escolhida', linhas.map(l => l.style.display));
})();

(function cadaProdutoTemOSeuFiltro() {
    const triband = [linha(1, 'vermelho'), linha(2, 'azul')];
    const mobi = [linha(3, 'vermelho'), linha(4, 'azul')];
    const { api } = montar([caixa('OS1::7', triband), caixa('OS1::9', mobi)]);

    api.filtrarFilaPorCor('OS1::7', 'vermelho');

    ok(triband[1].style.display === 'none', 'o filtro recorta a caixa em que foi escolhido');
    ok(mobi.every(l => l.style.display === ''),
       'e nao mexe na caixa do outro produto', mobi.map(l => l.style.display));
})();

// --- 4. A trave do papel: escondido sai da selecao --------------------------

(function modeloEscondidoNaoPodeSairImpresso() {
    const linhas = [linha(1, 'vermelho'), linha(2, 'azul')];
    const { api, state, redesenhos } = montar([caixa('OS1::7', linhas)]);

    state.selectedOSItems = [{ itemId: 1, osId: 'OS1' }, { itemId: 2, osId: 'OS1' }];

    api.filtrarFilaPorCor('OS1::7', 'vermelho');

    ok(state.selectedOSItems.length === 1 && String(state.selectedOSItems[0].itemId) === '1',
       'o modelo escondido pelo filtro SAI da selecao -- senao sairia impresso fora de vista',
       state.selectedOSItems);
    ok(redesenhos() === 1,
       'e a fila e redesenhada uma vez, para as caixinhas marcadas baterem com o estado');

    // Nada mudou? Entao nada de redesenho.
    api.filtrarFilaPorCor('OS1::7', 'vermelho');
    ok(redesenhos() === 1, 'refazer a mesma escolha nao redesenha de novo', redesenhos());
})();

(function selecaoDeOutraTelaNaoEDesfeita() {
    const linhas = [linha(1, 'vermelho')];
    const { api, state } = montar([caixa('OS1::7', linhas)]);

    // A aba Imposicao divide `selectedOSItems` com esta fila. Item que nao tem
    // linha AQUI nao pode ser desmarcado por um filtro daqui.
    state.selectedOSItems = [{ itemId: 1, osId: 'OS1' }, { itemId: 99, osId: 'OS1' }];

    api.filtrarFilaPorCor('OS1::7', 'vermelho');

    ok(state.selectedOSItems.length === 2,
       'item sem linha nesta fila continua marcado -- ele pertence a outra tela',
       state.selectedOSItems);
})();

// --- 5. O botao "Aguardando" do topo da pagina ------------------------------

(function ligadoDeixaSoOQueFaltaImprimir() {
    const linhas = [linha(1, 'vermelho', true), linha(2, 'azul', false), linha(3, 'verde', false)];
    const { api, state, botao } = montar([caixa('OS1::7', linhas)]);

    ok(api.soAguardandoLigado() === false, 'comeca desligado: a lista inteira aparece');

    api.alternarSoAguardando();

    ok(linhas.map(l => l.style.display).join('|') === 'none||',
       'ligado, o modelo ja IMPRESSO sai da tela', linhas.map(l => l.style.display));
    ok(botao.ligado && botao.atributos['aria-pressed'] === 'true',
       'e o botao se acende, para o operador ver o que encurtou a lista',
       [botao.ligado, botao.atributos]);

    api.alternarSoAguardando();

    ok(linhas.every(l => l.style.display === ''), 'desmarcado, todos voltam',
       linhas.map(l => l.style.display));
    ok(!botao.ligado && botao.atributos['aria-pressed'] === 'false', 'e o botao apaga');
})();

(function oParcialAindaFaltaImprimir() {
    // Parcial nao e Impresso: a folha dele ainda tem de sair, e some-lo aqui
    // esconderia justamente o trabalho que falta.
    const linhas = [linha(1, 'vermelho', false)];   // data-impresso="nao" = Parcial
    const { api } = montar([caixa('OS1::7', linhas)]);

    api.alternarSoAguardando();

    ok(linhas[0].style.display === '', 'modelo em Parcial continua na tela com o filtro ligado');
})();

(function produtoInteiroImpressoSaiDaTela() {
    const triband = [linha(1, 'vermelho', true), linha(2, 'azul', true)];
    const mobi = [linha(3, 'vermelho', false)];
    const cx = [caixa('OS1::7', triband), caixa('OS1::9', mobi)];
    const { api, recado } = montar(cx);

    api.alternarSoAguardando();

    ok(cx[0].style.display === 'none',
       'produto com tudo impresso sai junto -- senao sobraria um cabecalho solto',
       cx[0].style.display);
    ok(cx[1].style.display === '', 'e o produto que ainda tem trabalho fica');
    ok(recado.style.display === 'none', 'com algo na tela, nenhum recado aparece');
})();

(function telaVaziaDizPorQueEComoSair() {
    const linhas = [linha(1, 'vermelho', true), linha(2, 'azul', true)];
    const { api, recado } = montar([caixa('OS1::7', linhas)]);

    api.alternarSoAguardando();
    ok(recado.style.display === 'block',
       'pedido todo impresso mostra o recado, em vez de uma tela vazia sem explicacao');

    api.alternarSoAguardando();
    ok(recado.style.display === 'none', 'e o recado some quando a lista volta');
})();

(function osDoisFiltrosSeSomam() {
    const linhas = [
        linha(1, 'vermelho', true),
        linha(2, 'vermelho', false),
        linha(3, 'azul', false),
    ];
    const { api } = montar([caixa('OS1::7', linhas)]);

    api.filtrarFilaPorCor('OS1::7', 'vermelho');
    api.alternarSoAguardando();

    ok(linhas.map(l => l.style.display).join('|') === 'none||none',
       'sobra so o que e vermelho E ainda nao foi impresso',
       linhas.map(l => l.style.display));
})();

(function impressoMarcadoSaiDaSelecaoAoLigarOFiltro() {
    const linhas = [linha(1, 'vermelho', true), linha(2, 'azul', false)];
    const { api, state, redesenhos } = montar([caixa('OS1::7', linhas)]);

    state.selectedOSItems = [{ itemId: 1, osId: 'OS1' }, { itemId: 2, osId: 'OS1' }];

    api.alternarSoAguardando();

    ok(state.selectedOSItems.length === 1 && String(state.selectedOSItems[0].itemId) === '2',
       'o impresso marcado sai da selecao junto com a linha -- senao reimprimiria sozinho',
       state.selectedOSItems);
    ok(redesenhos() === 1, 'e a fila e redesenhada para as caixinhas baterem com o estado');
})();

(function oRedesenhoReaplicaOAguardando() {
    const linhas = [linha(1, 'vermelho', true), linha(2, 'azul', false)];
    const { api, botao } = montar([caixa('OS1::7', linhas)]);

    api.alternarSoAguardando();

    // A fila se redesenha a cada campo salvo; sem reaplicar, o filtro sumiria
    // sozinho na primeira troca de modelo.
    linhas.forEach(l => { l.style.display = ''; });
    botao.classes.clear();

    api.aplicarFiltrosDaFila();

    ok(linhas[0].style.display === 'none', 'o redesenho reaplica o Aguardando');
    ok(botao.ligado, 'e reacende o botao, que e um no fixo do HTML');
})();

console.log(falhas === 0
    ? 'OK: ' + total + ' verificacoes da fila do pedido (conta, cor, e o Aguardando)'
    : 'FALHAS: ' + falhas + '/' + total);
process.exit(falhas === 0 ? 0 : 1);
