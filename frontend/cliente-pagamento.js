// ══════════════════════════════════════════════════════════════════════════
//  💳 Pagamento — a cobrança do pedido, com o status em destaque
// ══════════════════════════════════════════════════════════════════════════
//
// ## Onde o link mora
//
// Em `pagamentos_v2.url_cobranca`, e a forma em `tipo_cobranca`. Achado no banco
// em 20/08/2026 a partir do pedido 20927, cujo link é
// `https://pay.ai-ideal.com.br/i/a21f550f`.
//
// A v656 lia `propostas_os.link_pagamento`, que está vazio nas 23 linhas daquela
// tabela — nunca foi por ali. Em `pagamentos_v2` são 3.367 pedidos com cobrança
// nos últimos 90 dias.
//
// ## Por que uma LISTA, e não uma cobrança
//
// Porque um pedido pode ter mais de uma: 190 dos 3.552 pedidos com cobrança têm
// duas ou mais — entrada mais parcelas, com a referência indo `20927-A`,
// `20927-B`. Mostrar só a primeira esconderia do cliente metade do que ele tem a
// pagar.
//
// Cobrança CANCELADA não chega aqui: a função do banco a deixa de fora. O link
// dela ainda abre, e mandar o cliente pagar uma cobrança que a gráfica cancelou
// é pior do que não mostrar nada.

/** As formas de cobrança do ERP, escritas como se fala. */
const NOME_DA_FORMA = {
    'PIX': 'PIX',
    'BOLETO': 'Boleto',
    'CARD_PARCELADO': 'Cartão parcelado',
    'CARTAO': 'Cartão',
    'E-FATURADO': 'Faturado',
    'E-CREDITO': 'Crédito'
};

function rotuloDaForma(tipo) {
    const bruto = tipo ? String(tipo).trim() : '';
    if (!bruto) return 'A combinar';
    // Forma nova que o ERP inventar passa como está: melhor o nome cru do que
    // um pedido que não diz como se paga.
    return NOME_DA_FORMA[bruto.toUpperCase()] || bruto;
}

/** Os status de cobrança do ERP, com a cor que cada um pede. */
const NOME_DO_STATUS = {
    'PAID': { texto: 'Pago', cor: '#22c55e' },
    'A_RECEBER': { texto: 'Aguardando pagamento', cor: '#f59e0b' },
    'A_VENCER': { texto: 'A vencer', cor: '#f59e0b' },
    'CANCELADO': { texto: 'Cancelado', cor: '#94a3b8' }
};

function rotuloDoStatus(status) {
    const bruto = status ? String(status).trim() : '';
    if (!bruto) return { texto: 'Sem informação', cor: '#94a3b8' };
    return NOME_DO_STATUS[bruto.toUpperCase()] || { texto: bruto, cor: '#94a3b8' };
}

/**
 * O status do PEDIDO — o que vai em destaque, a pedido do usuário.
 *
 * Ele não é o status de uma cobrança: é o das cobranças todas juntas. Com duas
 * cobranças e uma paga, dizer "Pago" mandaria o cliente embora devendo; dizer
 * "Aguardando" apagaria o que ele já pagou. Por isso existe o caso `parcial`.
 */
function statusDoPagamento(pagamentos) {
    const lista = pagamentos || [];
    if (!lista.length) {
        return {
            chave: 'sem_cobranca',
            texto: 'Aguardando cobrança',
            cor: '#94a3b8'
        };
    }

    const pagas = lista.filter(p => String(p.status || '').toUpperCase() === 'PAID').length;
    if (pagas === lista.length) return { chave: 'pago', texto: 'Pago', cor: '#22c55e' };
    if (pagas > 0) {
        return {
            chave: 'parcial',
            texto: 'Parcialmente pago (' + pagas + ' de ' + lista.length + ')',
            cor: '#f59e0b'
        };
    }
    return { chave: 'aberto', texto: 'Aguardando pagamento', cor: '#f59e0b' };
}

/**
 * Se esta cobrança vira botão.
 *
 * Duas guardas. O link precisa ser um endereço de verdade — o campo é texto
 * livre no ERP, e um "combinar com o vendedor" digitado ali não pode virar botão
 * que leva a lugar nenhum. E a cobrança precisa estar em aberto: "Pagar agora"
 * embaixo de uma cobrança já paga é convite para pagar duas vezes.
 */
function podePagar(cobranca) {
    if (!cobranca) return false;
    if (String(cobranca.status || '').toUpperCase() === 'PAID') return false;
    const link = cobranca.link ? String(cobranca.link).trim() : '';
    return /^https?:\/\/\S+$/i.test(link);
}

/** A data de vencimento como se lê, ou vazio. */
function vencimentoEmDia(valor) {
    const bruto = valor ? String(valor).trim() : '';
    if (!bruto) return '';
    const texto = /^\d{4}-\d{2}-\d{2}$/.test(bruto) ? bruto + 'T00:00:00' : bruto;
    const data = new Date(texto);
    if (isNaN(data.getTime())) return '';
    return String(data.getDate()).padStart(2, '0') + '/'
         + String(data.getMonth() + 1).padStart(2, '0') + '/'
         + data.getFullYear();
}

/** Um cartão por cobrança. */
function cartaoDaCobranca(cobranca, indice, total) {
    const st = rotuloDoStatus(cobranca.status);
    const venc = vencimentoEmDia(cobranca.vencimento);

    // O título só numera quando há mais de uma: "Cobrança 1 de 1" é ruído.
    const titulo = total > 1
        ? '💳 Cobrança ' + (indice + 1) + ' de ' + total
        : '💳 Pagamento';

    let corpo = '<div class="portal-linha">'
        + '<span class="portal-linha-rotulo">Forma de pagamento</span>'
        + '<span class="portal-linha-valor forte">' + escapeHtml(rotuloDaForma(cobranca.forma)) + '</span>'
        + '</div>'
        + '<div class="portal-linha">'
        + '<span class="portal-linha-rotulo">Situação</span>'
        + '<span class="portal-linha-valor forte" style="color: ' + st.cor + ';">'
        + escapeHtml(st.texto) + '</span>'
        + '</div>'
        + '<div class="portal-linha">'
        + '<span class="portal-linha-rotulo">Valor</span>'
        + '<span class="portal-linha-valor">' + escapeHtml(emReal(cobranca.valor)) + '</span>'
        + '</div>';

    if (venc) {
        corpo += '<div class="portal-linha">'
              + '<span class="portal-linha-rotulo">Vencimento</span>'
              + '<span class="portal-linha-valor">' + escapeHtml(venc) + '</span>'
              + '</div>';
    }

    if (podePagar(cobranca)) {
        // `noopener noreferrer`: o destino é o sistema de pagamento, fora deste
        // domínio, e a página aberta não tem por que alcançar esta aqui.
        corpo += '<a class="portal-botao principal" style="margin-top: 14px;" href="'
              + escapeHtml(String(cobranca.link).trim())
              + '" target="_blank" rel="noopener noreferrer">💳 Pagar agora</a>';
    } else if (String(cobranca.status || '').toUpperCase() !== 'PAID') {
        corpo += '<div class="portal-aviso calmo" style="margin-top: 14px;">'
              + 'O link desta cobrança ainda não foi liberado. Fale com seu atendimento.'
              + '</div>';
    }

    return '<div class="portal-cartao"><h2>' + titulo + '</h2>' + corpo + '</div>';
}

function desenharSecaoPagamento() {
    const secao = document.getElementById('secao-pagamento');
    if (!secao) return;

    const dados = window.portalDados || {};
    const pedido = dados.pedido || {};
    const cobrancas = dados.pagamentos || [];
    const geral = statusDoPagamento(cobrancas);

    // O status em destaque, antes de tudo — é a resposta à pergunta que traz o
    // cliente a esta aba.
    let html = '<div class="portal-total" style="background: rgba(148, 163, 184, 0.08); '
        + 'border-color: ' + geral.cor + ';">'
        + '<span class="portal-total-rotulo">Status do pagamento</span>'
        + '<span class="portal-total-valor" style="color: ' + geral.cor + '; font-size: 1.25rem;">'
        + escapeHtml(geral.texto) + '</span>'
        + '</div>'
        + '<div class="portal-total">'
        + '<span class="portal-total-rotulo">Total do pedido</span>'
        + '<span class="portal-total-valor">' + escapeHtml(emReal(pedido.valor_total)) + '</span>'
        + '</div>';

    if (!cobrancas.length) {
        html += '<div class="portal-cartao">'
             + '<h2>💳 Pagamento</h2>'
             + '<div class="portal-vazio">'
             + 'A cobrança deste pedido ainda não foi gerada. Assim que ela sair, o link '
             + 'aparece aqui nesta mesma página — é só voltar por este link. Se precisar '
             + 'pagar agora, <b>fale com seu atendimento</b> e informe o pedido nº '
             + escapeHtml(String(pedido.numero || '')) + '.'
             + '</div></div>';
    } else {
        html += cobrancas.map((c, i) => cartaoDaCobranca(c, i, cobrancas.length)).join('');
    }

    secao.innerHTML = html;
}

registrarSecao('pagamento', desenharSecaoPagamento);

window.desenharSecaoPagamento = desenharSecaoPagamento;
window.statusDoPagamento = statusDoPagamento;
window.rotuloDaForma = rotuloDaForma;
window.rotuloDoStatus = rotuloDoStatus;
window.podePagar = podePagar;
