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
 *
 * A CONTA vem de `pagamento-do-pedido.js`, e não daqui. Desde 25/08/2026 a
 * Lista de Arte faz a mesma pergunta, para decidir o selo PAGO na frente do
 * atendimento — e duas contas diferentes sobre o mesmo dinheiro fariam o
 * cliente e a gráfica verem coisas diferentes, com a gráfica descobrindo por
 * último. É lá também que mora o motivo de a cobrança CANCELADA não contar.
 */
function statusDoPagamento(pagamentos) {
    const c = contarCobrancas(pagamentos);
    if (!c.total) {
        return {
            chave: 'sem_cobranca',
            texto: 'Aguardando cobrança',
            cor: '#94a3b8'
        };
    }

    if (c.pagas === c.total) return { chave: 'pago', texto: 'Pago', cor: '#22c55e' };
    if (c.pagas > 0) {
        return {
            chave: 'parcial',
            texto: 'Parcialmente pago (' + c.pagas + ' de ' + c.total + ')',
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

/** O ícone, quando o módulo dele carregou. */
function iconeDoPagamento(nome, px, cor) {
    return typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
}

/**
 * O dinheiro do pedido em três números: pago, falta e total.
 *
 * A soma sai das COBRANÇAS, e não de `propostas.valor_total`. São coisas
 * diferentes quando o pedido foi cobrado em parcelas com entrada, ou quando o
 * financeiro cancelou uma cobrança e emitiu outra: o total do orçamento fica
 * onde estava, e o que o cliente tem a pagar é o que está em aberto nas
 * cobranças vivas. Dizer "falta R$ 5.700" para quem já pagou a entrada seria
 * cobrá-lo duas vezes na tela.
 *
 * Cobrança CANCELADA não entra em nenhum dos lados -- é a mesma regra do
 * `contarCobrancas`, e o porquê está no `pagamento-do-pedido.js`.
 *
 * Cobrança sem valor numérico conta como zero na soma e continua aparecendo na
 * lista abaixo, com o valor que tiver: sumir com ela do painel seria esconder
 * dinheiro; somá-la como zero é só não inventar um número que não veio.
 */
function contasDoPagamento(cobrancas) {
    const vivas = (cobrancas || []).filter(c => c && !cobrancaCancelada(c));
    const soma = lista => lista.reduce((acc, c) => {
        const n = Number(c.valor);
        return acc + (isFinite(n) ? n : 0);
    }, 0);

    const pagas = vivas.filter(cobrancaPaga);
    const abertas = vivas.filter(c => !cobrancaPaga(c));

    return {
        temCobranca: vivas.length > 0,
        pago: soma(pagas),
        falta: soma(abertas),
        total: soma(vivas),
        qtdPagas: pagas.length,
        qtdTotal: vivas.length
    };
}

/**
 * O painel do dinheiro: um só, no lugar das duas caixas que havia.
 *
 * Até 25/08/2026 esta aba abria com DUAS caixas de destaque empilhadas -- uma
 * com "Status do pagamento" e outra com "Total do pedido" --, e o total já era
 * o mesmo número que a aba de Orçamento mostra em destaque. Duas caixas do
 * mesmo tamanho, uma delas repetindo outra aba, e nenhuma respondendo o que o
 * cliente vem perguntar aqui: quanto eu ainda devo?
 *
 * Agora o número grande é o que FALTA, com o já pago e o total em letra menor
 * embaixo da barra -- presentes, porque o cliente confere, mas sem disputar a
 * atenção com a resposta.
 */
function painelDoPagamento(cobrancas, pedido) {
    const geral = statusDoPagamento(cobrancas);
    const c = contasDoPagamento(cobrancas);

    // Sem cobrança nenhuma não há o que faltar: o painel mostra o valor do
    // pedido e o estado, e o cartão de baixo explica que a cobrança ainda não
    // saiu. Dizer "falta R$ 0,00" aqui seria dizer que está pago.
    if (!c.temCobranca) {
        return '<div class="portal-pagamento-painel" style="border-color: ' + geral.cor + '59;">'
            + '<div class="portal-pagamento-topo"><div>'
            + '<span class="portal-pagamento-rotulo">Total do pedido</span>'
            + '<span class="portal-pagamento-valor">' + escapeHtml(emReal(pedido && pedido.valor_total)) + '</span>'
            + '</div>'
            + '<span class="portal-pagamento-situacao" style="background: ' + geral.cor + '24; color: '
            + geral.cor + ';">' + escapeHtml(geral.texto) + '</span>'
            + '</div></div>';
    }

    const pago = geral.chave === 'pago';
    const rotulo = pago ? 'Tudo pago' : 'Falta pagar';
    const valor = pago ? c.total : c.falta;
    const cor = pago ? '#22c55e' : geral.cor;

    // A barra sai quando os valores não vieram: uma barra que não anda, ou que
    // anda por engano, diz uma mentira sobre dinheiro. Aí a legenda conta
    // COBRANÇAS ("1 de 2 pagas"), que é o que se sabe.
    const medidor = c.total > 0
        ? '<div class="portal-medidor"><div class="portal-medidor-fill" style="width: '
          + Math.min(100, Math.round((c.pago / c.total) * 100)) + '%;"></div></div>'
          + '<div class="portal-medidor-legenda">'
          + '<b>' + escapeHtml(emReal(c.pago)) + ' pagos</b>'
          + '<span>Total ' + escapeHtml(emReal(c.total)) + '</span>'
          + '</div>'
        : '<div class="portal-medidor-legenda" style="margin-top: 12px;">'
          + '<b>' + c.qtdPagas + ' de ' + c.qtdTotal + ' cobranças pagas</b>'
          + '<span>Total ' + escapeHtml(emReal(pedido && pedido.valor_total)) + '</span>'
          + '</div>';

    return '<div class="portal-pagamento-painel" style="border-color: ' + cor + '59;">'
        + '<div class="portal-pagamento-topo"><div>'
        + '<span class="portal-pagamento-rotulo">' + rotulo + '</span>'
        + '<span class="portal-pagamento-valor" style="color: ' + cor + ';">'
        + escapeHtml(emReal(valor)) + '</span>'
        + '</div>'
        + '<span class="portal-pagamento-situacao" style="background: ' + geral.cor + '24; color: '
        + geral.cor + ';">' + escapeHtml(geral.texto) + '</span>'
        + '</div>'
        + medidor
        + '</div>';
}

/** Um cartão por cobrança. */
function cartaoDaCobranca(cobranca, indice, total) {
    const st = rotuloDoStatus(cobranca.status);
    const venc = vencimentoEmDia(cobranca.vencimento);
    const paga = String(cobranca.status || '').toUpperCase() === 'PAID';

    // O título só numera quando há mais de uma: "Cobrança 1 de 1" é ruído.
    const titulo = total > 1
        ? 'Parcela ' + (indice + 1) + ' de ' + total
        : 'Pagamento';

    // A cobrança em aberto vem à frente; a paga fica recolhida.
    //
    // O que muda entre as duas é o que o cliente ainda pode fazer. A paga é
    // recibo: forma, valor e a data em que entrou, num cartão de peso normal.
    // A aberta é tarefa: o valor grande, o vencimento e o botão que resolve.
    const cabecalho = '<div class="portal-cobranca-topo">'
        + '<span class="portal-cobranca-nome">'
        + iconeDoPagamento(paga ? 'check' : 'pagar', 20, paga ? '#22c55e' : st.cor)
        + '<span>' + escapeHtml(titulo)
        + '<small>' + escapeHtml(rotuloDaForma(cobranca.forma))
        + (venc ? (paga ? ' · venceu em ' : ' · vence em ') + escapeHtml(venc) : '') + '</small>'
        + '</span></span>'
        + '<span class="portal-cobranca-valor"' + (paga ? ' style="color: var(--text-dim);"' : '') + '>'
        + escapeHtml(emReal(cobranca.valor)) + '</span>'
        + '</div>';

    const situacao = '<div class="portal-linha" style="border-bottom: 0; padding-bottom: 0;">'
        + '<span class="portal-linha-rotulo">Situação</span>'
        + '<span class="portal-linha-valor forte" style="color: ' + st.cor + ';">'
        + escapeHtml(st.texto) + '</span>'
        + '</div>';

    let corpo = cabecalho + situacao;

    if (podePagar(cobranca)) {
        // `noopener noreferrer`: o destino é o sistema de pagamento, fora deste
        // domínio, e a página aberta não tem por que alcançar esta aqui.
        corpo += '<a class="portal-botao principal" style="margin-top: 14px;" href="'
              + escapeHtml(String(cobranca.link).trim())
              + '" target="_blank" rel="noopener noreferrer">'
              + iconeDoPagamento('fora', 18) + 'Pagar agora</a>';
    } else if (!paga) {
        corpo += '<div class="portal-aviso calmo" style="margin-top: 14px; margin-bottom: 0;">'
              + 'O link desta cobrança ainda não foi liberado. Fale com seu atendimento.'
              + '</div>';
    }

    return '<div class="portal-cartao"'
        + (podePagar(cobranca) ? ' style="border-color: ' + st.cor + '73;"' : '')
        + '>' + corpo + '</div>';
}

function desenharSecaoPagamento() {
    const secao = document.getElementById('secao-pagamento');
    if (!secao) return;

    const dados = window.portalDados || {};
    const pedido = dados.pedido || {};
    const cobrancas = dados.pagamentos || [];

    // Quanto falta, em destaque, antes de tudo — é a resposta à pergunta que
    // traz o cliente a esta aba. Quem calcula o estado é o `painelDoPagamento`,
    // pelo `statusDoPagamento`.
    let html = painelDoPagamento(cobrancas, pedido);

    if (!cobrancas.length) {
        html += '<div class="portal-cartao">'
             + '<h2>' + tituloDoCartao('pagar', 'Pagamento') + '</h2>'
             + '<div class="portal-vazio">'
             + 'A cobrança deste pedido ainda não foi gerada. Assim que ela sair, o link '
             + 'aparece aqui nesta mesma página — é só voltar por este link. Se precisar '
             + 'pagar agora, <b>fale com seu atendimento</b> e informe o pedido nº '
             + escapeHtml(String(pedido.numero || '')) + '.'
             + '</div></div>';
    } else {
        // A cobrança em ABERTO primeiro, e a paga depois. O que o cliente veio
        // fazer aqui é pagar o que falta; recibo de parcela quitada é
        // conferência, e conferência espera.
        const emAberto = cobrancas.filter(c => String(c.status || '').toUpperCase() !== 'PAID');
        const quitadas = cobrancas.filter(c => String(c.status || '').toUpperCase() === 'PAID');
        html += emAberto.concat(quitadas)
            .map(c => cartaoDaCobranca(c, cobrancas.indexOf(c), cobrancas.length))
            .join('');
    }

    html += botaoDeAjuda(dados);

    secao.innerHTML = html;
}

registrarSecao('pagamento', desenharSecaoPagamento);

window.desenharSecaoPagamento = desenharSecaoPagamento;
window.statusDoPagamento = statusDoPagamento;
window.contasDoPagamento = contasDoPagamento;
window.painelDoPagamento = painelDoPagamento;
window.rotuloDaForma = rotuloDaForma;
window.rotuloDoStatus = rotuloDoStatus;
window.podePagar = podePagar;
