// O cliente que aprova a arte e vai embora sem conferir entrega e nota.
//
// Medido no banco em 03/09/2026: 17 pedidos foram para a producao com a arte
// aprovada e a conferencia de entrega/nota NUNCA feita -- 6 dos 14 pedidos
// decididos desde que o Portal do Pedido existe. Nenhum dos 88 links ativos
// jamais pediu correcao de dados. E 14 dos 17 tinham aberto o link duas vezes
// ou mais, um deles 50 vezes: nao foi falta de oportunidade.
//
// O que este harness protege sao as quatro regras que sairam dali:
//
//   1. o link ABRE na aba pendente quando a arte ja foi decidida -- e so entao;
//   2. a trilha diz o VERBO de cada etapa, e pendente e ambar (nao cinza);
//   3. o cartao ambar e o botao de continuar aparecem so quando ha pendencia;
//   4. o chat do parceiro deixa de dizer "PEDIDO COMPLETO" quando nao esta.
//
// Roda em node: `node tests/portal_pendencia_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SHELL = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-shell.js'), 'utf8');
const CLIENTE = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
const ENTREGA = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-entrega.js'), 'utf8');
const PAINEL = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');
const CSS = fs.readFileSync(path.join(RAIZ, 'frontend', 'style.css'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

/** A funcao LIDA do arquivo de producao -- nunca uma copia dela escrita aqui. */
function extrairFuncao(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    const fim = fonte.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return fonte.slice(i, fim + 2);
}

/**
 * Monta o Portal de mentira: as funcoes de verdade, com o estado semeado.
 *
 * `artesAprovadas` e o que `artesJaAprovadas` responderia -- ela mora no
 * `cliente-confirmacoes.js` e depende do DOM, entao entra aqui como resposta.
 */
function portal({ status, entrega, faturamento, artesAprovadas }) {
    const fonte = extrairFuncao(SHELL, 'semAcento')
                + extrairFuncao(SHELL, 'seloDoStatus')
                + extrairFuncao(SHELL, 'etapasDoPedido')
                + extrairFuncao(SHELL, 'proximaEtapaPendente')
                + extrairFuncao(SHELL, 'secaoDeAbertura')
                + extrairFuncao(CLIENTE, 'pendenciasForaDaArte')
                + extrairFuncao(CLIENTE, 'mensagemDaAprovacaoDeArte');

    const janela = { portalConfirmacoes: { entrega, faturamento, textoEntrega: '', textoFaturamento: '' } };

    return new Function('window', 'clienteState', 'artesJaAprovadas',
        fonte + '\nreturn { seloDoStatus, etapasDoPedido, proximaEtapaPendente, secaoDeAbertura,'
              + ' pendenciasForaDaArte, mensagemDaAprovacaoDeArte };')(
        janela, { statusArte: status }, () => artesAprovadas);
}

// ─── 1. Em que aba o link abre ───────────────────────────────────────────────

(function oClienteQueVoltaCaiNoQueFalta() {
    // O caso dos 17 pedidos: arte na impressora, dados nunca conferidos.
    const p = portal({ status: 'EM PRODUCAO', entrega: null, faturamento: null, artesAprovadas: true });
    ok(p.secaoDeAbertura('EM PRODUCAO') === 'entrega',
        'com a arte em producao e a entrega pendente, abre na Entrega',
        p.secaoDeAbertura('EM PRODUCAO'));

    const soANota = portal({ status: 'APROVADO', entrega: true, faturamento: null, artesAprovadas: true });
    ok(soANota.secaoDeAbertura('APROVADO') === 'faturamento',
        'entrega ja conferida: abre na Nota, que e a que sobrou');
})();

(function comAArteAindaEsperandoDecisaoAbreNaArte() {
    // A trava que impede o erro que `seguirSozinhoSeAprovouTudo` documenta:
    // existem pedidos com TODOS os modelos em APROVADA cujo status continua em
    // `Aguard. Aprovacao`. Decidir pela contagem de modelos empurraria esse
    // cliente para longe da arte antes de ele ter visto a arte.
    const p = portal({ status: 'Aguard. Aprovação', entrega: null, faturamento: null, artesAprovadas: true });
    ok(p.secaoDeAbertura('Aguard. Aprovação') === 'arte',
        'status de aprovacao pendente abre na Arte mesmo com os modelos aprovados');

    const emArte = portal({ status: 'Em Arte', entrega: null, faturamento: null, artesAprovadas: false });
    ok(emArte.secaoDeAbertura('Em Arte') === 'arte', 'arte em preparacao abre na Arte');

    const emAlteracao = portal({ status: 'Em Alteração', entrega: null, faturamento: null, artesAprovadas: false });
    ok(emAlteracao.secaoDeAbertura('Em Alteração') === 'arte',
        'alteracao solicitada abre na Arte -- e la que esta o que ele pediu');
})();

(function semPendenciaNenhumaOLinkVoltaAAbrirNaArte() {
    const p = portal({ status: 'EM PRODUCAO', entrega: true, faturamento: true, artesAprovadas: true });
    ok(p.secaoDeAbertura('EM PRODUCAO') === 'arte',
        'pedido fechado abre na Arte, que e o que o cliente volta para ver');
    ok(p.proximaEtapaPendente() === null, 'e nao sobra etapa nenhuma');
})();

(function pedirAlteracaoNosDadosCONTACOMODECIDIDO() {
    // `false` e "pediu alteracao": e uma decisao, e ja esta com o atendimento.
    // Reabrir o cliente nessa aba seria pedir de novo o que ele ja mandou.
    const p = portal({ status: 'EM PRODUCAO', entrega: false, faturamento: false, artesAprovadas: true });
    ok(p.secaoDeAbertura('EM PRODUCAO') === 'arte', 'quem pediu correcao nao e cobrado de novo');
})();

// ─── 2. O verbo de cada etapa ────────────────────────────────────────────────

(function cadaEtapaDizOQueEsperaDoCliente() {
    const p = portal({ status: 'EM PRODUCAO', entrega: null, faturamento: null, artesAprovadas: true });
    const etapas = p.etapasDoPedido();
    ok(etapas.length === 3, 'continuam sendo tres etapas', etapas.length);
    etapas.forEach(e => {
        ok(typeof e.acao === 'string' && e.acao.length > 0, 'a etapa ' + e.secao + ' tem verbo de acao', e);
        ok(typeof e.pronto === 'string' && e.pronto.length > 0, 'a etapa ' + e.secao + ' tem rotulo de concluida', e);
    });
    const entrega = etapas.find(e => e.secao === 'entrega');
    ok(entrega.acao === 'Conferir', 'a entrega pede CONFERIR', entrega);
    ok(entrega.feito === false, 'e ainda nao foi feita', entrega);
})();

(function aArteDeForaDaContaDaPropriaAbaDaArte() {
    // Na aba da arte, "falta a arte" e o botao verde que ja esta na tela. O
    // cartao ambar so fala do que esta em OUTRA aba.
    const p = portal({ status: 'Aguard. Aprovação', entrega: null, faturamento: null, artesAprovadas: false });
    const fora = p.pendenciasForaDaArte();
    ok(fora.length === 2, 'sobram as duas conferencias', fora.map(e => e.secao));
    ok(!fora.some(e => e.secao === 'arte'), 'e a arte nao entra na lista');
})();

// ─── 3. O que vai para o chat do parceiro ────────────────────────────────────

(function oChatDeixaDeDizerCOMPLETOQuandoNaoEsta() {
    // O buraco de processo: o atendimento lia "PEDIDO COMPLETO APROVADO", tocava
    // a producao, e ninguem sabia que faltava conferir endereco e CNPJ.
    const pendente = portal({ status: 'Aguard. Aprovação', entrega: null, faturamento: null, artesAprovadas: true });
    const m = pendente.mensagemDaAprovacaoDeArte();
    ok(m.indexOf('PEDIDO COMPLETO') < 0, 'a mensagem nao diz COMPLETO com conferencia pendente', m);
    ok(m.indexOf('ARTES APROVADAS') >= 0, 'ela diz o que de fato aconteceu', m);
    ok(m.indexOf('ENTREGA') >= 0 && m.indexOf('NOTA') >= 0, 'e diz o que falta, nominalmente', m);

    const completo = portal({ status: 'Aguard. Aprovação', entrega: true, faturamento: true, artesAprovadas: true });
    const mc = completo.mensagemDaAprovacaoDeArte();
    ok(mc.indexOf('PEDIDO COMPLETO') >= 0, 'com tudo conferido, ai sim ela diz COMPLETO', mc);
})();

(function oChatUsaAFuncaoEnaoOTextoCravado() {
    ok(/mensagem: mensagemDaAprovacaoDeArte\(\)/.test(CLIENTE),
        'o insert no chat chama a funcao, e nao um texto fixo');
    ok(!/mensagem: `✅ PEDIDO COMPLETO APROVADO/.test(CLIENTE),
        'o texto fixo antigo saiu do insert');
})();

// ─── 4. A tela: quem chama quem ──────────────────────────────────────────────

(function montarPortalPerguntaOndeAbrir() {
    ok(/const abertura = secaoValida\(doHash\) \? doHash : secaoDeAbertura\(statusArte\);/.test(SHELL),
        'montarPortal decide a aba de abertura por secaoDeAbertura');
    ok(/anunciarAberturaAutomatica\(abertura\)/.test(SHELL),
        'e avisa o cliente quando ela nao e a Arte');
    ok(/if \(!secaoValida\(doHash\) && abertura !== 'arte'\)/.test(SHELL),
        'o hash na URL continua mandando, e sem aviso');
})();

(function aTrilhaPintaPendenteDeAmbar() {
    ok(SHELL.indexOf('portal-passo-agora') < 0,
        'o estado azul de "voce esta aqui" saiu da trilha do JS');
    ok(CSS.indexOf('.portal-passo-agora') < 0,
        'e saiu do CSS junto');
    ok(/\.portal-passo-pendente\s*\{[^}]*var\(--amber\)/.test(CSS),
        'pendente e ambar -- a mesma cor do ponto na barra de abas');
    ok(/\.portal-passo-feito\s*\{[^}]*var\(--green\)/.test(CSS),
        'e feito continua verde');
})();

(function oCartaoDaPendenciaNaoRoubaAClasseDaAbaDeEntrega() {
    // `.portal-falta` ja existia: e o cartao EM LINHA que a aba de Entrega usa
    // para campo faltando no cadastro. Reusar o nome punha o cartao novo em
    // `flex-direction: row` -- titulo, texto e botao lado a lado, cada um numa
    // coluna estreita. Aconteceu, e foi visto na tela antes de publicar.
    ok(/class="portal-falta"/.test(ENTREGA), 'a aba de Entrega continua dona de .portal-falta');
    ok(!/portal-cartao portal-falta'/.test(CLIENTE), 'e o cartao novo nao usa aquela classe');
    ok(/portal-cartao portal-pendencia'/.test(CLIENTE), 'ele tem classe propria');
    ok(/\.portal-pendencia\s*\{/.test(CSS), 'com regra propria no CSS');
})();

(function osDoisCaminhosDaAbaDaArteExistem() {
    ok(/cartaoDoQueFaltaNaArte\(true\)/.test(CLIENTE), 'o cartao ambar entra no modo so-leitura');
    ok(/cartaoDoQueFaltaNaArte\(false\)/.test(CLIENTE), 'e e limpo no modo de aprovacao');
    ok(/function botaoDeContinuarNaArte\(\)/.test(CLIENTE), 'ha um botao de continuar no fim da secao');
    // A barra `sticky` continua sendo so do botao verde: posta ali, a saida
    // ambar cobria o proprio cartao de status da arte.
    ok(/if \(state\.arteSomenteLeitura === true\) \{\s*\n\s*containerActions\.style\.display = 'none';/.test(CLIENTE),
        'a barra grudada continua escondida quando a arte e so leitura');
})();

// ─── 5. O painel da grafica enxerga a pendencia ──────────────────────────────

(function aGraficaVeOPedidoQueOClienteNaoConferiu() {
    ok(/function avisoDeDadosNaoConferidosHtml\(numeroPedido\)/.test(PAINEL),
        'existe o marcador de dados nao conferidos');
    ok(/\$\{avisoDeDadosNaoConferidosHtml\(os\.numero\)\}/.test(PAINEL),
        'e ele esta na linha do Painel de Producao, que e onde o pedido vive depois da arte');
    ok(/if \(!arte\) return '';/.test(PAINEL),
        'sem linha em pedidos_artes nao houve link do cliente -- e nao ha o que cobrar');
    ok(/const arteJaDecidida = pedidoSaiuDaArte\(os\)/.test(PAINEL),
        'na Lista de Arte o alarme so acende depois de a arte estar decidida');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
