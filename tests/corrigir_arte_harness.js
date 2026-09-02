// "Corrigir Arte": o terceiro status do modelo no Painel de Producao.
//
// Pedido do usuario em 02/09/2026. Quando a producao descobre que a arte de um
// modelo esta errada, ela marca "Corrigir Arte" no seletor Status da linha
// daquele modelo. A marca faz tres coisas ao mesmo tempo:
//
//   1. trava a IMPRESSAO daquele modelo -- e so daquele, nao do pedido;
//   2. traz o pedido de volta para o card "Em Arte" da Lista de Arte, mesmo
//      que ele ja tenha ido para a producao (vence o `pedidoSaiuDaArte`);
//   3. sai sozinha quando o designer marca aquele modelo PRONTO, e o modelo
//      volta para "Aguardando" -- nunca para Impresso, porque a arte mudou e o
//      que saiu antes nao serve.
//
// O que estes testes protegem, em uma frase cada:
//
//   1. o normalizador reconhece a palavra em todas as formas em que ela chega,
//      e NAO reconhece as outras -- um falso positivo travaria a impressora;
//   2. modelo em correcao nao conta como impresso em lugar nenhum;
//   3. o pedido volta para o card "Em Arte", e o CANCELADO nao volta;
//   4. os quatro seletores de status oferecem a opcao (senao a tela mente);
//   5. as duas telas de imposicao travam o IMPRIMIR e deixam o PDF passar;
//   6. o PRONTO do designer devolve o modelo para Aguardando, nos dois nomes
//      em que esse dado mora na memoria.
//
// Roda em node, sem navegador: `node tests/corrigir_arte_harness.js`.
// Os trechos sao LIDOS do codigo vivo, nao copiados.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const PEDIDO = fs.readFileSync(path.join(RAIZ, 'frontend', 'pedido.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

// Vale para a const de uma linha e para a lista de varias: em ambas o primeiro
// ";" seguido de quebra de linha e o fim da declaracao.
function extrairConst(src, nome) {
    const i = src.indexOf('\nconst ' + nome + ' = ');
    if (i < 0) throw new Error('nao achei a const ' + nome);
    const fim = src.indexOf(';\n', i);
    if (fim < 0) throw new Error('nao achei o fim da const ' + nome);
    return src.slice(i, fim + 1);
}

// O ambiente minimo: as listas de palavras e as funcoes que a classificacao usa.
const CODIGO = [
    extrairConst(SCRIPT, 'STATUS_CORRIGIR_ARTE'),
    extrairConst(SCRIPT, 'SINAIS_SAIU_DA_ARTE'),
    extrairConst(SCRIPT, 'SINAIS_CANCELADO'),
    extrairConst(SCRIPT, 'ARTE_REPROVADOS'),
    extrairConst(SCRIPT, 'ARTE_APROVADOS'),
    extrairConst(SCRIPT, 'ARTE_EM_APROVACAO'),
    extrairConst(SCRIPT, 'ARTE_COM_O_DESIGNER'),
    extrairFuncao(SCRIPT, 'normalizarStatusImpressao'),
    extrairFuncao(SCRIPT, 'modeloEmCorrecaoDeArte'),
    extrairFuncao(SCRIPT, 'calcularStatusImpressaoPedido'),
    extrairFuncao(SCRIPT, 'pedidoCancelado'),
    extrairFuncao(SCRIPT, 'pedidoSaiuDaArte'),
    extrairFuncao(SCRIPT, 'classificarPedidoNaArte'),
].join('\n');

const janela = {};
const state = { osItens: {}, modelosGlobais: {}, todasArtes: [], linksClienteData: {} };
const api = new Function('window', 'state', CODIGO
    + '\nreturn { STATUS_CORRIGIR_ARTE, normalizarStatusImpressao, modeloEmCorrecaoDeArte,'
    + ' calcularStatusImpressaoPedido, classificarPedidoNaArte };')(janela, state);

// --- 1. A palavra chega de varias formas -------------------------------------

(function oNormalizadorReconheceAPalavra() {
    const n = api.normalizarStatusImpressao;
    ok(n('Corrigir Arte') === 'Corrigir Arte', 'o valor do seletor');
    ok(n('CORRIGIR ARTE') === 'Corrigir Arte', 'em caixa alta');
    ok(n('corrigir arte') === 'Corrigir Arte', 'em caixa baixa');
    ok(n('CORRIGIR_ARTE') === 'Corrigir Arte', 'com sublinhado, como sai de URL e de CSV');
    ok(n('  Corrigir Arte  ') === 'Corrigir Arte', 'com espaco em volta');
    ok(n('IMPRESSO') === 'Impresso', 'o status antigo continua inteiro');
    ok(n(null) === 'Aguardando', 'vazio continua Aguardando');
})();

(function palavraEstranhaNaoTravaAImpressora() {
    // O erro caro seria o falso positivo: um valor desconhecido virando
    // "Corrigir Arte" pararia a impressora sem ninguem ter pedido.
    const n = api.normalizarStatusImpressao;
    for (const estranho of ['QUALQUER COISA', 'CORRIGIR', 'ARTE', 'CORRIGIDO', 'ARTE CORRIGIDA']) {
        ok(n(estranho) !== 'Corrigir Arte', 'o valor "' + estranho + '" nao trava a impressao');
    }
})();

(function oModeloSabeQueEstaEmCorrecao() {
    const m = api.modeloEmCorrecaoDeArte;
    ok(m({ status_impressao: 'Corrigir Arte' }) === true, 'pela coluna do banco');
    ok(m({ impressao: 'CORRIGIR_ARTE' }) === true, 'pelo espelho em memoria');
    ok(m({ status_impressao: 'Impresso' }) === false, 'impresso nao esta em correcao');
    ok(m({}) === false, 'modelo sem status nao esta em correcao');
    ok(m(null) === false, 'sem modelo, false -- e nao um estouro');
})();

// --- 2. Em correcao nao e impresso -------------------------------------------

(function emCorrecaoNaoContaComoImpresso() {
    const c = api.calcularStatusImpressaoPedido;
    const m = st => ({ impressao: st, status_impressao: st });
    ok(c([m('IMPRESSO'), m('Corrigir Arte')]) === 'Aguardando',
        'um modelo em correcao segura o pedido inteiro fora de Impresso');
    ok(c([m('Corrigir Arte')]) === 'Aguardando', 'so ele, tambem Aguardando');
})();

// --- 3. O pedido volta para o card "Em Arte" ---------------------------------

function pedidoNaProducao(extra) {
    return Object.assign(
        { id: 'os-1', numero: 21408, status: 'EM PRODUCAO', status_interno: 'EM PRODUCAO' },
        extra || {});
}

(function pedidoNaProducaoVoltaParaEmArte() {
    const os = pedidoNaProducao();
    state.osItens = { 'os-1': [{ id: 1, status_impressao: 'Impresso' }, { id: 2, status_impressao: 'Impresso' }] };
    state.modelosGlobais = {};
    const antes = api.classificarPedidoNaArte(os);
    ok(antes.fila === 'concluidos', 'sem marca, pedido na producao fica em Concluidos', antes);

    state.osItens['os-1'][1].status_impressao = 'Corrigir Arte';
    const depois = api.classificarPedidoNaArte(os);
    ok(depois.fila === 'fila', 'com a marca, ele volta para o card Em Arte', depois);
    ok(depois.statusCalculado === 'Corrigir Arte', 'e o selo diz por que', depois);
})();

(function contaEmUmCardSo() {
    // Decisao do usuario: o pedido nao pode ser contado em dois cards. A funcao
    // devolve UMA fila, entao isto e verdade por construcao -- o teste existe
    // para que continuar verdade seja escolha, e nao acaso.
    const os = pedidoNaProducao();
    state.osItens = { 'os-1': [{ id: 1, status_impressao: 'Corrigir Arte' }] };
    const c = api.classificarPedidoNaArte(os);
    ok(c.fila === 'fila' && c.fila !== 'concluidos', 'o pedido conta em um card so', c);
})();

(function oCanceladoNaoVolta() {
    // Pedido morto nao volta para a fila de ninguem, nem com modelo marcado --
    // por isso a marca e conferida DEPOIS do cancelado.
    const os = pedidoNaProducao({ status_interno: 'CANCELADO' });
    state.osItens = { 'os-1': [{ id: 1, status_impressao: 'Corrigir Arte' }] };
    const c = api.classificarPedidoNaArte(os);
    ok(c.fila === 'concluidos', 'cancelado com marca continua em Concluidos', c);
    ok(c.statusCalculado === 'CANCELADA', 'e o selo continua dizendo Cancelada', c);
})();

(function aMarcaVenceAPalavraDoErp() {
    // Um pedido ja aprovado e o caso mais dificil: sem a marca ele iria para
    // "aprovados" ou "concluidos". A marca e recado direto da producao.
    const os = pedidoNaProducao({ status: 'APROVADA', status_interno: 'EM ACABAMENTO' });
    state.osItens = { 'os-1': [{ id: 1, status_impressao: 'Corrigir Arte' }] };
    const c = api.classificarPedidoNaArte(os);
    ok(c.fila === 'fila', 'a marca vence a palavra do ERP', c);
})();

(function aMarcaEncontraOModeloNaListaGlobal() {
    // A Lista de Arte le `state.modelosGlobais`: o pedido pode nunca ter sido
    // aberto nesta sessao, e entao `state.osItens` esta vazio para ele.
    const os = pedidoNaProducao();
    state.osItens = {};
    state.modelosGlobais = { 21408: [{ id: 1, status_impressao: 'Corrigir Arte' }] };
    const c = api.classificarPedidoNaArte(os);
    ok(c.fila === 'fila', 'a marca e lida tambem do catalogo global de modelos', c);
    state.modelosGlobais = {};
})();

(function semMarcaNadaMuda() {
    // A regressao que importa: nenhum pedido pode mudar de card por causa
    // desta mudanca enquanto ninguem marcar nada.
    state.osItens = { 'os-1': [{ id: 1, status_impressao: 'Aguardando' }] };
    ok(api.classificarPedidoNaArte(pedidoNaProducao()).fila === 'concluidos',
        'pedido na producao, sem marca: Concluidos');
    ok(api.classificarPedidoNaArte({ id: 'os-1', numero: 21408, status: 'AGUARDANDO' }).fila === 'fila',
        'pedido com o designer, sem marca: Em Arte');
})();

// --- 4. Os quatro seletores oferecem a opcao ---------------------------------

(function todosOsSeletoresOferecemAOpcao() {
    // Se um seletor nao tiver a opcao, o navegador mostra a PRIMEIRA -- ou
    // seja, um modelo em correcao apareceria como "Aguardando" naquela tela. A
    // tela mentiria, e a impressao pareceria liberada.
    const noScript = (SCRIPT.match(/<option value="Corrigir Arte"/g) || []).length;
    const noPedido = (PEDIDO.match(/<option value="Corrigir Arte"/g) || []).length;
    ok(noScript === 3, 'os 3 seletores do script.js oferecem Corrigir Arte', noScript);
    ok(noPedido === 1, 'o seletor da fila do Pedido oferece Corrigir Arte', noPedido);
})();

// --- 5. As duas travas de impressao ------------------------------------------

(function asDuasTelasTravamOImprimir() {
    for (const par of [['script.js', SCRIPT], ['pedido.js', PEDIDO]]) {
        const nome = par[0];
        const fonte = par[1];
        const i = fonte.indexOf('modelosEmCorrecaoDeArte();');
        ok(i > 0, 'a trava existe no ' + nome);
        const trecho = fonte.slice(i, i + 900);
        ok(trecho.indexOf('Impressao travada') > 0 || trecho.indexOf('Impressão travada') > 0,
            'e ela diz ao operador que travou (' + nome + ')');
        ok(trecho.indexOf('marcar o modelo como PRONTO') > 0,
            'e diz como sair da trava (' + nome + ')');
    }
})();

(function oPdfContinuaLiberado() {
    // Gerar o PDF e como se confere o que esta errado sem gastar papel. A trava
    // e so do 'print'; se alguem a alargar, isto avisa.
    for (const par of [['script.js', SCRIPT], ['pedido.js', PEDIDO]]) {
        const nome = par[0];
        const fonte = par[1];
        const i = fonte.indexOf('modelosEmCorrecaoDeArte();');
        const antes = fonte.slice(Math.max(0, i - 400), i);
        ok(antes.indexOf("mode === 'print'") > 0,
            'a trava de ' + nome + ' vale so para o print -- o PDF passa');
    }
})();

(function aFuncaoOlhaSoOsModelosDaFolha() {
    // "So aquele modelo" e a decisao do usuario. Se isto virar o pedido
    // inteiro, dez modelos param porque um tem a arte errada.
    const i = SCRIPT.indexOf('function modelosEmCorrecaoDeArte()');
    ok(i > 0, 'a funcao existe');
    const corpo = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(corpo.indexOf('itensDaImposicao') > 0,
        'ela olha os modelos DESTA imposicao, e nao o pedido inteiro', corpo);
})();

(function naoEntraNaFolhaDeAproveitamento() {
    // A busca de companhia para a folha nao pode sugerir o modelo que a
    // producao acabou de parar: a trava do imprimir so apareceria no fim, com
    // a folha ja montada.
    const i = SCRIPT.indexOf('function modeloLiberadoParaImprimir(');
    ok(i > 0, 'a regra do aproveitamento existe');
    const corpo = SCRIPT.slice(i, i + 1200);
    ok(corpo.indexOf('modeloEmCorrecaoDeArte(item)') > 0,
        'modelo em correcao nao entra na folha de aproveitamento');
})();

// --- 6. O PRONTO do designer devolve para Aguardando -------------------------

(function oProntoLiberaAImpressao() {
    const i = SCRIPT.indexOf('const liberaImpressao = status ===');
    ok(i > 0, 'a liberacao pelo PRONTO existe');
    const trecho = SCRIPT.slice(i, i + 700);
    ok(trecho.indexOf('modeloEmCorrecaoDeArte(itemParaLiberar)') > 0,
        'so libera modelo que estava em correcao');
    ok(trecho.indexOf('cliente-amostras-itens-container') > 0,
        'o APROVAR do link do cliente NAO destrava a impressora');
    ok(trecho.indexOf("gravar.status_impressao = 'Aguardando'") > 0,
        'e ele volta para Aguardando, nunca para Impresso');
})();

(function osDoisNomesDoDadoAndamJuntos() {
    // A armadilha de sempre neste projeto: a linha da fila le
    // `status_impressao` e o card le `impressao`. Deixar um para tras faz a
    // tela dizer "Corrigir Arte" ate o proximo F5, e o pedido fica no card
    // errado.
    const i = SCRIPT.indexOf('if (liberaImpressao) {');
    ok(i > 0, 'o bloco que atualiza a memoria existe');
    const trecho = SCRIPT.slice(i, i + 1400);
    ok(trecho.indexOf('itemParaLiberar.status_impressao') > 0, 'atualiza status_impressao');
    ok(trecho.indexOf('itemParaLiberar.impressao') > 0, 'atualiza o espelho impressao');
    ok(trecho.indexOf('modelosGlobais') > 0, 'e o catalogo global, que a Lista de Arte le');
})();

// --- Resultado ---------------------------------------------------------------

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes FALHARAM.');
    process.exit(1);
}
console.log('OK: corrigir arte -- ' + total + ' verificacoes, todas passaram.');
