// ══════════════════════════════════════════════════════════════════════════
//  💰 Orçamento — o mesmo resumo que ele já recebeu
// ══════════════════════════════════════════════════════════════════════════
//
// A fonte é `propostas.texto_whatsapp`: o resumo que o ERP monta e que o
// vendedor manda pelo WhatsApp quando o cliente fecha o pedido. Preenchido em
// 1.436 dos 1.489 pedidos dos últimos 30 dias.
//
// Remontar o orçamento a partir dos itens daria uma SEGUNDA versão do mesmo
// número — e duas versões do mesmo preço na frente do cliente é a pior coisa
// que a página de uma gráfica pode fazer. Só nos 4% sem resumo é que a aba monta
// a lista a partir de `produtos_proposta`.
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

function desenharSecaoOrcamento() {
    const secao = document.getElementById('secao-orcamento');
    if (!secao) return;

    const dados = window.portalDados || {};
    const pedido = dados.pedido || {};

    // O total em destaque, antes de tudo: é o número que o cliente procura.
    let html = '<div class="portal-total">'
        + '<span class="portal-total-rotulo">Total do pedido</span>'
        + '<span class="portal-total-valor">' + escapeHtml(emReal(pedido.valor_total)) + '</span>'
        + '</div>';

    const resumo = resumoLimpo(pedido.texto_whatsapp);

    if (resumo) {
        html += '<div class="portal-cartao">'
             + '<h2>💰 Seu orçamento</h2>'
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
        html += '<div class="portal-cartao"><h2>💰 Seu orçamento</h2>' + corpo + '</div>';
    }

    html += '<div class="portal-cartao"><div class="portal-vazio">'
         + 'Este é o orçamento aprovado no fechamento do pedido. Para mudar quantidade, '
         + 'produto ou valor, fale com seu atendimento.'
         + '</div></div>';

    secao.innerHTML = html;
}

registrarSecao('orcamento', desenharSecaoOrcamento);

window.desenharSecaoOrcamento = desenharSecaoOrcamento;
window.negritoDoWhatsapp = negritoDoWhatsapp;
window.resumoLimpo = resumoLimpo;
window.linhasDoOrcamento = linhasDoOrcamento;
