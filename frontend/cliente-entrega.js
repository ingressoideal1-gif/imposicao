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

/** Um cartão de linhas rótulo/valor, com um aviso opcional no rodapé. */
function cartaoDeLinhas(titulo, linhas, vazio, aviso) {
    let corpo;
    if (!linhas.length) {
        corpo = '<div class="portal-vazio">' + escapeHtml(vazio) + '</div>';
    } else {
        corpo = linhas.map(l => {
            // Dado que falta sai em âmbar, e não em branco: assim ele se lê como
            // pendência, e não como resposta.
            const cor = l.falta ? ' style="color: #f59e0b;"' : '';
            // De onde o dado veio, quando ele nao veio do proprio endereco: sem
            // isso, o cliente ve o nome dele na linha do recebedor e nao sabe se
            // alguem digitou aquilo ou se o sistema deduziu.
            const origem = l.daNota
                ? '<span class="portal-linha-rotulo" style="margin-top: 2px; text-transform: none;">'
                  + 'mesmo da nota fiscal</span>'
                : '';
            return '<div class="portal-linha">'
                + '<span class="portal-linha-rotulo">' + escapeHtml(l.rotulo) + '</span>'
                + '<span class="portal-linha-valor' + (l.forte ? ' forte' : '') + '"' + cor + '>'
                + (l.html || escapeHtml(l.valor)) + '</span>'
                + origem
                + '</div>';
        }).join('');
    }
    return '<div class="portal-cartao"><h2>' + titulo + '</h2>' + corpo + (aviso || '') + '</div>';
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

    // A logo da transportadora, a mesma que o Painel de Produção mostra na
    // coluna de frete — pedida pelo usuário em 20/08/2026. Ela vem ACIMA do
    // texto, e não no lugar dele: a logo é reconhecida num relance, mas só o
    // texto diz o valor do frete e a modalidade.
    const nomeDoFrete = (pedido && pedido.frete_escolhido)
        || (frete && frete.servico) || '';
    const rotulo = rotuloDoFrete(pedido, frete);
    const logo = logoDoFrete(nomeDoFrete);

    // Aqui a logo vem SEM o texto de reserva que o painel usa: a linha de baixo
    // já traz o nome, e com o valor do frete junto. Repetir "SEDEX" duas vezes
    // quando a imagem não carrega é pior do que não ter a logo. Por isso o
    // `onerror` remove a imagem em vez de trocá-la por texto.
    const imagem = logo
        ? '<img src="' + escapeHtml(logo) + '" alt="' + escapeHtml(nomeDoFrete) + '" '
          + 'style="height: 34px; max-width: 110px; object-fit: contain; display: block; '
          + 'margin-bottom: 6px;" onerror="this.remove();">'
        : '';

    const linhas = [{
        rotulo: 'Forma de envio',
        valor: rotulo,
        forte: true,
        html: imagem + escapeHtml(rotulo)
    }];

    // O Prazo de Entrega numa linha só, com a conta feita.
    //
    // Antes eram duas linhas soltas — "Prazo de produção: 1 dia útil" e "Prazo
    // de envio: 1 dia útil". Estavam certas e não respondiam a pergunta que traz
    // o cliente aqui: QUANDO CHEGA? Duas linhas com o mesmo número obrigavam ele
    // a somar de cabeça. O usuário pediu a soma na tela em 20/08/2026.
    const prazo = prazoDeEntrega(itens, frete);
    if (!prazo.texto) {
        linhas.push({ rotulo: 'Prazo de entrega', valor: 'Combinado com seu atendimento' });
    } else {
        // "a partir de", e não "em": é o piso do prazo, e a gráfica não promete
        // o dia exato da entrega.
        const recebimento = prazo.recebimento
            ? '<span style="display: block; margin-top: 4px; color: var(--green); font-weight: 700;">'
              + 'Recebimento a partir de ' + escapeHtml(prazo.recebimento) + '</span>'
            : '';
        linhas.push({
            rotulo: 'Prazo de entrega',
            valor: prazo.texto,
            forte: true,
            html: '<span style="font-weight: 700;">' + escapeHtml(prazo.texto) + '</span>' + recebimento
        });
    }

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
    const cliente = (dados && dados.cliente) || null;
    const endereco = enderecoEmLinhas(dados && dados.endereco, cliente);

    // Nota de pessoa jurídica não empresta recebedor: aí o nome e o CPF de quem
    // recebe passam a ser obrigatórios, e a confirmação fica travada até o
    // cliente informar. A trava vem com a saída escrita ao lado — é a regra
    // desta casa: nada trava sem dizer o que fazer.
    const exige = entregaExigeRecebedor(dados && dados.endereco, cliente);
    const faltando = endereco.filter(l => l.falta).length;

    let aviso = '';
    if (exige) {
        aviso = '<div class="portal-aviso atencao">'
              + '<b>Informe quem vai receber o pedido.</b><br>'
              + 'A nota fiscal deste pedido é de empresa (CNPJ), e a transportadora entrega '
              + 'na mão de uma pessoa — ela pede o nome e o CPF de quem recebe. '
              + 'Toque em <b>ALTERAR</b> abaixo e escreva os dois.'
              + '</div>';
    } else if (faltando) {
        aviso = '<div class="portal-aviso atencao">Falta ' + (faltando > 1 ? 'o nome e o CPF' : 'um dado')
              + ' de quem vai receber o pedido. Toque em <b>ALTERAR</b> abaixo e informe — '
              + 'é o que a transportadora pede na entrega.</div>';
    }

    secao.innerHTML =
        cartaoDeLinhas('📦 Endereço de entrega', endereco,
            'O endereço de entrega ainda não foi cadastrado neste pedido. '
            + 'Toque em ALTERAR abaixo e escreva o endereço, ou fale com seu atendimento.',
            aviso)
        + cartaoDeLinhas('🚚 Envio', linhasDoEnvio(dados), '')
        + cartaoDeDecisao('entrega', exige
            ? 'Informe o nome e o CPF de quem vai receber antes de confirmar.'
            : null)
        + cartaoDeFinalizacao();
}

registrarSecao('entrega', desenharSecaoEntrega);

window.desenharSecaoEntrega = desenharSecaoEntrega;
window.linhasDoEnvio = linhasDoEnvio;
window.cartaoDeLinhas = cartaoDeLinhas;
