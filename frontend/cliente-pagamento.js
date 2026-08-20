// ══════════════════════════════════════════════════════════════════════════
//  💳 Link para pagamento — o que o parceiro fornecer
// ══════════════════════════════════════════════════════════════════════════
//
// A fonte é `propostas_os.link_pagamento`. Decidido com o usuário em
// 20/08/2026: o link vem do parceiro, e não há nada a preencher no painel.
//
// Medido no banco naquele dia: `link_pagamento` e `forma_pagamento` estão vazios
// nas 23 linhas de `propostas_os`, e `status_pagamento` vale `APROVADO` em todas
// as 23 — o que denuncia valor padrão, e não estado real. Por isso esta aba
// nasce, hoje, no estado "aguardando" para todo mundo; e por isso ela não
// anuncia "pagamento aprovado" enquanto o parceiro não fizer aquele campo
// variar. Dizer ao cliente que o pagamento está aprovado quando ninguém sabe é
// pior do que não dizer nada.

/**
 * `liberado` só quando há um endereço de verdade.
 *
 * O campo é texto livre no ERP: um "combinar com o vendedor" digitado ali não
 * pode virar um botão que leva a lugar nenhum.
 */
function estadoDoPagamento(os) {
    const link = os && os.link_pagamento ? String(os.link_pagamento).trim() : '';
    return /^https?:\/\/\S+$/i.test(link) ? 'liberado' : 'aguardando';
}

/** O status do parceiro só aparece quando há link — ver o cabeçalho. */
function mostraStatusDePagamento(os) {
    return estadoDoPagamento(os) === 'liberado' && !!(os && os.status_pagamento);
}

function desenharSecaoPagamento() {
    const secao = document.getElementById('secao-pagamento');
    if (!secao) return;

    const dados = window.portalDados || {};
    const pedido = dados.pedido || {};
    const os = dados.os || null;

    let html = '<div class="portal-total">'
        + '<span class="portal-total-rotulo">Total a pagar</span>'
        + '<span class="portal-total-valor">' + escapeHtml(emReal(pedido.valor_total)) + '</span>'
        + '</div>';

    if (estadoDoPagamento(os) === 'liberado') {
        const link = String(os.link_pagamento).trim();
        html += '<div class="portal-cartao">'
             + '<h2>💳 Pagamento</h2>';

        if (os.forma_pagamento) {
            html += '<div class="portal-linha">'
                 + '<span class="portal-linha-rotulo">Forma de pagamento</span>'
                 + '<span class="portal-linha-valor">' + escapeHtml(os.forma_pagamento) + '</span>'
                 + '</div>';
        }
        if (mostraStatusDePagamento(os)) {
            html += '<div class="portal-linha">'
                 + '<span class="portal-linha-rotulo">Situação</span>'
                 + '<span class="portal-linha-valor">' + escapeHtml(os.status_pagamento) + '</span>'
                 + '</div>';
        }

        // `noopener noreferrer`: o destino é o gateway do parceiro, fora deste
        // domínio, e a página aberta não tem por que alcançar esta aqui.
        html += '<a class="portal-botao principal" style="margin-top: 14px;" href="'
             + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">'
             + '💳 Pagar agora</a>'
             + '<div class="portal-vazio" style="margin-top: 10px;">'
             + 'Você será levado para a página de pagamento. Qualquer dúvida, fale com seu '
             + 'atendimento.</div>'
             + '</div>';
    } else {
        html += '<div class="portal-cartao">'
             + '<h2>💳 Pagamento</h2>'
             + '<div class="portal-aviso calmo">'
             + 'O link de pagamento deste pedido ainda não foi liberado.'
             + '</div>'
             + '<div class="portal-vazio">'
             + 'Assim que ele estiver disponível, aparece aqui nesta mesma página — '
             + 'é só voltar por este link. Se precisar pagar agora, '
             + '<b>fale com seu atendimento</b> e informe o pedido nº '
             + escapeHtml(String(pedido.numero || '')) + '.'
             + '</div>'
             + '</div>';
    }

    secao.innerHTML = html;
}

registrarSecao('pagamento', desenharSecaoPagamento);

window.desenharSecaoPagamento = desenharSecaoPagamento;
window.estadoDoPagamento = estadoDoPagamento;
window.mostraStatusDePagamento = mostraStatusDePagamento;
