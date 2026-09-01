// Regras de bloqueio do negocio (usuario, 19/08/2026):
//
//   1. quem define o designer de um pedido e o atendimento;
//   2. modelo aprovado pelo cliente nao se altera -- so a anotacao e a volta
//      para "Em Alteracao", e so para atendimento, gerente e administrador;
//   3. o banco da numeracao tem de fechar com a Qtd do pedido: X linhas na
//      Frente, 2X no FxVerso, senao o modelo nao pode ser marcado PRONTO.
//
// Roda em node, sem navegador: `node tests/regras_de_bloqueio_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// As funcoes sao LIDAS do `script.js` e avaliadas aqui, com um `state` e um
// `window` de mentira -- nao copiadas. Uma copia continuaria passando depois de
// o original mudar, e estas regras sao do tipo que ninguem percebe quando para
// de valer: nada quebra na tela, so passa a deixar passar.

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

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['papelAtual', 'podeDefinirDesigner', 'podeDestravarModeloAprovado',
               'podeLiberarParaProducao',
               'modeloEstaAprovado', 'quemAprovouOModelo', 'tituloDoModeloAprovado',
               'bloqueioDeModeloAprovado',
               'linhasAtivasCsv', 'numeracaoIdDoItem',
               'colunasDoBancoDaNumeracao', 'linhasComDadoDaNumeracao', 'fatiaCsvDoItem',
               'numeracaoDoModelo', 'resolverNumeracaoParaModelo', 'vinculoDeBancoDoModelo', 'numeracaoEhDuplex',
               'temVerso', 'versoUnico', 'rotuloDoModoDeImpressao',
               'celulasEsperadasDoModelo', 'celulasGeradasDoModelo',
               'divergenciaDeCelulasDoModelo', 'textoDaDivergenciaDeCelulas'];

/** A API com um `state` e um `window` proprios daquele caso. */
function api(st, win) {
    return new Function('state', 'window',
        NOMES.map(n => extrairFuncao(SCRIPT, n)).join('\n')
        + '\nreturn { ' + NOMES.join(', ') + ' };')(st, win);
}

/** Quem esta usando o painel: pela sessao do site. */
function comoUsuario(papel, st) {
    return api(st || {}, { _currentPerms: { role: papel } });
}

/** Quem esta usando o painel: pelo codigo local da estacao, sem sessao. */
function comoOperadorLocal(papel, st) {
    return api(st || {}, { _acessoLocal: { role: papel } });
}

// ─── 1. O papel de quem esta usando ──────────────────────────────────────────

(function oPapelSaiDasDuasPortasDeEntrada() {
    ok(comoUsuario('atendimento').papelAtual() === 'atendimento',
        'o papel vem da sessao do site');
    // Na grafica o operador entra so pelo codigo local, sem sessao do Supabase.
    // Uma regra que lesse apenas _currentPerms valeria em metade das maquinas.
    ok(comoOperadorLocal('gerente').papelAtual() === 'gerente',
        'o papel vem tambem do acesso local da estacao');
    ok(api({}, { _currentPerms: { role: '  ADMIN ' } }).papelAtual() === 'admin',
        'espaco e caixa alta nao mudam o papel');
    ok(api({}, {}).papelAtual() === '', 'sem ninguem logado o papel e vazio');
})();

// ─── 2. Quem define o designer ───────────────────────────────────────────────

(function soOAtendimentoEOAdmDefinemODesigner() {
    ok(comoUsuario('atendimento').podeDefinirDesigner(), 'atendimento define');
    ok(comoUsuario('admin').podeDefinirDesigner(), 'administrador define');
    // O caso que deu origem a regra.
    ok(!comoUsuario('designer').podeDefinirDesigner(), 'o DESIGNER nao define');
    ok(!comoUsuario('gerente').podeDefinirDesigner(), 'gerente nao define');
    ok(!comoUsuario('impressor').podeDefinirDesigner(), 'impressor nao define');
    ok(!comoUsuario('visualizador').podeDefinirDesigner(), 'visualizador nao define');
})();

(function papelDesconhecidoNaoDefine() {
    // Ao contrario de podeAbrirView, aqui negar durante a partida custa um
    // select cinza por um instante; liberar custaria a regra nao valer na
    // primeira tela desenhada.
    ok(!api({}, {}).podeDefinirDesigner(), 'sem papel conhecido, ninguem define');
})();

// ─── 3. Quem destrava um modelo aprovado ─────────────────────────────────────

(function quemPodeVoltarParaAlteracao() {
    ok(comoUsuario('atendimento').podeDestravarModeloAprovado(), 'atendimento destrava');
    ok(comoUsuario('gerente').podeDestravarModeloAprovado(), 'gerente destrava');
    ok(comoUsuario('admin').podeDestravarModeloAprovado(), 'administrador destrava');
    ok(!comoUsuario('designer').podeDestravarModeloAprovado(), 'o designer nao destrava');
    ok(!api({}, {}).podeDestravarModeloAprovado(), 'sem papel conhecido, ninguem destrava');
})();

// ─── 3b. Quem libera o pedido para producao ──────────────────────────────────
//
// Usuario, 19/08/2026: so o ADM. E o clique que tira o pedido da arte e o poe na
// fila da impressora -- depois dele o material vai para o papel, e papel
// impresso nao volta atras.

(function soOAdministradorLiberaParaProducao() {
    ok(comoUsuario('admin').podeLiberarParaProducao(), 'o administrador libera');
    ok(!comoUsuario('gerente').podeLiberarParaProducao(), 'o gerente NAO libera');
    ok(!comoUsuario('atendimento').podeLiberarParaProducao(), 'o atendimento nao libera');
    ok(!comoUsuario('designer').podeLiberarParaProducao(), 'o designer nao libera');
    ok(!comoUsuario('impressor').podeLiberarParaProducao(), 'nem o impressor');
    ok(!comoUsuario('visualizador').podeLiberarParaProducao(), 'nem o visualizador');
    ok(!api({}, {}).podeLiberarParaProducao(), 'e sem papel conhecido, ninguem libera');
    // Na estacao da grafica o operador entra so pelo codigo local.
    ok(comoOperadorLocal('admin').podeLiberarParaProducao(), 'o adm da estacao tambem libera');
})();

(function oBotaoEAFuncaoConferemOsDois() {
    // Botao cinza nao impede ninguem de chamar a funcao pelo console.
    const i = SCRIPT.indexOf('window.liberarParaProducao = async function');
    ok(i > 0, 'o liberarParaProducao continua existindo');
    const trecho = SCRIPT.slice(i, i + 500);
    ok(/podeLiberarParaProducao\(\)/.test(trecho), 'a funcao confere quem esta chamando');
    ok(/return;/.test(trecho), 'e desiste quando nao pode');

    ok(/const podeLiberar = podeLiberarParaProducao\(\);/.test(SCRIPT),
        'e o botao da Lista de Arte tambem pergunta');
    ok(/Só o administrador libera um pedido para produção/.test(SCRIPT),
        'travado, dizendo a quem pedir');
    // O caminho normal e o parceiro gravar `status_interno`. O titulo diz isso
    // ao administrador, para ele nao liberar por habito na frente do parceiro.
    ok(/Conting[êe]ncia — o normal é o sistema parceiro/.test(SCRIPT),
        'e para o administrador o botao se anuncia como contingencia');
})();

// ─── 4. Qual modelo esta aprovado ────────────────────────────────────────────

(function oSeloDeAprovadoTemDoisNomes() {
    const A = comoUsuario('admin');
    // A tela usa `amostra_status`; a coluna oficial do Supabase e `status_arte`.
    // Um pedido recem-carregado pode chegar com so um dos dois preenchido.
    ok(A.modeloEstaAprovado({ amostra_status: 'APROVADA' }), 'APROVADA da tela');
    ok(A.modeloEstaAprovado({ status_arte: 'APROVADA_CLIENTE' }), 'APROVADA_CLIENTE do banco');
    ok(!A.modeloEstaAprovado({ amostra_status: 'PRONTO' }), 'PRONTO nao e aprovado');
    ok(!A.modeloEstaAprovado({ amostra_status: 'REPROVADA' }), 'REPROVADA nao e aprovado');
    ok(!A.modeloEstaAprovado({ amostra_status: 'PENDENTE' }), 'PENDENTE nao e aprovado');
    ok(!A.modeloEstaAprovado({}), 'modelo sem status nao e aprovado');
    ok(!A.modeloEstaAprovado(null), 'e modelo nulo nao quebra a regra');
})();

// ─── 4b. QUEM aprovou: o cliente ou o atendente ──────────────────────────────
//
// Usuario, 19/08/2026: aprovado pelo botao APROVAR do link do cliente, o
// registro diz "aprovado pelo cliente"; aprovado pelo botao do pedido, diz
// "aprovado pelo ATENDENTE". A resposta mora no valor do status_arte, escrito
// por quem aprovou.

const APROVADO_CLIENTE = { id: 'm1', amostra_status: 'APROVADA', status_arte: 'APROVADA_CLIENTE' };
const APROVADO_BALCAO = { id: 'm1', amostra_status: 'APROVADA', status_arte: 'APROVADA' };

(function oStatusArteDizQuemAprovou() {
    const A = comoUsuario('admin');
    ok(A.quemAprovouOModelo(APROVADO_CLIENTE) === 'cliente', 'APROVADA_CLIENTE veio do link');
    ok(A.quemAprovouOModelo(APROVADO_BALCAO) === 'atendente', 'APROVADA veio do painel');
    ok(A.quemAprovouOModelo({ amostra_status: 'PRONTO' }) === null, 'modelo em arte nao tem aprovador');
    ok(A.quemAprovouOModelo(null) === null, 'e modelo nulo nao quebra');
})();

(function aFraseNomeiaQuemAprovou() {
    const A = comoUsuario('admin');
    ok(A.tituloDoModeloAprovado(APROVADO_CLIENTE) === 'Modelo aprovado pelo cliente',
        'a frase do cliente', A.tituloDoModeloAprovado(APROVADO_CLIENTE));
    ok(A.tituloDoModeloAprovado(APROVADO_BALCAO) === 'Modelo aprovado pelo ATENDENTE',
        'a frase do atendente', A.tituloDoModeloAprovado(APROVADO_BALCAO));
})();

(function semDadoNaoSeInventaAtribuicao() {
    // Dizer "pelo cliente" sobre uma aprovacao de balcao seria contar a historia
    // errada -- que e exatamente o defeito que esta distincao veio corrigir.
    const A = comoUsuario('admin');
    const semStatusArte = { id: 'm1', amostra_status: 'APROVADA' };
    ok(A.quemAprovouOModelo(semStatusArte) === null, 'sem status_arte nao ha aprovador');
    ok(A.tituloDoModeloAprovado(semStatusArte) === 'Modelo aprovado',
        'e a frase sai sem atribuicao', A.tituloDoModeloAprovado(semStatusArte));
})();

(function aRecusaTambemNomeiaQuemAprovou() {
    const A = comoUsuario('designer');
    const r = A.bloqueioDeModeloAprovado(APROVADO_BALCAO, { amostra_cor_id: 7 });
    ok(r && /ATENDENTE/.test(r.motivo), 'a recusa diz que foi o atendente', r);
    const rc = A.bloqueioDeModeloAprovado(APROVADO_CLIENTE, { amostra_cor_id: 7 });
    ok(rc && /pelo cliente/.test(rc.motivo), 'e quando foi o cliente, diz o cliente', rc);
})();

(function aprovadoPeloBalcaoTravaIgual() {
    // A origem muda a FRASE, nunca a trava: os dois sao acordo fechado.
    const A = comoUsuario('atendimento');
    ok(A.modeloEstaAprovado(APROVADO_BALCAO), 'aprovado no balcao tambem esta aprovado');
    ok(A.bloqueioDeModeloAprovado(APROVADO_BALCAO, { amostra_num_id: 9 }) !== null,
        'e trava a numeracao do mesmo jeito');
})();

// ─── 5. O que passa e o que nao passa num modelo aprovado ────────────────────

const APROVADO = { id: 'm1', amostra_status: 'APROVADA' };
const EM_ARTE = { id: 'm2', amostra_status: 'PRONTO' };

(function modeloQueNaoEstaAprovadoNaoTemTrava() {
    const A = comoUsuario('designer');
    ok(A.bloqueioDeModeloAprovado(EM_ARTE, { amostra_cor_id: 7 }) === null,
        'modelo em arte continua livre');
    ok(A.bloqueioDeModeloAprovado(EM_ARTE, { amostra_status: 'PRONTO' }) === null,
        'e pode ser marcado PRONTO');
})();

(function noModeloAprovadoNadaSeAltera() {
    const A = comoUsuario('atendimento');
    // "nem os drops de numeracao e cor, nem tabelas, nada" -- palavras do usuario.
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_cor_id: 7 }) !== null, 'a cor nao muda');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_num_id: 9 }) !== null, 'a numeracao nao muda');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { csv_selecao: {} }) !== null, 'a fatia do banco nao muda');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { arte_url: 'x' }) !== null, 'a arte nao muda');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { arte_url: null, _isExplicitRemove: true }) !== null,
        'e a arte tambem nao se APAGA');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { modo_pdf: true }) !== null, 'o modo PDF nao muda');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'PRONTO' }) !== null,
        'nem volta a ser PRONTO por um atalho');
})();

(function asDuasSaidasQueContinuamDePe() {
    const A = comoUsuario('atendimento');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_obs: 'trocar a data' }) === null,
        'a descricao continua editavel');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'REPROVADA', amostra_obs: 'x' }) === null,
        'e o botao Em Alteracao funciona');
    ok(comoUsuario('gerente').bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'REPROVADA', amostra_obs: 'x' }) === null,
        'o gerente tambem coloca em alteracao');
    ok(comoUsuario('admin').bloqueioDeModeloAprovado(APROVADO, { amostra_obs: 'x' }) === null,
        'e o administrador tambem');
})();

(function oDesignerNaoDestravaOQueOClienteAprovou() {
    const A = comoUsuario('designer');
    const r1 = A.bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'REPROVADA', amostra_obs: 'x' });
    ok(r1 !== null, 'o designer nao coloca em alteracao');
    // A trava tem de dizer a quem pedir, senao e porta sem saida.
    ok(/atendimento/i.test((r1 && r1.motivo) || ''), 'e a recusa diz a quem pedir', r1);
    ok(r1 && r1.silencioso === false, 'e ela e dita em voz alta, nao engolida', r1);
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_obs: 'x' }) !== null,
        'nem escreve na descricao');
})();

(function aPreviaCompostaEDescartadaEmSilencio() {
    // O snapshot regrava a previa a cada desenho do card, sem ninguem pedir. Num
    // modelo travado ela nao tem o que atualizar; avisar encheria a tela de
    // alertas sobre uma alteracao que pessoa nenhuma tentou fazer.
    const A = comoUsuario('atendimento');
    const r = A.bloqueioDeModeloAprovado(APROVADO, { amostra_arte_base64: 'https://x/previa.jpg' });
    ok(r !== null, 'a previa tambem nao e gravada no modelo travado');
    ok(r && r.silencioso === true, 'mas o descarte e silencioso', r);

    const rVerso = A.bloqueioDeModeloAprovado(APROVADO, { verso_amostra_arte_base64: 'https://x/v.jpg' });
    ok(rVerso && rVerso.silencioso === true, 'no verso tambem', rVerso);

    // O silencio vale so quando o pacote tem SO a previa. Junto de uma alteracao
    // de verdade, o aviso volta.
    const rMisto = A.bloqueioDeModeloAprovado(APROVADO, { amostra_arte_base64: 'x', amostra_cor_id: 7 });
    ok(rMisto && rMisto.silencioso === false, 'previa junto com alteracao real avisa', rMisto);
})();

(function noLinkDoClienteARegraNaoVale() {
    // E a tela em que ELE aprova. Travar ali seria travar quem a regra protege.
    const A = api({ amostrasContainerId: 'cliente-amostras-itens-container' },
                  { _currentPerms: { role: '' } });
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'REPROVADA' }) === null,
        'o cliente continua podendo pedir alteracao');
    ok(A.bloqueioDeModeloAprovado(APROVADO, { amostra_status: 'APROVADA' }) === null,
        'e continua podendo aprovar');
})();

// ─── 6. Qtd x linhas do banco ────────────────────────────────────────────────

/** Um pedido com um modelo, uma numeracao e um banco de N linhas. */
function cenario(qtd, linhas, printMode) {
    const rows = [];
    for (let i = 0; i < linhas; i++) rows.push({ NUM: String(i + 1) });
    const st = {
        numeracoes: [{ id: 'n1', name: 'Numeracao', print_mode: printMode, csv_data: rows }],
        osItens: {}
    };
    return { api: comoUsuario('designer', st), item: { id: 'm1', quantidade: qtd, numeracao_id: 'n1' } };
}

(function frenteFechaComAQuantidadeDoPedido() {
    const c = cenario(1000, 1000, 'front');
    ok(c.api.celulasEsperadasDoModelo(c.item) === 1000, 'Frente espera Qtd linhas');
    ok(c.api.celulasGeradasDoModelo(c.item) === 1000, 'e o banco tem essas linhas');
    ok(c.api.divergenciaDeCelulasDoModelo(c.item) === null, 'entao nao ha divergencia');
})();

(function fxVersoUsaAsMesmasLinhasDaFrente() {
    // Regra do usuario, 26/08/2026: *"modelos frente e verso utilizam as mesmas
    // linhas em colunas diferentes, se Qtd=15 devem ser utilizadas 15 linhas,
    // sendo somente frente ou sendo frente e verso"*.
    //
    // Corrige a versao de 19/08, que esperava o dobro. Uma linha e UMA PECA: o
    // verso dela le outras colunas da mesma linha. O engine.py sempre fez assim
    // — `_render_item_back` recebe o mesmo `item_data` do front.
    const c = cenario(1000, 1000, 'duplex');
    ok(c.api.celulasEsperadasDoModelo(c.item) === 1000, 'FxVerso espera a MESMA Qtd');
    ok(c.api.divergenciaDeCelulasDoModelo(c.item) === null, 'e 1000 linhas fecham');

    // O caso que o usuario mostrou na tela: credencial PVC, Qtd 15, FxVerso,
    // 15 linhas. Antes da correcao a trava dizia "esperado 30 · faltam 15" e
    // impedia o PRONTO de um modelo que estava certo.
    const pvc = cenario(15, 15, 'duplex');
    ok(pvc.api.divergenciaDeCelulasDoModelo(pvc.item) === null,
        'Qtd 15 FxVerso com 15 linhas fecha — era o bloqueio da credencial PVC');
})();

(function fxVersoComOBancoDobrado() {
    // O erro que sobra depois da correcao: alguem duplicou as linhas do banco
    // achando que o verso pedia uma para ele.
    const c = cenario(1000, 2000, 'duplex');
    const d = c.api.divergenciaDeCelulasDoModelo(c.item);
    ok(d !== null, 'FxVerso com o banco dobrado e divergencia');
    ok(d && d.esperado === 1000 && d.gerado === 2000, 'a conta e 1000 contra 2000', d);
    ok(d && d.diferenca === 1000, 'e sobram mil linhas', d);
    const frase = c.api.textoDaDivergenciaDeCelulas(d);
    ok(/sobram 1000/.test(frase), 'a frase diz quantas sobram', frase);
    ok(/FxVerso/.test(frase), 'e diz o modo de impressao — o rotulo continua, so a conta mudou', frase);
    ok(/Qtd 1000/.test(frase), 'e traz a Qtd do pedido', frase);

    // E o banco curto continua sendo divergencia, no FxVerso como na Frente.
    const curto = cenario(1000, 600, 'duplex');
    const dc = curto.api.divergenciaDeCelulasDoModelo(curto.item);
    ok(dc && dc.diferenca === -400, 'FxVerso com banco curto: faltam 400', dc);
    ok(/faltam 400/.test(curto.api.textoDaDivergenciaDeCelulas(dc)), 'e a frase diz isso');
})();

(function bancoMaiorQueOPedidoTambemEDivergencia() {
    const c = cenario(1000, 1200, 'front');
    const d = c.api.divergenciaDeCelulasDoModelo(c.item);
    ok(d !== null, 'banco maior que a Qtd tambem trava');
    ok(d && d.diferenca === 200, 'e a diferenca e positiva', d);
    ok(/sobram 200/.test(c.api.textoDaDivergenciaDeCelulas(d)), 'a frase diz quantas sobram');
})();

(function linhaDesligadaNaoConta() {
    // O CSV tem linhas que o operador desmarcou; elas nao imprimem, entao nao
    // podem entrar na conta do que foi gerado.
    const A = comoUsuario('designer', {
        numeracoes: [{ id: 'n1', print_mode: 'front', csv_data: [
            { NUM: '1' }, { NUM: '2' }, { NUM: '3' }, { NUM: '4', __ativo: false }
        ] }],
        osItens: {}
    });
    const item = { id: 'm1', quantidade: 3, numeracao_id: 'n1' };
    ok(A.celulasGeradasDoModelo(item) === 3, 'linha desmarcada nao conta como gerada');
    ok(A.divergenciaDeCelulasDoModelo(item) === null, 'e a conta fecha com Qtd 3');
})();

(function semBancoARegraNaoSeAplica() {
    // Decisao do usuario: numeracao por faixa ou PDF nao tem linha para contar,
    // e travar o que nao da para medir so pararia trabalho bom.
    const A = comoUsuario('designer', { numeracoes: [{ id: 'n1', print_mode: 'front' }], osItens: {} });
    const item = { id: 'm1', quantidade: 1000, numeracao_id: 'n1' };
    ok(A.celulasGeradasDoModelo(item) === null, 'sem banco nao ha linha para contar');
    ok(A.divergenciaDeCelulasDoModelo(item) === null, 'e o modelo pode seguir');
})();

(function semNumeracaoOuSemQtdNaoHaConta() {
    const c = cenario(1000, 1000, 'front');
    ok(c.api.celulasEsperadasDoModelo({ id: 'm1', quantidade: 1000 }) === null,
        'modelo sem numeracao nao tem esperado');
    ok(c.api.celulasEsperadasDoModelo({ id: 'm1', numeracao_id: 'n1' }) === null,
        'modelo sem Qtd nao tem esperado');
    ok(c.api.divergenciaDeCelulasDoModelo({ id: 'm1', numeracao_id: 'n1', quantidade: 0 }) === null,
        'e Qtd zero nao inventa divergencia');
})();

// ─── 7. Onde as regras estao ligadas ─────────────────────────────────────────

(function aTravaDoModeloAprovadoEstaNoFunilDasGravacoes() {
    // Conferir dentro do saveAmostraToDB, e nao em cada uma das quinze funcoes
    // que gravam, e o que faz a regra valer para as que ainda nao existem.
    const i = SCRIPT.indexOf('async function saveAmostraToDB');
    ok(i > 0, 'o saveAmostraToDB continua existindo');
    const trecho = SCRIPT.slice(i, i + 2000);
    ok(/const bloqueio = bloqueioDeModeloAprovado\(itemLocal, dataToUpdate\);/.test(trecho),
        'e ele pergunta antes de gravar');
})();

(function aTravaDeCelulasEstaNoMarcarPronto() {
    const i = SCRIPT.indexOf('async function decisionAmostraItem');
    ok(i > 0, 'o decisionAmostraItem continua existindo');
    // A janela cresceu em 26/08/2026: a trava da FATIA ORFA entrou antes da de
    // Qtd (ela descreve o mesmo sintoma e diz a causa certa), e empurrou esta
    // linha para baixo. O que se guarda aqui e que o PRONTO passa pelas duas.
    const trecho = SCRIPT.slice(i, i + 3000);
    ok(/status === 'PRONTO'/.test(trecho) && /divergenciaDeCelulasDoModelo/.test(trecho),
        'e o PRONTO passa pela conta de Qtd x linhas');
    ok(/distribuicaoOrfaDoModelo/.test(trecho),
        'e pela fatia que nao e deste banco');
    ok(trecho.indexOf('distribuicaoOrfaDoModelo') < trecho.indexOf('divergenciaDeCelulasDoModelo'),
        'nessa ordem: a causa antes do sintoma');
})();

(function asTresPortasDoDesignerEstaoFechadas() {
    // O select da lista, o card de designers e a gravacao no banco. Faltando
    // uma, a regra vale so ate alguem usar a outra.
    ['function setOSDesigner', 'async function confirmAndSelectDesigner', 'async function selectDesigner']
        .forEach(assinatura => {
            const i = SCRIPT.indexOf(assinatura);
            ok(i > 0, 'existe ' + assinatura);
            ok(/podeDefinirDesigner\(\)/.test(SCRIPT.slice(i, i + 700)),
                assinatura + ' confere quem esta chamando');
        });
})();

(function oPainelGravaAPROVADAEOLinkDoClienteAPROVADA_CLIENTE() {
    // As duas metades da distincao. O link do cliente tem o PROPRIO
    // saveAmostraToDB, em cliente.js -- a pagina dele nao carrega o script.js --,
    // entao a mudanca no painel nao pode ter mexido no que o cliente grava.
    const i = SCRIPT.indexOf('async function saveAmostraToDB');
    const trecho = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));
    ok(/'APROVADA_CLIENTE' : 'APROVADA'/.test(trecho),
        'o painel grava APROVADA e so a tela do cliente grava APROVADA_CLIENTE');
    ok(/itemLocal\.status_arte = dbData\.status_arte/.test(trecho),
        'e o item em memoria recebe o valor, senao a faixa so mudaria depois de um F5');

    const CLIENTE_JS = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente.js'), 'utf8');
    const j = CLIENTE_JS.indexOf('async function saveAmostraToDB');
    ok(j > 0, 'o link do cliente continua com o proprio saveAmostraToDB');
    ok(/status_arte = 'APROVADA_CLIENTE'/.test(CLIENTE_JS.slice(j, j + 2000)),
        'e ele continua gravando APROVADA_CLIENTE');
})();

(function oCardFechadoEDesenhadoComOAtributoQueATravaProcura() {
    ok(/data-modelo-aprovado="1"/.test(SCRIPT), 'o card aprovado se identifica');
    ok(/data-libera-aprovado="1"/.test(SCRIPT), 'e os dois controles liberados se identificam');
    ok(/travarCardsDeModelosAprovados\(container\)/.test(SCRIPT), 'a trava e aplicada apos o desenho');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
