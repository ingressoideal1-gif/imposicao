// A caixa "Dados de Entrega e Faturamento" do painel mostra o que o CLIENTE
// pediu -- e nada mais.
//
// Pedido 20928, 19/08/2026: o painel exibia, sob o titulo "Solicitacao de
// Alteracao enviada pelo Cliente", a frase "Registrada nova cobranca PIX,
// valor: R$ 250,00". O cliente nao tinha pedido nada. Aquela frase foi escrita
// pelo Financeiro do sistema PARCEIRO, no chat dele.
//
// A causa: quando nao achava o texto na nossa tabela, o painel ia ler
// `propostas_chat` -- tabela do parceiro -- e escolhia uma mensagem com um
// filtro que terminava em `|| m.length > 5`, ou seja, aceitava qualquer coisa.
//
// O caminho foi removido, e nao consertado, porque ele nunca teve como
// funcionar: TODAS as nossas gravacoes naquele chat mandam a coluna
// `remetente_nome`, que nao existe ali (a coluna e `autor_nome`). O PostgREST
// recusa a linha inteira e o erro cai num catch vazio. Conferido no banco: zero
// mensagens nossas, de tres buscas diferentes. O que aquele trecho lia era,
// sempre e so, dado do parceiro.
//
// Roda em node: `node tests/dados_de_entrega_harness.js`.

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

const i = SCRIPT.indexOf('async function loadDadosEntregaInterno');
if (i < 0) throw new Error('nao achei o loadDadosEntregaInterno no script.js');
const FUNCAO = SCRIPT.slice(i, SCRIPT.indexOf('\n}', i));

// ─── O texto vem so da nossa tabela ──────────────────────────────────────────

(function aSolicitacaoSaiDaNossaTabela() {
    ok(/from\('pedidos_artes'\)/.test(FUNCAO), 'le pedidos_artes, que e tabela nossa');
    ok(/obs\.correcao_entrega_faturamento/.test(FUNCAO),
        'e o texto e a chave que a tela do cliente grava');
})();

(function aCaixaNaoLeMaisOChatDoParceiro() {
    // A regressao que este teste guarda tem cara de melhoria: alguem sem o
    // contexto le "se nao achou o texto, procura no chat" e acha razoavel.
    ok(!/from\('propostas_chat'\)/.test(FUNCAO),
        'a caixa de entrega nao consulta o chat do parceiro');
    ok(!/m\.length > 5/.test(SCRIPT),
        'e o filtro que aceitava qualquer mensagem sumiu do arquivo');
})();

// ─── A frase generica so aparece quando ha correcao pendente ────────────────

(function semPedidoDoClienteACaixaNaoInventaUm() {
    // Ela aparecia SEMPRE que faltava o texto. Num pedido em que o cliente nao
    // pediu nada -- `entrega_dados` vazio, que e o caso comum -- a tela dizia
    // ao atendente que ele tinha pedido revisao.
    ok(/temCorrecaoPendente/.test(FUNCAO), 'a frase generica depende do status');
    ok(/statusEntrega === 'CORRIGIR' \|\| statusEntrega === 'ALTERADO'/.test(FUNCAO),
        'e o status que a libera e CORRIGIR ou ALTERADO');
    const bloco = FUNCAO.slice(FUNCAO.indexOf('temCorrecaoPendente ?'));
    ok(/: ''/.test(bloco.slice(0, 900)), 'sem correcao pendente, a caixa fica vazia');
})();

// ─── Onde o pedido do cliente e gravado ──────────────────────────────────────

(function aSolicitacaoDoClienteEGravadaNaNossaTabela() {
    const j = SCRIPT.indexOf("obsObj['correcao_entrega_faturamento']");
    ok(j > 0, 'a solicitacao do cliente e guardada na chave propria');
    const trecho = SCRIPT.slice(j, j + 900);
    ok(/from\('pedidos_artes'\)/.test(trecho), 'em pedidos_artes');
    ok(/entrega_dados: 'CORRIGIR'/.test(trecho), 'junto com o status CORRIGIR');
})();

// ─── Fim ─────────────────────────────────────────────────────────────────────

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' verificacoes falharam.');
    process.exit(1);
}
console.log('OK: ' + total + ' verificacoes passaram.');
