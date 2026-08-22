// Acoes em lote no pedido: Marcar PRONTO, Em Alteracao e Aprovar todos os
// modelos do mesmo pedido de uma vez.
//
// Pedido do usuario em 22/08/2026: "Cria um botao (acao) dentro do pedido para
// Marcar Pronto, Reprovar e Aprovar simultaneamente todos os modelos do mesmo
// pedido, respeitando que aprovacao e reprovacao somente usuario ADM e
// Atendimento".
//
// O botao em lote faz, modelo a modelo, o que o botao do card ja faz -- a mesma
// `decisionAmostraItem`, as mesmas travas, as mesmas gravacoes. O que e NOVO, e
// o que este harness mede, sao as pecas puras que decidem ANTES de agir:
//
//   1. `podeAgirEmLoteNoPedido(acao)`: PRONTO e de todo mundo (como o botao do
//      card); APROVADA e REPROVADA sao so de 'admin' e 'atendimento' -- lidos
//      pela sessao do site OU pelo codigo local da estacao, porque na grafica o
//      operador entra sem sessao do Supabase.
//   2. `planoDaAcaoEmLote(itens, acao, ctx)`: quem entra e quem fica de fora,
//      com o motivo exato e na ordem de precedencia da spec. E a lista que o
//      operador le antes de confirmar; motivo errado e ele confirmando uma
//      coisa e o sistema fazendo outra.
//   3. `textoDoPlanoEmLote(plano, total)`: o texto da confirmacao -- singular e
//      plural, a lista "Ficam de fora" so quando ha pulados, e "Nenhum modelo
//      para ..." quando ninguem entra.
//   4. `nomeDoModeloParaLista(item)`: o nome que aparece nessa lista.
//
// Roda em node, sem navegador: `node tests/acao_em_lote_harness.js`.
// Sai com codigo 1 se algum caso falhar.
//
// Os trechos sao LIDOS do `script.js`, nao copiados: uma copia continuaria
// passando depois de o original mudar. Por isso as funcoes precisam ser
// auto-contidas (so chamar umas as outras, `papelAtual` e `modeloEstaAprovado`)
// e fechar com `}` na coluna zero -- e o que o extrator procura.
//
// Desenho: docs/superpowers/specs/2026-08-22-acoes-em-lote-no-pedido-design.md

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = fs.readFileSync(path.join(RAIZ, 'frontend', 'script.js'), 'utf8');

let falhas = 0;
let total = 0;

function ok(cond, nome, extra) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + nome + (extra !== undefined ? '\n         ' + JSON.stringify(extra) : ''));
}

/** `const NOME = {` ... ate o `\n};` que fecha a declaracao. */
function extrairConst(src, nome, fecho) {
    const ini = src.indexOf('const ' + nome + ' = ');
    if (ini < 0) throw new Error('nao achei a const ' + nome + ' no script.js');
    const fim = src.indexOf('\n' + fecho, ini);
    if (fim < 0) throw new Error('nao achei o fim da const ' + nome);
    return src.slice(ini, fim + 1 + fecho.length);
}

function extrairFuncao(src, nome) {
    const i = src.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome + ' no script.js');
    const fim = src.indexOf('\n}', i);
    if (fim < 0) throw new Error('nao achei o fim da funcao ' + nome);
    return src.slice(i, fim + 2);
}

const NOMES = ['papelAtual', 'modeloEstaAprovado',
               'podeAgirEmLoteNoPedido', 'nomeDoModeloParaLista',
               'planoDaAcaoEmLote', 'textoDoPlanoEmLote'];

let CODIGO;
try {
    CODIGO = [extrairConst(SCRIPT, 'ROTULO_DA_ACAO_EM_LOTE', '};')]
        .concat(NOMES.map(n => extrairFuncao(SCRIPT, n)))
        .join('\n');
} catch (e) {
    console.error('FALHOU: ' + e.message);
    console.error('\nAs funcoes das acoes em lote nao estao no script.js com o nome da spec '
        + '(ou nao fecham com "}" na coluna zero).');
    process.exit(1);
}

/** A API com um `window` (e um `state`) proprios daquele caso. */
function api(win, st) {
    return new Function('window', 'state',
        CODIGO + '\nreturn { ROTULO_DA_ACAO_EM_LOTE, ' + NOMES.join(', ') + ' };')(win || {}, st || {});
}

/** Quem esta usando o painel: pela sessao do site. */
function comoUsuario(papel) {
    return api({ _currentPerms: { role: papel } });
}

/** Quem esta usando o painel: pelo codigo local da estacao, sem sessao. */
function comoOperadorLocal(papel) {
    return api({ _acessoLocal: { role: papel } });
}

// ─── 0. Os rotulos das tres acoes ────────────────────────────────────────────

(function osRotulosSaoOsDaSpec() {
    const { ROTULO_DA_ACAO_EM_LOTE } = api();
    ok(ROTULO_DA_ACAO_EM_LOTE.PRONTO === 'Marcar PRONTO', 'rotulo do PRONTO', ROTULO_DA_ACAO_EM_LOTE);
    ok(ROTULO_DA_ACAO_EM_LOTE.REPROVADA === 'Colocar em Alteração', 'rotulo da REPROVADA', ROTULO_DA_ACAO_EM_LOTE);
    ok(ROTULO_DA_ACAO_EM_LOTE.APROVADA === 'Aprovar', 'rotulo da APROVADA', ROTULO_DA_ACAO_EM_LOTE);
})();

// ─── 1. Quem pode acionar cada acao em lote ──────────────────────────────────
//
// Usuario, 22/08/2026: "aprovacao e reprovacao somente usuario ADM e
// Atendimento". O PRONTO continua sendo de quem ja marcava PRONTO no card: todo
// mundo que abre o pedido.

(function marcarProntoEmLoteEDeTodoMundo() {
    const papeis = ['admin', 'atendimento', 'designer', 'gerente', 'impressor', 'visualizador', 'financeiro', ''];
    papeis.forEach(papel => {
        ok(comoUsuario(papel).podeAgirEmLoteNoPedido('PRONTO') === true,
            'PRONTO em lote: ' + (papel || '(papel vazio)') + ' pode');
    });
    ok(comoOperadorLocal('designer').podeAgirEmLoteNoPedido('PRONTO') === true,
        'PRONTO em lote: o designer da estacao tambem pode');
    ok(api({}).podeAgirEmLoteNoPedido('PRONTO') === true,
        'PRONTO em lote: sem ninguem logado ainda pode (e o botao do card)');
})();

(function aprovarEAlterarEmLoteSaoSoDoAdmEDoAtendimento() {
    ['APROVADA', 'REPROVADA'].forEach(acao => {
        // Pela sessao do site.
        ok(comoUsuario('admin').podeAgirEmLoteNoPedido(acao) === true, acao + ' em lote: admin (site) pode');
        ok(comoUsuario('atendimento').podeAgirEmLoteNoPedido(acao) === true, acao + ' em lote: atendimento (site) pode');
        // Pelo codigo local da estacao: na grafica nao ha sessao do Supabase.
        ok(comoOperadorLocal('admin').podeAgirEmLoteNoPedido(acao) === true, acao + ' em lote: admin (estacao) pode');
        ok(comoOperadorLocal('atendimento').podeAgirEmLoteNoPedido(acao) === true, acao + ' em lote: atendimento (estacao) pode');
        // Caixa alta e espaco no papel nao mudam a resposta.
        ok(comoUsuario(' Admin ').podeAgirEmLoteNoPedido(acao) === true, acao + ' em lote: " Admin " e admin');
        // E mais ninguem.
        ok(comoUsuario('gerente').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: o gerente NAO pode');
        ok(comoUsuario('designer').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: o designer NAO pode');
        ok(comoUsuario('impressor').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: o impressor NAO pode');
        ok(comoUsuario('visualizador').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: o visualizador NAO pode');
        ok(comoUsuario('financeiro').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: o financeiro NAO pode');
        ok(comoUsuario('').podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: papel vazio NAO pode');
        ok(api({}).podeAgirEmLoteNoPedido(acao) === false, acao + ' em lote: sem ninguem logado NAO pode');
    });
})();

// ─── 2. O plano: quem entra e quem fica de fora ──────────────────────────────
//
// O `ctx` e de mentira: as contas de divergencia e de banco incompleto tem o
// proprio harness (regras_de_bloqueio, fatia do banco). Aqui importa so o que
// o plano faz com a resposta delas.

const SEM_TRAVAS = { podeDestravar: false, divergencia: () => null, bancoIncompleto: () => null };

/** Um ctx em que os modelos com `_div` tem divergencia e os com `_banco` tem banco incompleto. */
function ctxPorMarcacao(podeDestravar) {
    return {
        podeDestravar: !!podeDestravar,
        divergencia:     item => item && item._div   ? item._div   : null,
        bancoIncompleto: item => item && item._banco ? item._banco : null,
    };
}

const A = api({ _currentPerms: { role: 'atendimento' } });

(function oPlanoDevolveAAcaoEAsDuasListas() {
    const p = A.planoDaAcaoEmLote([], 'PRONTO', SEM_TRAVAS);
    ok(p && p.acao === 'PRONTO', 'o plano devolve a acao', p);
    ok(Array.isArray(p.aplicar) && p.aplicar.length === 0, 'itens vazio: ninguem para aplicar', p);
    ok(Array.isArray(p.pulados) && p.pulados.length === 0, 'itens vazio: ninguem de fora', p);

    const q = A.planoDaAcaoEmLote(undefined, 'APROVADA', SEM_TRAVAS);
    ok(q && q.acao === 'APROVADA' && q.aplicar.length === 0 && q.pulados.length === 0,
        'itens undefined nao quebra: listas vazias', q);
})();

(function oPlanoPreservaAOrdemDosItens() {
    const itens = [
        { id: 'a', amostra_status: 'PENDENTE' },
        { id: 'b', amostra_status: 'PRONTO' },
        { id: 'c', amostra_status: 'REPROVADA' },
        { id: 'd', amostra_status: null },
    ];
    const p = A.planoDaAcaoEmLote(itens, 'PRONTO', SEM_TRAVAS);
    ok(p.aplicar.map(i => i.id).join(',') === 'a,c,d', 'aplicar segue a ordem do pedido', p.aplicar.map(i => i.id));
    ok(p.aplicar[0] === itens[0] && p.aplicar[1] === itens[2], 'e sao os MESMOS objetos, nao copias');
    ok(p.pulados.length === 1 && p.pulados[0].item === itens[1], 'o pulado carrega o item', p.pulados);
    ok(p.pulados[0].motivo === 'já está pronto', 'e o motivo', p.pulados);
})();

// PRONTO: 1. ja pronto  2. aprovado  3. divergencia  4. banco incompleto.

(function prontoPulaQuemJaEstaPronto() {
    const p = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'PRONTO' }], 'PRONTO', SEM_TRAVAS);
    ok(p.aplicar.length === 0 && p.pulados.length === 1, 'PRONTO: o que ja esta pronto fica de fora', p);
    ok(p.pulados[0].motivo === 'já está pronto', 'com o motivo "já está pronto"', p.pulados);
})();

(function prontoPulaOModeloAprovado() {
    // Os dois nomes do selo: a tela diz APROVADA, o banco diz APROVADA_CLIENTE.
    const p = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'APROVADA' }], 'PRONTO', SEM_TRAVAS);
    ok(p.pulados.length === 1 && p.pulados[0].motivo === 'aprovado pelo cliente — não se altera',
        'PRONTO: aprovado (APROVADA) fica de fora com o motivo da spec', p.pulados);
    const q = A.planoDaAcaoEmLote([{ id: 2, status_arte: 'APROVADA_CLIENTE' }], 'PRONTO', SEM_TRAVAS);
    ok(q.pulados.length === 1 && q.pulados[0].motivo === 'aprovado pelo cliente — não se altera',
        'PRONTO: aprovado (APROVADA_CLIENTE do banco) fica de fora', q.pulados);
})();

(function prontoPulaADivergenciaEOBancoIncompleto() {
    const itens = [
        { id: 1, amostra_status: 'PENDENTE', _div: 'Qtd 1000 × 2000 células (FxVerso): faltam 1000' },
        { id: 2, amostra_status: 'PENDENTE', _banco: 'banco incompleto: o elemento NOME não tem CSV' },
        { id: 3, amostra_status: 'PENDENTE' },
    ];
    const p = A.planoDaAcaoEmLote(itens, 'PRONTO', ctxPorMarcacao(false));
    ok(p.aplicar.length === 1 && p.aplicar[0].id === 3, 'PRONTO: so o modelo sem trava entra', p.aplicar);
    ok(p.pulados.length === 2, 'PRONTO: os dois travados ficam de fora', p.pulados);
    ok(p.pulados[0].item.id === 1 && p.pulados[0].motivo === itens[0]._div,
        'o motivo da divergencia e o TEXTO que o ctx devolveu', p.pulados[0]);
    ok(p.pulados[1].item.id === 2 && p.pulados[1].motivo === itens[1]._banco,
        'o motivo do banco incompleto e o TEXTO que o ctx devolveu', p.pulados[1]);
})();

(function prontoRespeitaAPrecedenciaDosMotivos() {
    // Um modelo que bate em mais de um motivo sai com o PRIMEIRO da lista.
    const ctx = ctxPorMarcacao(false);
    const p1 = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'PRONTO', _div: 'div', _banco: 'banco' }], 'PRONTO', ctx);
    ok(p1.pulados[0].motivo === 'já está pronto', 'ja pronto vence divergencia e banco', p1.pulados);
    const p2 = A.planoDaAcaoEmLote([{ id: 2, amostra_status: 'APROVADA', _div: 'div', _banco: 'banco' }], 'PRONTO', ctx);
    ok(p2.pulados[0].motivo === 'aprovado pelo cliente — não se altera', 'aprovado vence divergencia e banco', p2.pulados);
    const p3 = A.planoDaAcaoEmLote([{ id: 3, amostra_status: 'PENDENTE', _div: 'div', _banco: 'banco' }], 'PRONTO', ctx);
    ok(p3.pulados[0].motivo === 'div', 'divergencia vence banco incompleto', p3.pulados);
})();

(function prontoDeixaEntrarQuemNaoTemTrava() {
    const itens = [
        { id: 1, amostra_status: 'PENDENTE' },
        { id: 2, amostra_status: 'REPROVADA' },   // em alteracao: pode voltar a PRONTO
        { id: 3 },                                  // sem status nenhum
    ];
    const p = A.planoDaAcaoEmLote(itens, 'PRONTO', SEM_TRAVAS);
    ok(p.aplicar.length === 3 && p.pulados.length === 0, 'PRONTO: pendente, em alteracao e sem status entram', p);
})();

// APROVADA: 1. ja aprovado. So isso -- o APROVAR do card nao passa pela conta
// de celulas, e o lote faz o que o card faz.

(function aprovarPulaQuemJaEstaAprovado() {
    const p = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'APROVADA' }], 'APROVADA', SEM_TRAVAS);
    ok(p.aplicar.length === 0 && p.pulados.length === 1 && p.pulados[0].motivo === 'já está aprovado',
        'APROVADA: aprovado (APROVADA) fica de fora com "já está aprovado"', p.pulados);
    const q = A.planoDaAcaoEmLote([{ id: 2, status_arte: 'APROVADA_CLIENTE' }], 'APROVADA', SEM_TRAVAS);
    ok(q.aplicar.length === 0 && q.pulados.length === 1 && q.pulados[0].motivo === 'já está aprovado',
        'APROVADA: aprovado (APROVADA_CLIENTE sem amostra_status) fica de fora', q.pulados);
})();

(function aprovarDeixaEntrarOResto() {
    const itens = [
        { id: 1, amostra_status: 'PRONTO' },
        { id: 2, amostra_status: 'PENDENTE' },
        { id: 3, amostra_status: 'REPROVADA' },
        { id: 4, amostra_status: 'PRONTO', _div: 'div', _banco: 'banco' },  // travas do PRONTO nao valem aqui
    ];
    const p = A.planoDaAcaoEmLote(itens, 'APROVADA', ctxPorMarcacao(false));
    ok(p.aplicar.length === 4 && p.pulados.length === 0,
        'APROVADA: pronto, pendente, em alteracao e ate com divergencia entram (como no card)', p);
})();

// REPROVADA: 1. ja em alteracao  2. aprovado e quem clicou nao destrava.

(function alterarPulaQuemJaEstaEmAlteracao() {
    const p = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'REPROVADA' }], 'REPROVADA', SEM_TRAVAS);
    ok(p.aplicar.length === 0 && p.pulados.length === 1 && p.pulados[0].motivo === 'já está em alteração',
        'REPROVADA: o que ja esta em alteracao fica de fora', p.pulados);
    // Mesmo quando quem clicou pode destravar: nao ha o que destravar.
    const q = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'REPROVADA' }], 'REPROVADA', ctxPorMarcacao(true));
    ok(q.pulados.length === 1 && q.pulados[0].motivo === 'já está em alteração',
        'REPROVADA: ja em alteracao fica de fora mesmo com podeDestravar', q.pulados);
})();

(function alterarUmAprovadoDependeDeQuemClicou() {
    const MOTIVO = 'aprovado — só o atendimento, o gerente ou o administrador devolvem para alteração';
    const aprovadoTela = { id: 1, amostra_status: 'APROVADA' };
    const aprovadoBanco = { id: 2, status_arte: 'APROVADA_CLIENTE' };

    // Quem NAO destrava: o modelo aprovado fica de fora, e a recusa diz a quem pedir.
    const p = A.planoDaAcaoEmLote([aprovadoTela, aprovadoBanco], 'REPROVADA', ctxPorMarcacao(false));
    ok(p.aplicar.length === 0 && p.pulados.length === 2, 'REPROVADA sem podeDestravar: aprovados ficam de fora', p);
    ok(p.pulados[0].motivo === MOTIVO && p.pulados[1].motivo === MOTIVO,
        'com o motivo que diz a quem pedir', p.pulados);

    // Quem destrava: o aprovado ENTRA -- e o "Em Alteracao" do card, que e a
    // unica saida de um modelo aprovado.
    const q = A.planoDaAcaoEmLote([aprovadoTela, aprovadoBanco], 'REPROVADA', ctxPorMarcacao(true));
    ok(q.aplicar.length === 2 && q.pulados.length === 0, 'REPROVADA com podeDestravar: aprovados entram', q);
})();

(function alterarDeixaEntrarOResto() {
    const itens = [
        { id: 1, amostra_status: 'PRONTO' },
        { id: 2, amostra_status: 'PENDENTE' },
        { id: 3, amostra_status: 'PRONTO', _div: 'div' },  // a divergencia e trava do PRONTO, nao daqui
    ];
    const p = A.planoDaAcaoEmLote(itens, 'REPROVADA', ctxPorMarcacao(false));
    ok(p.aplicar.length === 3 && p.pulados.length === 0, 'REPROVADA: pronto e pendente entram', p);
})();

// ─── 3. O texto do plano ─────────────────────────────────────────────────────

(function oTextoDizQuantosEntramDeQuantos() {
    const itens = [
        { id: 1, nome_produto_real: 'Credencial VIP', amostra_status: 'PENDENTE', _banco: 'banco incompleto: falta o CSV' },
        { id: 2, produto: 'Ingresso Pista', amostra_status: 'PRONTO' },
        { id: 3, amostra_status: 'PENDENTE' },
        { id: 4, amostra_status: 'PENDENTE' },
        { id: 5, amostra_status: 'REPROVADA' },
    ];
    const plano = A.planoDaAcaoEmLote(itens, 'PRONTO', ctxPorMarcacao(false));
    const t = A.textoDoPlanoEmLote(plano, itens.length);
    ok(typeof t === 'string', 'o texto e uma string', t);
    ok(t.indexOf('Marcar PRONTO em 3 de 5 modelos do pedido.') === 0, 'comeca com "Marcar PRONTO em 3 de 5 modelos do pedido."', t);
    ok(t.indexOf('\n\nFicam de fora:\n• Credencial VIP — banco incompleto: falta o CSV') > 0,
        'lista quem fica de fora, com nome e motivo', t);
    ok(t.indexOf('\n• Ingresso Pista — já está pronto') > 0, 'um por linha, com bullet', t);
    ok(t.indexOf('Credencial VIP') < t.indexOf('Ingresso Pista'), 'na ordem do pedido', t);
})();

(function oTextoUsaORotuloDeCadaAcao() {
    const itens = [{ id: 1, amostra_status: 'PRONTO' }, { id: 2, amostra_status: 'PENDENTE' }];
    const tAlt = A.textoDoPlanoEmLote(A.planoDaAcaoEmLote(itens, 'REPROVADA', SEM_TRAVAS), 2);
    ok(tAlt.indexOf('Colocar em Alteração em 2 de 2 modelos do pedido.') === 0, 'o rotulo da REPROVADA', tAlt);
    const tApr = A.textoDoPlanoEmLote(A.planoDaAcaoEmLote(itens, 'APROVADA', SEM_TRAVAS), 2);
    ok(tApr.indexOf('Aprovar em 2 de 2 modelos do pedido.') === 0, 'o rotulo da APROVADA', tApr);
})();

(function noSingularEModelo() {
    const plano = A.planoDaAcaoEmLote([{ id: 1, amostra_status: 'PENDENTE' }], 'PRONTO', SEM_TRAVAS);
    const t = A.textoDoPlanoEmLote(plano, 1);
    ok(t.indexOf('Marcar PRONTO em 1 de 1 modelo do pedido.') === 0, '"1 de 1 modelo", no singular', t);
})();

(function semPuladosNaoHaListaDeFora() {
    const itens = [{ id: 1, amostra_status: 'PENDENTE' }, { id: 2, amostra_status: 'PENDENTE' }];
    const t = A.textoDoPlanoEmLote(A.planoDaAcaoEmLote(itens, 'PRONTO', SEM_TRAVAS), 2);
    ok(t.indexOf('Ficam de fora') < 0, 'sem pulados, sem "Ficam de fora"', t);
    ok(t === 'Marcar PRONTO em 2 de 2 modelos do pedido.', 'e o texto e so a primeira linha', t);
})();

(function semNinguemParaAplicarOTextoDizIsso() {
    const itens = [
        { id: 1, produto: 'Credencial', amostra_status: 'APROVADA' },
        { id: 2, produto: 'Pulseira', status_arte: 'APROVADA_CLIENTE' },
    ];
    const t = A.textoDoPlanoEmLote(A.planoDaAcaoEmLote(itens, 'APROVADA', SEM_TRAVAS), 2);
    ok(t.indexOf('Nenhum modelo para Aprovar.') === 0, 'comeca com "Nenhum modelo para Aprovar."', t);
    ok(t.indexOf('\n\nFicam de fora:\n• Credencial — já está aprovado\n• Pulseira — já está aprovado') > 0,
        'e ainda lista quem ficou de fora', t);

    // Com a lista vazia (nenhum item no pedido) nao ha "Ficam de fora".
    const vazio = A.textoDoPlanoEmLote(A.planoDaAcaoEmLote([], 'PRONTO', SEM_TRAVAS), 0);
    ok(vazio.indexOf('Nenhum modelo para Marcar PRONTO.') === 0, 'pedido sem modelos: "Nenhum modelo para Marcar PRONTO."', vazio);
    ok(vazio.indexOf('Ficam de fora') < 0, 'e sem lista', vazio);
})();

// ─── 4. O nome do modelo na lista ────────────────────────────────────────────

(function oNomePrefereORealDepoisOProdutoDepoisOId() {
    ok(A.nomeDoModeloParaLista({ id: 1, nome_produto_real: 'Credencial VIP', produto: 'CREDENCIAL' }) === 'Credencial VIP',
        'prefere nome_produto_real');
    ok(A.nomeDoModeloParaLista({ id: 2, produto: 'Ingresso Pista' }) === 'Ingresso Pista',
        'sem o real, usa produto');
    ok(A.nomeDoModeloParaLista({ id: 2, nome_produto_real: '', produto: 'Ingresso Pista' }) === 'Ingresso Pista',
        'nome real vazio nao conta');
    ok(A.nomeDoModeloParaLista({ id: 77 }) === 'Modelo 77', 'sem nome nenhum, "Modelo <id>"');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' caso(s) falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' casos das acoes em lote.');
