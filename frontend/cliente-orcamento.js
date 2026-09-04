// ══════════════════════════════════════════════════════════════════════════
//  💰 Orçamento — o mesmo resumo que ele já recebeu, em forma de tabela
// ══════════════════════════════════════════════════════════════════════════
//
// A fonte é `propostas.texto_whatsapp`: o resumo que o ERP monta e que o
// vendedor manda pelo WhatsApp quando o cliente fecha o pedido. Preenchido em
// 1.436 dos 1.489 pedidos dos últimos 30 dias.
//
// Remontar o orçamento a partir dos itens daria uma SEGUNDA versão do mesmo
// número — e duas versões do mesmo preço na frente do cliente é a pior coisa
// que a página de uma gráfica pode fazer. Medido no banco em 04/09/2026, nos 86
// pedidos que já tiveram link do cliente: em 36 deles a soma de
// `produtos_proposta` com o frete NÃO fecha com `propostas.valor_total`, porque
// o ERP aplica a tabela especial do cliente depois. O resumo do WhatsApp já traz
// os valores com o desconto embutido, e fecha.
//
// ## O que mudou em 04/09/2026
//
// O resumo continua sendo a fonte; o que mudou é a FORMA. Até então ele era
// despejado na tela como o parágrafo corrido que o WhatsApp mostra. Agora ele é
// LIDO — `orcamentoEstruturado` reconhece os itens, o frete, o prazo e o total —
// e redesenhado como a tabela que o usuário pediu: Quantidade, Produto, Valor, e
// embaixo o frete, o prazo e o TOTAL.
//
// Nenhum número é recalculado aqui. Os valores são os mesmos caracteres que o
// ERP escreveu, recortados do texto e postos em outra caixa.
//
// Quando o texto não é reconhecido — modelo novo de mensagem, texto truncado —,
// a aba volta a mostrar o parágrafo corrido, que é o que ela fazia antes. E sem
// texto nenhum, monta a lista a partir de `produtos_proposta`, como já fazia.
//
// A aba é só consulta, decidido com o usuário em 20/08/2026: o orçamento foi
// fechado no ERP antes de a arte existir, e o único botão de decisão desta
// página continua sendo o da arte e o dos dados.

/**
 * O `*negrito*` do WhatsApp virando `<b>`.
 *
 * ORDEM IMPORTA: escapa primeiro, troca o negrito depois. O texto vem do banco
 * do PARCEIRO e vai para dentro de `innerHTML`; na ordem inversa, uma tag
 * escrita dentro do orçamento chegaria viva ao DOM.
 *
 * O par de asteriscos precisa ter conteúdo sem espaço nas pontas, senão
 * "2 * 3 = 6" viraria negrito.
 */
function negritoDoWhatsapp(texto) {
    if (!texto) return '';
    return escapeHtml(String(texto)).replace(/\*(\S(?:[^*]*\S)?)\*/g, '<b>$1</b>');
}

/**
 * As frases que fazem sentido numa mensagem, e não numa página.
 *
 * "Se estiver tudo certo, me confirma por aqui" manda o cliente responder num
 * lugar que não existe aqui dentro; a saudação e a assinatura são conversa de
 * quem está escrevendo, não parte do orçamento.
 */
const FRASES_DE_CONVERSA = [
    /^\s*ol[áa][,!.]?\s*.{0,4}$/i,
    /^\s*se estiver tudo certo.*$/i,
    /^\s*qualquer d[úu]vida.*estou (à|a) disposi[çc][ãa]o.*$/i,
    /^\s*fico no aguardo.*$/i
];

function resumoLimpo(texto) {
    if (!texto) return '';
    return String(texto)
        .split('\n')
        .filter(linha => !FRASES_DE_CONVERSA.some(re => re.test(linha)))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

/**
 * O número escrito num valor em reais: "R$ 1.234,56" vira 1234.56.
 *
 * Serve só para CONFERIR se a tabela fecha — o que vai para a tela é sempre o
 * texto original do ERP, e não este número reconvertido. "Grátis" e qualquer
 * outra palavra devolvem `null`, e quem chama decide o que fazer com isso.
 */
function reaisEmNumero(texto) {
    const limpo = String(texto === null || texto === undefined ? '' : texto).replace(/\u00a0/g, ' ');
    const achado = limpo.match(/-?\d[\d.]*(?:,\d{1,2})?/);
    if (!achado) return null;
    const n = Number(achado[0].replace(/\./g, '').replace(',', '.'));
    return isFinite(n) ? n : null;
}

/**
 * A quantidade como o usuário pediu que ela apareça: "1.500 un.".
 *
 * O ERP escreve de dois jeitos — `*1.500*` num modelo de mensagem e `400 un` no
 * outro. Os dois viram a mesma coluna. O que não for número passa como está, em
 * vez de sumir: um "Orçamento Avulso" não tem quantidade a mostrar.
 */
function quantidadeEmTexto(bruto) {
    const t = String(bruto === null || bruto === undefined ? '' : bruto).replace(/\u00a0/g, ' ').trim();
    if (!t) return '';
    const achado = t.match(/^([\d.,]+)\s*(?:un|und|unid|unidades?|pç|pcs|peças?)?\.?$/i);
    return achado ? achado[1] + ' un.' : t;
}

/** O nome do produto sem o ponto final que o cadastro do ERP às vezes traz. */
function nomeDoProduto(bruto) {
    return String(bruto === null || bruto === undefined ? '' : bruto).trim().replace(/\s*\.\s*$/, '');
}

// ── O leitor do resumo ──────────────────────────────────────────────────────
//
// O ERP escreve o orçamento em dois modelos de mensagem, medidos no banco em
// 04/09/2026 sobre os 2.500 resumos mais recentes:
//
//   MODELO A (2.673 linhas de item)      MODELO B (82 mensagens)
//   ✅ *100* Cartão PVC: *R$ 220,50*      • 400 un — Credencial PVC — R$ 2.260,00
//      (3 dias úteis)                     📦 *Subtotal dos produtos:* R$ 3.360,00
//   Frete via *Retirada Local: Grátis*    🚚 *Frete SEDEX:* R$ 466,22
//   O valor total do pedido ficou em      💰 *Valor total do pedido:* R$ 3.360,00
//      *R$ 220,50*
//
// No modelo A o valor de cada item JÁ VEM com a tabela especial do cliente
// aplicada — conferido no pedido 21708, onde 54,45 + 93,60 batem com o total de
// 148,05 enquanto o "Subtotal bruto" de 164,50 é a linha informativa. Por isso a
// tabela soma e fecha sem precisar de uma linha de desconto.
//
// O `R$` do ERP vem com ESPAÇO NÃO-SEPARÁVEL (U+00A0) entre o cifrão e o número.
// Ele é normalizado logo na entrada: sem isso, nenhum dos padrões casa.

/**
 * O resumo do ERP lido como estrutura.
 *
 * Devolve `{ itens, frete, prazo, total }` ou `null` quando o texto não é
 * reconhecido — e `null` é o sinal para a aba mostrar o parágrafo corrido, que é
 * o comportamento que ela tinha antes.
 *
 * A conferência final é aritmética: a soma dos itens mais o frete tem de dar o
 * total que o ERP escreveu, com dois centavos de folga. Se não der, é porque o
 * texto tem algo que este leitor não entendeu — e uma tabela que não fecha na
 * frente do cliente é pior do que o parágrafo corrido.
 */
function orcamentoEstruturado(texto) {
    if (!texto) return null;

    const linhas = String(texto).replace(/\u00a0/g, ' ').split('\n').map(l => l.trim());

    // Modelo A: ✅ *100* Cartão/Crachá PVC 0,76mm: *R$ 220,50* (3 dias úteis)
    // Sem quantidade, o ERP escreve ✅ *Orçamento Avulso*: *R$ 87,20* — e aí o
    // que está entre asteriscos é o NOME, e não o número.
    const itemA = /^✅\s*\*([^*]+)\*\s*(.*?):\s*\*\s*(R\$[^*]*?)\s*\*\s*(?:\(([^)]*)\))?\s*$/;
    // Modelo B: • 400 un — Credencial PVC — R$ 2.260,00
    const itemB = /^•\s*(.+?)\s*[—–]\s*(.+)\s*[—–]\s*(R\$[\s\d.,]+)\s*$/;

    const freteA = /^Frete via\s*\*?\s*(.+?)\s*:\s*(.+?)\s*\*?\s*$/;
    const freteB = /\*\s*Frete\s*(.*?)\s*:\s*\*\s*(R\$[\s\d.,]+)\s*$/;

    const totalA = /valor total do pedido ficou em\s*\*?\s*(R\$[\s\d.,]+)/i;
    const totalB = /\*\s*Valor total do pedido\s*:\s*\*\s*(R\$[\s\d.,]+)/i;

    const itens = [];
    const prazos = [];
    let frete = null;
    let total = null;

    linhas.forEach(linha => {
        if (!linha) return;

        let m = linha.match(itemA);
        if (m) {
            const semRotulo = String(m[2] || '').trim();
            itens.push({
                qtd: semRotulo ? quantidadeEmTexto(m[1]) : '',
                produto: nomeDoProduto(semRotulo || m[1]),
                valor: String(m[3]).trim()
            });
            if (m[4] && String(m[4]).trim()) prazos.push(String(m[4]).trim());
            return;
        }

        m = linha.match(itemB);
        if (m) {
            itens.push({
                qtd: quantidadeEmTexto(m[1]),
                produto: nomeDoProduto(m[2]),
                valor: String(m[3]).trim()
            });
            return;
        }

        m = linha.match(totalA) || linha.match(totalB);
        if (m) { total = String(m[1]).trim(); return; }

        m = linha.match(freteB);
        if (m) { frete = { rotulo: ('Frete ' + String(m[1]).trim()).trim(), valor: String(m[2]).trim() }; return; }

        m = linha.match(freteA);
        if (m) { frete = { rotulo: String(m[1]).trim(), valor: String(m[2]).trim() }; return; }
    });

    if (!itens.length || !total) return null;

    // A conferência: a tabela tem de fechar com o total que o ERP escreveu.
    let somaDosItens = 0;
    for (let i = 0; i < itens.length; i++) {
        const n = reaisEmNumero(itens[i].valor);
        if (n === null) return null;
        somaDosItens += n;
    }

    const alvo = reaisEmNumero(total);
    if (alvo === null) return null;

    // Frete sem número — "Grátis" — vale zero. É o que ele é.
    const valorDoFrete = frete ? (reaisEmNumero(frete.valor) || 0) : 0;
    if (Math.abs(somaDosItens + valorDoFrete - alvo) > 0.02) return null;

    return { itens: itens, frete: frete, prazo: maiorPrazo(prazos), total: total };
}

/**
 * O prazo do pedido: o do item que demora mais.
 *
 * Mesma regra da aba de Entrega (`prazoDeProducao`): o pedido só sai da gráfica
 * quando o ÚLTIMO item fica pronto, então é o MAIOR, e não a soma nem a média. A
 * comparação é pelo número porque o catálogo tem cinco redações para a mesma
 * coisa — "3 dias úteis", "Prazo de produção 2 dias úteis", "Produção: 1 dia
 * útil + Frete".
 *
 * Prazo sem número nenhum passa como está: a frase do catálogo é melhor do que
 * um número que ninguém escreveu.
 */
function maiorPrazo(prazos) {
    const lista = (prazos || []).filter(p => p && String(p).trim());
    if (!lista.length) return null;

    let maior = null;
    lista.forEach(p => {
        const dias = diasDoPrazo(p);
        if (dias !== null && (maior === null || dias > maior)) maior = dias;
    });

    return maior !== null ? emDiasUteis(maior) : String(lista[0]).trim();
}

/**
 * O orçamento montado a partir dos itens — a reserva para os pedidos sem
 * resumo. Mesma ordem do resumo: produtos, frete, total.
 *
 * `frete` é a cotação escolhida, e precisa chegar até aqui. Até 25/08/2026 esta
 * função chamava `rotuloDoFrete(pedido)` com um argumento só, e o segundo é
 * justamente o que cobre os nomes que `propostas.frete_escolhido` não tem --
 * "Frete Incluso", "Transportadora Parceira", "Retirada Local". Sem ele, um
 * pedido cujo frete só existe na cotação saía como "A combinar" para o cliente,
 * com a transportadora já escolhida.
 */
function linhasDoOrcamento(itens, pedido, frete) {
    const lista = (itens || []).map(item => {
        const nome = item.nome_produto || item.modelo_descri || 'Item';
        const qtd = item.qtd ? String(item.qtd) + ' × ' : '';
        return {
            texto: qtd + nome,
            detalhe: item.valor_unt ? 'unitário ' + emReal(item.valor_unt)
                + (item.fixo ? ' + taxa ' + emReal(item.fixo) : '') : '',
            valor: emReal(item.valor_sub_total),
            prazo: item.prazo ? String(item.prazo).trim() : ''
        };
    });

    return {
        itens: lista,
        frete: rotuloDoFrete(pedido, frete),
        total: emReal(pedido && pedido.valor_total)
    };
}

// ── O desenho ───────────────────────────────────────────────────────────────

/** Uma linha do fecho: o desenho, o que é, e o número — nesta ordem. */
function linhaDoFecho(emoji, rotulo, valor, classe) {
    return '<div class="portal-orcamento-fecho-linha' + classe + '">'
         + '<span class="rotulo"><span class="emoji" aria-hidden="true">' + emoji + '</span>'
         + escapeHtml(rotulo) + '</span>'
         + '<span class="valor">' + escapeHtml(valor) + '</span>'
         + '</div>';
}

/**
 * A tabela do orçamento, no formato que o usuário pediu em 04/09/2026:
 * Quantidade, Produto, Valor — e embaixo o frete, o prazo e o TOTAL.
 *
 * `<table>` de verdade, e não três colunas de `<div>`: o leitor de tela anuncia
 * "Produto, coluna 2" para quem navega por áudio, e o navegador já sabe manter
 * as colunas alinhadas quando um nome de produto quebra em duas linhas.
 */
function tabelaDoOrcamento(o) {
    let html = '<p class="portal-orcamento-abertura">Olá! 👋<br>'
        + 'Preparamos seu orçamento com os itens solicitados:</p>'
        + '<div class="portal-orcamento-rolagem">'
        + '<table class="portal-orcamento-tabela">'
        + '<thead><tr><th scope="col">Quantidade</th><th scope="col">Produto</th>'
        + '<th scope="col" class="valor">Valor</th></tr></thead><tbody>';

    o.itens.forEach(i => {
        html += '<tr>'
             + '<td class="qtd">' + escapeHtml(i.qtd || '—') + '</td>'
             + '<td>' + escapeHtml(i.produto) + '</td>'
             + '<td class="valor">' + escapeHtml(i.valor) + '</td>'
             + '</tr>';
    });

    html += '</tbody></table></div><div class="portal-orcamento-fecho">';

    if (o.frete) html += linhaDoFecho('🚚', o.frete.rotulo, o.frete.valor, '');
    if (o.prazo) html += linhaDoFecho('⏱️', 'Prazo', o.prazo, '');
    html += linhaDoFecho('💰', 'TOTAL', o.total, ' total');

    return html + '</div>';
}

/**
 * O que fazer para o pedido andar — e ONDE.
 *
 * O texto que o usuário passou termina em "basta realizar a aprovação do
 * orçamento". Numa mensagem de WhatsApp isso quer dizer "me responde"; nesta
 * página, o botão que faz o pedido andar é o da aba Arte. Mandar aprovar sem
 * dizer onde deixaria o cliente procurando um botão que não existe aqui.
 */
function comoProsseguir() {
    const jaAprovou = typeof artesJaAprovadas === 'function' && artesJaAprovadas();

    const frase = jaAprovou
        ? 'Recebemos sua aprovação. Nossa equipe dará sequência à produção.'
        : 'Para prosseguir com o pedido, basta realizar a aprovação na aba '
          + '<b><a href="#arte" onclick="abrirSecao(\'arte\'); return false;">Arte</a></b>. '
          + 'Após a confirmação, nossa equipe dará sequência à produção.';

    return '<div class="portal-cartao"><div class="portal-vazio">'
         + frase + '<br><br>'
         + 'Para mudar quantidade, produto ou valor, fale com seu atendimento.'
         + '</div></div>';
}

function desenharSecaoOrcamento() {
    const secao = document.getElementById('secao-orcamento');
    if (!secao) return;

    const dados = window.portalDados || {};
    const pedido = dados.pedido || {};

    const resumo = resumoLimpo(pedido.texto_whatsapp);
    const estruturado = orcamentoEstruturado(resumo);

    // O total em destaque, quando ele NÃO está dentro da tabela.
    const caixaDoTotal = '<div class="portal-total">'
        + '<span class="portal-total-rotulo">Total do pedido</span>'
        + '<span class="portal-total-valor">' + escapeHtml(emReal(pedido.valor_total)) + '</span>'
        + '</div>';

    let html = '';

    if (estruturado) {
        // O total mora DENTRO da tabela, e não numa caixa acima dela: dois
        // totais na mesma tela, um vindo de `valor_total` e outro do resumo,
        // discordam de verdade -- no pedido 21116 são R$ 75,20 e R$ 112,00.
        html += '<div class="portal-cartao">'
             + '<h2>' + tituloDoCartao('orcamento', 'Resumo do seu orçamento') + '</h2>'
             + tabelaDoOrcamento(estruturado)
             + '</div>';
    } else if (resumo) {
        html += caixaDoTotal
             + '<div class="portal-cartao">'
             + '<h2>' + tituloDoCartao('orcamento', 'Seu orçamento') + '</h2>'
             + '<div class="portal-resumo">' + negritoDoWhatsapp(resumo) + '</div>'
             + '</div>';
    } else {
        const o = linhasDoOrcamento(dados.itens, pedido, dados.frete);
        let corpo = '';
        if (!o.itens.length) {
            corpo = '<div class="portal-vazio">Os itens deste pedido ainda não foram lançados. '
                  + 'Fale com seu atendimento para receber o orçamento.</div>';
        } else {
            corpo = o.itens.map(i =>
                '<div class="portal-linha">'
                + '<span class="portal-linha-rotulo">' + escapeHtml(i.texto)
                + (i.prazo ? ' — ' + escapeHtml(i.prazo) : '') + '</span>'
                + '<span class="portal-linha-valor forte">' + escapeHtml(i.valor) + '</span>'
                + (i.detalhe ? '<span class="portal-linha-rotulo" style="margin-top: 2px;">'
                    + escapeHtml(i.detalhe) + '</span>' : '')
                + '</div>'
            ).join('');
            corpo += '<div class="portal-linha">'
                  + '<span class="portal-linha-rotulo">Frete</span>'
                  + '<span class="portal-linha-valor">' + escapeHtml(o.frete) + '</span>'
                  + '</div>';
        }
        html += caixaDoTotal
             + '<div class="portal-cartao"><h2>' + tituloDoCartao('orcamento', 'Seu orçamento') + '</h2>'
             + corpo + '</div>';
    }

    html += comoProsseguir() + botaoDeAjuda(dados);

    secao.innerHTML = html;
}

registrarSecao('orcamento', desenharSecaoOrcamento);

window.desenharSecaoOrcamento = desenharSecaoOrcamento;
window.negritoDoWhatsapp = negritoDoWhatsapp;
window.resumoLimpo = resumoLimpo;
window.linhasDoOrcamento = linhasDoOrcamento;
window.orcamentoEstruturado = orcamentoEstruturado;
