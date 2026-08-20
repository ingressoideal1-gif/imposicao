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

const estadoDoPagamento = new Function(
    recortar(PAGAMENTO, 'estadoDoPagamento') + '\nreturn estadoDoPagamento;')();

const mostraStatusDePagamento = new Function(
    recortar(PAGAMENTO, 'estadoDoPagamento') + '\n'
    + recortar(PAGAMENTO, 'mostraStatusDePagamento') + '\nreturn mostraStatusDePagamento;')();

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

// ─── 4. O link de pagamento ──────────────────────────────────────────────────

(function comLinkALiberacaoAcontece() {
    ok(estadoDoPagamento({ link_pagamento: 'https://pag.com/x' }) === 'liberado', 'com link');
})();

(function semLinkNaoNasceBotaoMorto() {
    // Medido em 20/08/2026: `link_pagamento` esta vazio nas 23 linhas de
    // `propostas_os`. O parceiro vai preencher; ate la, a aba diz o que fazer.
    ok(estadoDoPagamento({ link_pagamento: '' }) === 'aguardando', 'link vazio');
    ok(estadoDoPagamento({ link_pagamento: null }) === 'aguardando', 'link nulo');
    ok(estadoDoPagamento({ link_pagamento: '   ' }) === 'aguardando', 'so espaco');
    ok(estadoDoPagamento(null) === 'aguardando', 'pedido sem linha de OS');
})();

(function soLinkDeVerdadeAbre() {
    // O campo e texto livre no ERP do parceiro: um "combinar com o vendedor"
    // digitado ali nao pode virar um botao que leva a lugar nenhum.
    ok(estadoDoPagamento({ link_pagamento: 'combinar com o vendedor' }) === 'aguardando',
        'texto que nao e endereco nao vira botao');
    ok(estadoDoPagamento({ link_pagamento: 'http://pag.com/x' }) === 'liberado', 'http tambem serve');
})();

(function statusPadraoDoParceiroNaoViraAnuncio() {
    // `status_pagamento` vale APROVADO nas 23 linhas -- e valor padrao, e nao
    // estado real. Anunciar "pagamento aprovado" para todo mundo seria mentira
    // na tela do cliente.
    ok(mostraStatusDePagamento({ status_pagamento: 'APROVADO', link_pagamento: '' }) === false,
        'sem link, o status nao aparece');
    ok(mostraStatusDePagamento(null) === false, 'sem linha de OS, nada');
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
        'e sem link a aba diz o que fazer -- nenhuma trava fica sem saida');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias do orcamento e do pagamento.');
