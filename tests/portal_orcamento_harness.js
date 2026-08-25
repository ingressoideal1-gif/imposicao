// O Orcamento e o Pagamento do Portal do Pedido.
//
// ## De onde vem o orcamento
//
// De `propostas.texto_whatsapp` -- o MESMO resumo que o cliente ja recebeu pelo
// WhatsApp quando fechou o pedido, e que o usuario apontou como o formato certo
// em 20/08/2026. Preenchido em 1.436 dos 1.489 pedidos dos ultimos 30 dias
// (96%). Remonta-lo a partir dos itens daria uma segunda versao do mesmo
// numero, e duas versoes do mesmo preco na frente do cliente e a pior coisa que
// uma pagina de grafica pode fazer.
//
// Nos 4% sem texto, a aba monta a lista a partir de `produtos_proposta`.
//
// ## O que o negrito do WhatsApp exige
//
// O texto vem do banco do PARCEIRO e vai para dentro de `innerHTML`. Ele e
// escapado ANTES de qualquer coisa, e so depois o `*assim*` vira `<b>`. Na
// ordem inversa, uma tag escrita dentro do orcamento chegaria viva ao DOM.
//
// Roda em node: `node tests/portal_orcamento_harness.js`.

const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const ORCAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-orcamento.js'), 'utf8');
const PAGAMENTO = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-pagamento.js'), 'utf8');
const DADOS = fs.readFileSync(path.join(RAIZ, 'frontend', 'cliente-dados.js'), 'utf8');

let total = 0, falhas = 0;
function ok(cond, oque, detalhe) {
    total++;
    if (cond) return;
    falhas++;
    console.error('FALHOU: ' + oque + (detalhe !== undefined ? '\n         ' + JSON.stringify(detalhe) : ''));
}

function recortar(fonte, nome) {
    const i = fonte.indexOf('\nfunction ' + nome + '(');
    if (i < 0) throw new Error('nao achei a funcao ' + nome);
    return fonte.slice(i, fonte.indexOf('\n}', i) + 2);
}

function extrairTabela(fonte, nome) {
    const i = fonte.indexOf('\nconst ' + nome + ' = ');
    if (i < 0) throw new Error('nao achei a tabela ' + nome);
    let p = 0;
    for (let j = fonte.indexOf('=', i); j < fonte.length; j++) {
        const c = fonte[j];
        if (c === '[' || c === '{') p++;
        else if (c === ']' || c === '}') p--;
        else if (c === ';' && p === 0) return fonte.slice(i, j + 1);
    }
    throw new Error('nao achei o fim da tabela ' + nome);
}

// O `escapeHtml` de verdade mora no `cliente.js`, junto do motor de desenho.
const ESCAPA = 'function escapeHtml(valor) {'
    + ' if (valor === null || valor === undefined) return "";'
    + ' return String(valor).replace(/&/g, "&amp;").replace(/</g, "&lt;")'
    + '.replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/\'/g, "&#39;"); }';

const negritoDoWhatsapp = new Function(
    ESCAPA + '\n' + recortar(ORCAMENTO, 'negritoDoWhatsapp') + '\nreturn negritoDoWhatsapp;')();

const resumoLimpo = new Function(
    extrairTabela(ORCAMENTO, 'FRASES_DE_CONVERSA') + '\n'
    + recortar(ORCAMENTO, 'resumoLimpo') + '\nreturn resumoLimpo;')();

const linhasDoOrcamento = new Function(
    extrairTabela(DADOS, 'NOME_DO_FRETE') + '\n'
    + recortar(DADOS, 'emReal') + '\n'
    + recortar(DADOS, 'rotuloDoFrete') + '\n'
    + recortar(ORCAMENTO, 'linhasDoOrcamento') + '\nreturn linhasDoOrcamento;')();

// A regra de "pago" nao mora mais no `cliente-pagamento.js`: desde 25/08/2026
// ela esta em `pagamento-do-pedido.js`, compartilhada com a coluna Pagamento da
// Lista de Arte. O `statusDoPagamento` conta por ela, entao o harness precisa
// injeta-la -- do arquivo de verdade, e nao de uma copia escrita aqui, senao a
// copia e que passaria a ser testada.
const REGRA_DE_PAGO = require(path.join(RAIZ, 'frontend', 'pagamento-do-pedido.js'));

function doPagamento(nome, dependencias) {
    const corpo = (dependencias || []).map(d => (d === d.toUpperCase()
        ? extrairTabela(PAGAMENTO, d)
        : recortar(PAGAMENTO, d))).join('\n');
    return new Function('contarCobrancas',
        corpo + '\n' + recortar(PAGAMENTO, nome) + '\nreturn ' + nome + ';')(
        REGRA_DE_PAGO.contarCobrancas);
}

const rotuloDaForma = doPagamento('rotuloDaForma', ['NOME_DA_FORMA']);
const rotuloDoStatus = doPagamento('rotuloDoStatus', ['NOME_DO_STATUS']);
const statusDoPagamento = doPagamento('statusDoPagamento');
const podePagar = doPagamento('podePagar');

// ─── 1. O negrito do WhatsApp ────────────────────────────────────────────────

(function oAsteriscoViraNegrito() {
    ok(negritoDoWhatsapp('*150* Pulseira') === '<b>150</b> Pulseira', 'negrito simples',
        negritoDoWhatsapp('*150* Pulseira'));
    ok(negritoDoWhatsapp('*R$ 71,50*') === '<b>R$ 71,50</b>', 'valor em negrito');
    ok(negritoDoWhatsapp('Frete via *Retirada Local: Gratis*')
        === 'Frete via <b>Retirada Local: Gratis</b>', 'negrito no fim da linha');
})();

(function oQueNaoEhNegritoFicaComoEsta() {
    ok(negritoDoWhatsapp('R$ 71,50') === 'R$ 71,50', 'texto simples passa inteiro');
    ok(negritoDoWhatsapp('2 * 3 = 6') === '2 * 3 = 6',
        'asterisco solto nao vira tag', negritoDoWhatsapp('2 * 3 = 6'));
    ok(negritoDoWhatsapp('') === '', 'vazio');
    ok(negritoDoWhatsapp(null) === '', 'nulo nao quebra');
})();

(function tagVindaDoBancoNaoViraTag() {
    // O texto vem do banco do PARCEIRO. Escapar DEPOIS de trocar o negrito
    // transformaria o proprio `<b>` em `&lt;b&gt;`; escapar ANTES, que e o que
    // se faz aqui, deixa o negrito passar e a tag do banco morrer.
    const bruto = negritoDoWhatsapp('<script>alert(1)</script>');
    ok(bruto.indexOf('<script') < 0, 'a tag do banco nao chega viva ao DOM', bruto);
    ok(bruto.indexOf('&lt;script&gt;') >= 0, 'ela aparece como texto', bruto);

    const misto = negritoDoWhatsapp('*<img src=x onerror=alert(1)>*');
    ok(misto.indexOf('<img') < 0, 'nem dentro do negrito', misto);
    ok(misto.indexOf('<b>') === 0, 'e o negrito continua funcionando', misto);
})();

// ─── 2. O resumo sem a conversa ──────────────────────────────────────────────

(function saudacaoEFraseDeVendaSaem() {
    // "Se estiver tudo certo, me confirma por aqui" faz sentido numa mensagem
    // de WhatsApp. Numa pagina em que o cliente JA esta, ela manda ele responder
    // num lugar que nao existe ali.
    const texto = 'Olá, 😀\n\nOrçamento para:\n*Ricardo*\n\n📄 Proposta *20927*\n\n'
        + '*Produtos Orçados:*\n\n✅ *150* Pulseira: *R$ 71,50* (1 dia útil)\n\n'
        + 'O valor total do pedido ficou em *R$ 71,50*\n\n'
        + 'Se estiver tudo certo, me confirma por aqui que já dou andamento ao processo!';
    const limpo = resumoLimpo(texto);
    ok(limpo.indexOf('me confirma por aqui') < 0, 'a frase de venda sai', limpo);
    ok(limpo.indexOf('Olá') < 0, 'a saudacao sai', limpo);
    ok(limpo.indexOf('Pulseira') > 0, 'mas o produto fica', limpo);
    ok(limpo.indexOf('R$ 71,50') > 0, 'e o valor tambem', limpo);
})();

(function textoSemAsFrasesConhecidasPassaInteiro() {
    const t = 'Produto X: R$ 10,00';
    ok(resumoLimpo(t) === t, 'nada a cortar', resumoLimpo(t));
    ok(resumoLimpo('') === '', 'vazio');
    ok(resumoLimpo(null) === '', 'nulo');
})();

// ─── 3. O orcamento montado a mao (os 4% sem texto) ─────────────────────────

(function montaPelosItensQuandoNaoHaResumo() {
    const r = linhasDoOrcamento(
        [{ nome_produto: 'Pulseira ColorBand', modelo_descri: 'colorida', qtd: 450,
           valor_unt: 0.21, fixo: 40, valor_sub_total: 134.5, prazo: '1 dia útil' }],
        { valor_frete: '20.12', frete_escolhido: 'SEDEX', valor_total: 154.62 }
    );
    ok(r.itens.length === 1, 'um item', r.itens.length);
    ok(r.itens[0].texto.indexOf('450') >= 0, 'a quantidade aparece', r.itens[0]);
    ok(r.itens[0].texto.indexOf('Pulseira ColorBand') >= 0, 'o produto aparece', r.itens[0]);
    ok(r.itens[0].valor === 'R$ 134,50', 'com o subtotal do item', r.itens[0]);
    ok(r.frete === 'SEDEX — R$ 20,12', 'o frete vem do mesmo rotulo da aba de entrega', r.frete);
    ok(r.total === 'R$ 154,62', 'e o total vem do pedido', r.total);
})();

(function pedidoSemItemNaoQuebra() {
    const r = linhasDoOrcamento([], { valor_total: null });
    ok(r.itens.length === 0, 'lista vazia');
    ok(r.total === '--', 'sem valor, "--" e nao "R$ 0,00"', r.total);
})();

// A cotacao escolhida tem de CHEGAR ate aqui.
//
// Ate 25/08/2026 esta funcao chamava `rotuloDoFrete(pedido)` com um argumento
// so. O segundo cobre os nomes que `propostas.frete_escolhido` nao tem --
// "Frete Incluso", "Transportadora Parceira", "Retirada Local" --, e sem ele um
// pedido cujo frete so existe na cotacao saia como "A combinar" para o cliente,
// com a transportadora ja escolhida.
(function oFreteVemDaCotacaoQuandoOPedidoNaoOTem() {
    const r = linhasDoOrcamento(
        [{ nome_produto: 'Credencial PVC', qtd: 88, valor_sub_total: 477.16 }],
        { valor_total: 477.16, frete_escolhido: null, valor_frete: '18.00' },
        { servico: 'Transportadora Parceira', prazo: '2 dias úteis' }
    );
    ok(r.frete === 'Transportadora Parceira — R$ 18,00',
        'sem `frete_escolhido`, o nome vem da cotacao', r.frete);
})();

(function semCotacaoNenhumaContinuaACombinar() {
    const r = linhasDoOrcamento([], { valor_total: 10 }, null);
    ok(r.frete === 'A combinar', 'nada escolhido continua "A combinar"', r.frete);
})();

// ─── 4. O pagamento ──────────────────────────────────────────────────────────
//
// O link mora em `pagamentos_v2.url_cobranca` e a forma em `tipo_cobranca` --
// achados no banco em 20/08/2026, a partir do pedido 20927, cujo link e
// `https://pay.ai-ideal.com.br/i/a21f550f`. O `propostas_os.link_pagamento` que
// a v656 lia esta vazio nas 23 linhas daquela tabela: nunca foi por ali.
//
// Um pedido pode ter MAIS DE UMA cobranca: 3.367 pedidos dos ultimos 90 dias
// tem uma, mas 190 tem duas ou mais (entrada mais parcelas).

(function aFormaDeCobrancaViraPalavraDeGente() {
    ok(rotuloDaForma('PIX') === 'PIX', 'PIX ja e como se fala');
    ok(rotuloDaForma('BOLETO') === 'Boleto', 'boleto nao grita');
    ok(rotuloDaForma('CARD_PARCELADO') === 'Cartão parcelado', 'o nome de banco de dados vira portugues');
    ok(rotuloDaForma('E-FATURADO') === 'Faturado', 'e-faturado');
    ok(rotuloDaForma('E-Faturado') === 'Faturado', 'a mesma coisa com outra caixa');
    ok(rotuloDaForma('E-CREDITO') === 'Crédito', 'e-credito');
    ok(rotuloDaForma('QUALQUER_COISA_NOVA') === 'QUALQUER_COISA_NOVA',
        'forma nova passa como esta, em vez de sumir');
    ok(rotuloDaForma(null) === 'A combinar', 'sem forma');
})();

(function oStatusDaCobrancaEmPortugues() {
    ok(rotuloDoStatus('PAID').texto === 'Pago', 'pago');
    ok(rotuloDoStatus('A_RECEBER').texto === 'Aguardando pagamento', 'a receber');
    ok(rotuloDoStatus('A_VENCER').texto === 'A vencer', 'a vencer');
    ok(rotuloDoStatus('paid').texto === 'Pago', 'a caixa nao importa');
    ok(rotuloDoStatus('ESTORNADO').texto === 'ESTORNADO', 'status novo passa como esta');
    ok(typeof rotuloDoStatus('PAID').cor === 'string', 'e todo status tem cor');
})();

// ─── 4b. O status do PEDIDO, que e o que vai em destaque ────────────────────

(function tudoPagoEPago() {
    const s = statusDoPagamento([{ status: 'PAID' }, { status: 'PAID' }]);
    ok(s.chave === 'pago', 'as duas cobrancas pagas', s);
    ok(/pago/i.test(s.texto), 'e o texto diz isso', s);
})();

(function umaSoPagaEParcial() {
    // 190 pedidos tem duas cobrancas ou mais. Dizer "pago" com uma delas em
    // aberto mandaria o cliente embora devendo.
    const s = statusDoPagamento([{ status: 'PAID' }, { status: 'A_RECEBER' }]);
    ok(s.chave === 'parcial', 'uma paga e outra nao', s);
})();

(function nenhumaPagaEAguardando() {
    ok(statusDoPagamento([{ status: 'A_RECEBER' }]).chave === 'aberto', 'a receber');
    ok(statusDoPagamento([{ status: 'A_VENCER' }]).chave === 'aberto', 'a vencer');
})();

(function semCobrancaNaoDizNadaSobrePagamento() {
    // O pedido 20974 esta assim: existe, tem valor, e ainda nao tem cobranca.
    ok(statusDoPagamento([]).chave === 'sem_cobranca', 'lista vazia', statusDoPagamento([]));
    ok(statusDoPagamento(null).chave === 'sem_cobranca', 'nulo nao quebra');
    ok(!/pago/i.test(statusDoPagamento([]).texto),
        'e nao diz "pago" para quem nao pagou', statusDoPagamento([]));
})();

// ─── 4c. Que cobranca vira botao ────────────────────────────────────────────

(function soLinkDeVerdadeAbre() {
    // O campo e texto livre no ERP: um "combinar com o vendedor" digitado ali
    // nao pode virar um botao que leva a lugar nenhum.
    ok(podePagar({ status: 'A_RECEBER', link: 'https://pay.ai-ideal.com.br/i/a21f550f' }) === true,
        'cobranca aberta com link');
    ok(podePagar({ status: 'A_RECEBER', link: 'combinar com o vendedor' }) === false,
        'texto que nao e endereco');
    ok(podePagar({ status: 'A_RECEBER', link: null }) === false, 'sem link');
    ok(podePagar({ status: 'A_RECEBER', link: '' }) === false, 'link vazio');
})();

(function cobrancaPagaNaoGanhaBotao() {
    // Botao "Pagar agora" embaixo de uma cobranca ja paga e o convite para o
    // cliente pagar duas vezes.
    ok(podePagar({ status: 'PAID', link: 'https://pay.ai-ideal.com.br/i/x' }) === false,
        'cobranca paga');
    ok(podePagar(null) === false, 'nada nao quebra');
})();

// ─── 5. Na fonte: o orcamento nao decide nada ───────────────────────────────

(function aAbaDoOrcamentoESoLeitura() {
    // O orcamento ja foi fechado no ERP antes de a arte existir. Decidido com o
    // usuario em 20/08/2026: aqui e so consulta.
    ok(!/decidirDados|gravarCorrecao|\.update\(|\.insert\(/.test(ORCAMENTO),
        'a aba do orcamento nao grava nada');
    ok(/texto_whatsapp/.test(ORCAMENTO), 'e le o resumo que o cliente ja recebeu');
})();

(function oPagamentoAbreEmOutraAba() {
    ok(/rel="noopener noreferrer"/.test(PAGAMENTO),
        'o link do parceiro abre com noopener: o destino e site de terceiro');
    ok(/atendimento/i.test(PAGAMENTO),
        'e sem cobranca a aba diz o que fazer -- nenhuma trava fica sem saida');
})();

(function oStatusVaiEmDestaque() {
    // Pedido do usuario em 20/08/2026: o status do pagamento em destaque.
    const desenha = recortar(PAGAMENTO, 'desenharSecaoPagamento');
    ok(/portal-total/.test(desenha) || /portal-destaque/.test(desenha),
        'o status usa a caixa de destaque, e nao uma linha qualquer');
    ok(desenha.indexOf('statusDoPagamento') > 0, 'e vem do status calculado das cobrancas');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias do orcamento e do pagamento.');
