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
// ## Por que o resumo agora e LIDO, e nao so exibido
//
// Desde 04/09/2026 o usuario pediu o orcamento em forma de tabela --
// Quantidade, Produto, Valor, e embaixo o frete, o prazo e o TOTAL. A fonte nao
// mudou: `orcamentoEstruturado` recorta esses pedacos do MESMO texto, sem
// recalcular nada. O que vai para a tela sao os caracteres que o ERP escreveu.
//
// O ERP escreve em dois modelos de mensagem, e os dois sao reconhecidos:
//
//   MODELO A   ✅ *100* Cartao PVC: *R$ 220,50* (3 dias uteis)
//   MODELO B   • 400 un — Credencial PVC — R$ 2.260,00
//
// A ultima conferencia do leitor e aritmetica: a soma dos itens mais o frete
// tem de dar o total que o ERP escreveu. Medido nos 2.500 resumos mais recentes
// em 04/09/2026, 2.479 fecham (99%); os 21 que nao fecham sao pedidos em que o
// ERP cotou o SEDEX mas nao o somou ao total -- e ali a aba volta ao paragrafo
// corrido, que e o que ela mostrava antes.
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

// O leitor do resumo. `diasDoPrazo` e `emDiasUteis` vem do `cliente-dados.js`
// porque a regra do prazo e a MESMA da aba de Entrega: o maior dos itens.
const orcamentoEstruturado = new Function(
    recortar(DADOS, 'diasDoPrazo') + '\n'
    + recortar(DADOS, 'emDiasUteis') + '\n'
    + recortar(ORCAMENTO, 'reaisEmNumero') + '\n'
    + recortar(ORCAMENTO, 'quantidadeEmTexto') + '\n'
    + recortar(ORCAMENTO, 'nomeDoProduto') + '\n'
    + recortar(ORCAMENTO, 'maiorPrazo') + '\n'
    + recortar(ORCAMENTO, 'orcamentoEstruturado') + '\nreturn orcamentoEstruturado;')();

const tabelaDoOrcamento = new Function(
    ESCAPA + '\n'
    + recortar(ORCAMENTO, 'linhaDoFecho') + '\n'
    + recortar(ORCAMENTO, 'tabelaDoOrcamento') + '\nreturn tabelaDoOrcamento;')();

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

// ─── 2b. O resumo lido como tabela ──────────────────────────────────────────
//
// Os textos daqui sao COPIAS do banco, com o espaco nao-separavel (U+00A0) que
// o ERP poe entre o "R$" e o numero. Ele e o detalhe que derruba um leitor
// escrito no olho: parece um espaco comum e nao e.

const NB = String.fromCharCode(0xa0);   // o espaco nao-separavel do ERP

function resumoModeloA(itens, frete, total) {
    return 'Olá, 😀\n\nOrçamento para:\n*Alexandre Machado De Macedo*\n\n'
        + '📄 Proposta *21708*\n\n*Segue orçamento para os itens solicitados.*\n\n'
        + '*Produtos Orçados:*\n\n' + itens.join('\n') + '\n\n'
        + (frete ? frete + '\n\n' : '')
        + 'O valor total do pedido ficou em *R$' + NB + total + '*\n\n'
        + 'Se estiver tudo certo, me confirma por aqui que já dou andamento ao processo!';
}

(function oModeloAViraTabela() {
    // Pedido 21708, copiado do banco.
    const r = orcamentoEstruturado(resumoModeloA([
        '✅ *15* Cordão com presilha Jacaré.: *R$' + NB + '54,45* (3 dias úteis)',
        '✅ *15* Credencial PVC: *R$' + NB + '93,60* (3 dias úteis)'
    ], 'Frete via *Retirada Local: Grátis*', '148,05'));

    ok(r !== null, 'o modelo A e reconhecido');
    ok(r.itens.length === 2, 'os dois itens', r && r.itens);
    ok(r.itens[0].qtd === '15 un.', 'a quantidade sai como o usuario pediu', r.itens[0]);
    ok(r.itens[0].produto === 'Cordão com presilha Jacaré',
        'e o ponto final do cadastro do ERP nao vai para a tabela', r.itens[0]);
    ok(r.itens[1].valor.indexOf('93,60') > 0, 'o valor e o do texto', r.itens[1]);
    ok(r.frete.rotulo === 'Retirada Local' && r.frete.valor === 'Grátis',
        'o frete sai separado em nome e valor', r.frete);
    ok(r.prazo === '3 dias úteis', 'o prazo vem do parenteses do item', r.prazo);
    ok(r.total.indexOf('148,05') > 0, 'e o total e o que o ERP escreveu', r.total);
})();

(function oValorMostradoEhOCaractereDoErpENaoUmaConta() {
    // A tabela nao recalcula nada: se ela reconvertesse os numeros, um centavo
    // de arredondamento apareceria na frente do cliente como outro preco.
    //
    // O unico caractere que muda e o espaco nao-separavel, que vira espaco
    // comum na entrada do leitor -- e o que separa "R$" do numero nao quebra
    // linha de qualquer jeito, porque a coluna de valor e `nowrap`.
    const r = orcamentoEstruturado(resumoModeloA(
        ['✅ *1.500* Ingresso MOBI: *R$' + NB + '346,50* (1 dia útil)'],
        'Frete via *Retirada Local: Grátis*', '346,50'));
    ok(r.itens[0].valor === 'R$ 346,50',
        'os digitos sao os mesmos do resumo', r.itens[0].valor);
    ok(r.itens[0].valor.indexOf(NB) < 0,
        'e o espaco nao-separavel foi normalizado', r.itens[0].valor);
    ok(r.itens[0].qtd === '1.500 un.', 'inclusive o ponto de milhar da quantidade', r.itens[0]);
})();

(function oOrcamentoAvulsoNaoInventaQuantidade() {
    // 1.911 das linhas de item medidas em 04/09/2026 sao assim: sem quantidade,
    // so o nome e o valor. Escrever "Orçamento Avulso un." seria inventar.
    const r = orcamentoEstruturado(resumoModeloA(
        ['✅ *Orçamento Avulso*: *R$' + NB + '87,20*'],
        'Frete via *Frete Incluso: R$' + NB + '0,00*', '87,20'));
    ok(r !== null, 'reconhecido', r);
    ok(r.itens[0].qtd === '', 'sem quantidade', r.itens[0]);
    ok(r.itens[0].produto === 'Orçamento Avulso', 'o nome esta no lugar do nome', r.itens[0]);
    ok(r.prazo === null, 'e sem prazo nenhum a linha do prazo nao aparece', r.prazo);
})();

(function oModeloBTambemEhLido() {
    // Pedido 18141, copiado do banco: outro modelo de mensagem do ERP.
    const r = orcamentoEstruturado(
        'Olá FLY ENTRETENIMENTO LTDA - 61368 😀\nSegue abaixo o orçamento nº 18141 📄\n\n'
        + '🛍️ *Itens do pedido:*\n'
        + '• 4000 un — Tag Chip  RFID / NFC — R$ 6.640,00\n'
        + '• 10000 un — Pulseira Bracelete — R$ 2.740,00\n'
        + '• 4000 un — Pulseira TexBand — R$ 2.940,00\n\n'
        + '📦 *Subtotal dos produtos:* R$ 12.320,00\n\n'
        + '🚚 *Frete SEDEX:* R$ 466,22\n\n'
        + '💰 *Valor total do pedido:* R$ 12.786,22\n\n'
        + 'Fico à disposição para ajustar quantidades, modelos ou prazos 😊');

    ok(r !== null, 'o modelo B e reconhecido', r);
    ok(r.itens.length === 3, 'os tres itens', r && r.itens.length);
    ok(r.itens[0].qtd === '4.000 un.' || r.itens[0].qtd === '4000 un.',
        'o "400 un" do ERP vira a mesma coluna do modelo A', r.itens[0]);
    ok(r.itens[0].produto === 'Tag Chip  RFID / NFC', 'o nome inteiro', r.itens[0]);
    ok(r.frete.rotulo === 'Frete SEDEX' && r.frete.valor === 'R$ 466,22',
        'o frete do modelo B', r.frete);
    ok(r.total === 'R$ 12.786,22', 'e o total', r.total);
})();

(function aTabelaTemDeFecharComOTotal() {
    // Pedido 21685, do banco: o ERP cotou o SEDEX mas NAO o somou ao total.
    // 150,00 + 79,17 nao da 150,00 -- e uma tabela que nao fecha na frente do
    // cliente e pior do que o paragrafo corrido que a aba mostrava antes.
    const r = orcamentoEstruturado(resumoModeloA(
        ['✅ *2* Dseg - Jet Band: *R$' + NB + '150,00* (1 dia util)'],
        'Frete via *Correios SEDEX: R$' + NB + '79,17*', '150,00'));
    ok(r === null, 'nao fechou, entao nao vira tabela', r);
})();

(function oFreteGratisValeZeroENaoDerrubaAConta() {
    const r = orcamentoEstruturado(resumoModeloA(
        ['✅ *100* Cartão/Crachá PVC 0,76mm: *R$' + NB + '220,50* (3 dias úteis)'],
        'Frete via *Retirada Local: Grátis*', '220,50'));
    ok(r !== null, '"Grátis" e zero, e a conta fecha', r);
})();

(function textoQueNaoEhOrcamentoNaoViraTabela() {
    ok(orcamentoEstruturado('') === null, 'vazio');
    ok(orcamentoEstruturado(null) === null, 'nulo nao quebra');
    ok(orcamentoEstruturado('Bom dia, seu pedido esta pronto.') === null, 'recado qualquer');
    // Sem o total escrito nao ha o que conferir.
    ok(orcamentoEstruturado('✅ *10* Pulseira: *R$' + NB + '20,00*') === null,
        'item sem total nao vira tabela');
})();

(function oMaiorPrazoEhOQueVale() {
    // O pedido so sai da grafica quando o ULTIMO item fica pronto.
    const r = orcamentoEstruturado(resumoModeloA([
        '✅ *10* Pulseira Triband: *R$' + NB + '10,00* (Produção: 1 dia útil + Frete)',
        '✅ *10* Credencial PVC: *R$' + NB + '20,00* (3 dias úteis)'
    ], 'Frete via *Retirada Local: Grátis*', '30,00'));
    ok(r.prazo === '3 dias úteis', 'o maior dos dois, e nao a soma nem o primeiro', r.prazo);
})();

// ─── 2c. A tabela desenhada ─────────────────────────────────────────────────

(function aTabelaTrazAsTresColunasEOFecho() {
    const html = tabelaDoOrcamento({
        itens: [{ qtd: '10 un.', produto: 'Cartão/Crachá PVC 0,76 mm', valor: 'R$ 42,50' }],
        frete: { rotulo: 'Retirada Local', valor: 'Grátis' },
        prazo: '3 dias úteis',
        total: 'R$ 224,50'
    });
    ok(/<th[^>]*>Quantidade<\/th>/.test(html), 'a coluna Quantidade', html);
    ok(/<th[^>]*>Produto<\/th>/.test(html), 'a coluna Produto');
    ok(/Valor<\/th>/.test(html), 'a coluna Valor');
    ok(html.indexOf('10 un.') > 0, 'a quantidade do item');
    ok(html.indexOf('Retirada Local') > 0, 'o frete');
    ok(html.indexOf('3 dias úteis') > 0, 'o prazo');
    ok(/fecho-linha total/.test(html) && html.indexOf('R$ 224,50') > 0,
        'e o TOTAL em destaque, dentro da tabela', html);
})();

(function itemSemQuantidadeGanhaTracoENaoCelulaVazia() {
    const html = tabelaDoOrcamento({
        itens: [{ qtd: '', produto: 'Orçamento Avulso', valor: 'R$ 87,20' }],
        frete: null, prazo: null, total: 'R$ 87,20'
    });
    ok(html.indexOf('—') > 0, 'a celula da quantidade traz um traco', html);
    ok(html.indexOf('Prazo') < 0, 'e sem prazo a linha do prazo nem aparece', html);
})();

(function oNomeDoProdutoVemDoBancoDoParceiroEEhEscapado() {
    // Mesma razao do negrito: o texto e do ERP e vai para dentro de innerHTML.
    const html = tabelaDoOrcamento({
        itens: [{ qtd: '1 un.', produto: '<img src=x onerror=alert(1)>', valor: 'R$ 1,00' }],
        frete: null, prazo: null, total: 'R$ 1,00'
    });
    ok(html.indexOf('<img') < 0, 'a tag nao chega viva ao DOM', html);
    ok(html.indexOf('&lt;img') > 0, 'ela aparece como texto', html);
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
    //
    // Em 25/08/2026 as DUAS caixas empilhadas ("Status do pagamento" e "Total do
    // pedido", uma delas repetindo a aba de Orcamento) viraram um painel so, e o
    // numero grande passou a ser o que FALTA pagar -- que e a pergunta que traz
    // o cliente a esta aba. O destaque continua existindo; mudou de nome.
    const desenha = recortar(PAGAMENTO, 'desenharSecaoPagamento');
    const painel = recortar(PAGAMENTO, 'painelDoPagamento');
    ok(desenha.indexOf('painelDoPagamento') > 0, 'a aba abre pelo painel do dinheiro');
    ok(/portal-pagamento-painel/.test(painel) || /portal-total/.test(painel),
        'o status usa a caixa de destaque, e nao uma linha qualquer');
    ok(painel.indexOf('statusDoPagamento') > 0, 'e vem do status calculado das cobrancas');
})();

(function oPainelNaoRepeteOTotalNoLugarDoQueFalta() {
    // O numero grande e o que FALTA. O total e o ja pago continuam na tela, em
    // letra menor embaixo da barra: o cliente confere, mas eles nao disputam a
    // atencao com a resposta.
    const painel = recortar(PAGAMENTO, 'painelDoPagamento');
    ok(painel.indexOf('Falta pagar') > 0, 'o rotulo do numero grande e "Falta pagar"');
    ok(/portal-medidor-legenda/.test(painel), 'e o total fica na legenda da barra');

    // Sem cobranca nenhuma nao ha o que faltar: ali o painel mostra o valor do
    // pedido. Dizer "falta R$ 0,00" seria dizer que esta pago -- e 350 dos
    // pedidos da Lista de Arte estao nesse caso porque a cobranca ainda nao saiu.
    ok(/!c\.temCobranca/.test(painel), 'pedido sem cobranca nao entra na conta do que falta');
})();

(function aContaDoDinheiroSaiDasCobrancas() {
    // E nao de `propostas.valor_total`: sao numeros diferentes quando o pedido
    // foi cobrado com entrada mais parcelas, ou quando o financeiro cancelou uma
    // cobranca e emitiu outra.
    const contas = recortar(PAGAMENTO, 'contasDoPagamento');
    ok(/cobrancaCancelada/.test(contas), 'cobranca cancelada fica de fora dos dois lados');
    ok(/cobrancaPaga/.test(contas), 'e a regra de pago e a compartilhada');
    ok(/isFinite/.test(contas), 'cobranca sem valor numerico conta como zero, e nao como NaN');
})();

if (falhas) {
    console.error('\n' + falhas + ' de ' + total + ' conferencias FALHARAM.');
    process.exit(1);
}
console.log('OK: ' + total + ' conferencias do orcamento e do pagamento.');
