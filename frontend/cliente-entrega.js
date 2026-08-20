// ══════════════════════════════════════════════════════════════════════════
//  📦 Dados de Entrega — para onde vai, como vai e quando chega
// ══════════════════════════════════════════════════════════════════════════
//
// Antes, o endereço só aparecia num passo que vinha DEPOIS de aprovar as artes,
// e sumia da tela em seguida. Agora ele é uma aba, aberta em qualquer status —
// porque "quando chega?" é a pergunta que traz o cliente de volta ao link
// depois que a arte já foi aprovada.
//
// A forma de envio e o prazo entraram a pedido do usuário, em 20/08/2026.

/** Um cartão de linhas rótulo/valor. */
function cartaoDeLinhas(titulo, linhas, vazio) {
    let corpo;
    if (!linhas.length) {
        corpo = '<div class="portal-vazio">' + escapeHtml(vazio) + '</div>';
    } else {
        corpo = linhas.map(l =>
            '<div class="portal-linha">'
            + '<span class="portal-linha-rotulo">' + escapeHtml(l.rotulo) + '</span>'
            + '<span class="portal-linha-valor' + (l.forte ? ' forte' : '') + '">'
            + (l.html || escapeHtml(l.valor)) + '</span>'
            + '</div>'
        ).join('');
    }
    return '<div class="portal-cartao"><h2>' + titulo + '</h2>' + corpo + '</div>';
}

/**
 * As linhas do cartão de envio: forma, os DOIS prazos, volumes e rastreio.
 *
 * Prazo de produção e prazo de envio são coisas diferentes, e aparecem
 * separados por decisão do usuário em 20/08/2026. O de produção é o do produto
 * que demora mais (a gráfica só despacha quando o último item fica pronto); o de
 * envio é o que a transportadora prometeu na cotação escolhida. Somados num
 * número só, ninguém saberia qual dos dois atrasou quando o pedido atrasa.
 */
function linhasDoEnvio(dados) {
    const pedido = (dados && dados.pedido) || null;
    const frete = (dados && dados.frete) || null;
    const os = (dados && dados.os) || null;
    const itens = (dados && dados.itens) || [];

    const linhas = [{ rotulo: 'Forma de envio', valor: rotuloDoFrete(pedido, frete), forte: true }];

    const producao = prazoDeProducao(itens);
    linhas.push({
        rotulo: 'Prazo de produção',
        valor: producao || 'Combinado com seu atendimento',
        forte: !!producao
    });

    const envio = prazoDoFrete(frete);
    linhas.push({
        rotulo: 'Prazo de envio',
        valor: envio || 'Combinado com seu atendimento',
        forte: !!envio
    });

    if (pedido && pedido.volume) {
        linhas.push({ rotulo: 'Volumes', valor: String(pedido.volume) });
    }

    const rastreio = linkDeRastreio(os && os.codigo_rastreamento);
    if (rastreio) {
        linhas.push({
            rotulo: 'Código de rastreio',
            html: '<a href="' + rastreio + '" target="_blank" rel="noopener noreferrer" '
                + 'style="color: var(--blue); font-weight: 700;">'
                + escapeHtml(String(os.codigo_rastreamento).trim().toUpperCase())
                + ' ↗</a>'
        });
    }

    return linhas;
}

function desenharSecaoEntrega() {
    const secao = document.getElementById('secao-entrega');
    if (!secao) return;

    const dados = window.portalDados;
    const endereco = enderecoEmLinhas(dados && dados.endereco);

    secao.innerHTML =
        cartaoDeLinhas('📦 Endereço de entrega', endereco,
            'O endereço de entrega ainda não foi cadastrado neste pedido. '
            + 'Toque em ALTERAR abaixo e escreva o endereço, ou fale com seu atendimento.')
        + cartaoDeLinhas('🚚 Envio', linhasDoEnvio(dados), '')
        + cartaoDeDecisao('entrega')
        + cartaoDeFinalizacao();
}

registrarSecao('entrega', desenharSecaoEntrega);

window.desenharSecaoEntrega = desenharSecaoEntrega;
window.linhasDoEnvio = linhasDoEnvio;
window.cartaoDeLinhas = cartaoDeLinhas;
