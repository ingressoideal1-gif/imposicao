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

/** O ícone, quando o módulo dele carregou. Sem ele, o texto ao lado basta. */
function iconeDaEntrega(nome, px, cor) {
    return typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '';
}

/** O título de um cartão: o desenho e a palavra, nesta ordem. */
function tituloDoCartao(nomeDoIcone, texto) {
    return iconeDaEntrega(nomeDoIcone, 18) + escapeHtml(texto);
}

/**
 * QUANDO CHEGA — a resposta, em destaque, no alto da aba.
 *
 * A conta já existia: `prazoDeEntrega` soma produção e envio desde 20/08/2026,
 * a pedido do usuário, justamente porque duas linhas soltas obrigavam o cliente
 * a somar de cabeça. O que faltava era o LUGAR: a soma saía como a segunda de
 * sete linhas dentro do cartão de Envio, do mesmo tamanho do código de rastreio
 * e da lista de volumes.
 *
 * "Quando chega?" é a pergunta que traz o cliente de volta ao link depois que a
 * arte já foi aprovada. Ela abre a aba.
 *
 * Devolve string VAZIA quando não há número dos dois lados: sem os dois, não há
 * soma, e o cartão de Envio abaixo já diz "Combinado com seu atendimento". Um
 * painel grande escrito "a combinar" não é resposta -- é um espaço nobre gasto
 * para não dizer nada.
 *
 * O texto continua sendo "a partir de": é o piso do prazo, e a gráfica não
 * promete o dia exato da entrega. Inventar uma data aqui seria criar uma
 * promessa que ninguém fez -- e é da data prometida que o cliente cobra depois.
 */
function cartaoDeChegada(dados) {
    const pedido = (dados && dados.pedido) || null;
    const frete = (dados && dados.frete) || null;
    const itens = (dados && dados.itens) || [];
    const retirada = ehRetirada(pedido, frete);

    const producao = prazoDeProducao(itens);
    const prazo = prazoDeEntrega(itens, frete);

    // Na retirada não há perna de envio: quem vai buscar é o cliente. Somar um
    // dia de transporte que não vai acontecer daria a ele uma data pior do que
    // a real, e ele viria um dia depois do que podia.
    const valor = retirada ? producao : prazo.recebimento;
    if (!valor) return '';

    const caixas = [
        '<div class="portal-chegada-caixa">'
        + '<span class="rotulo">Produção</span>'
        + '<span class="valor">' + escapeHtml(producao || '--') + '</span></div>'
    ];
    if (!retirada && prazo.envio) {
        caixas.push('<div class="portal-chegada-caixa">'
            + '<span class="rotulo">Transporte</span>'
            + '<span class="valor">' + escapeHtml(prazo.envio) + '</span></div>');
    }

    const transporte = retirada ? '' :
        '<div class="portal-chegada-transporte">'
        + iconeDaEntrega('caminhao', 19)
        + escapeHtml(rotuloDoFrete(pedido, frete))
        + '</div>';

    return '<div class="portal-chegada">'
        + '<span class="portal-chegada-rotulo">'
        + (retirada ? 'Pronto para retirada em' : 'Seu pedido chega em') + '</span>'
        + '<span class="portal-chegada-valor">' + escapeHtml(valor) + '</span>'
        + '<span class="portal-chegada-nota">'
        + (retirada
            ? 'A contar da aprovação. Avisamos você quando estiver pronto para buscar.'
            : 'A contar da aprovação, e é o piso do prazo: a gráfica só despacha quando o último modelo do pedido fica pronto.')
        + '</span>'
        + '<div class="portal-chegada-contas">' + caixas.join('') + '</div>'
        + transporte
        + '</div>';
}

/**
 * Falar com o atendimento — a porta que faltava.
 *
 * Meia dúzia de avisos desta página terminam em "fale com seu atendimento": o
 * endereço que não foi definido, a cobrança que ainda não saiu, o modelo sem
 * arte, a seção que não desenhou. Nenhum deles oferecia um caminho, e o cliente
 * tinha de sair da página e procurar a conversa no WhatsApp.
 *
 * Toda trava desta casa mostra a saída na própria tela; um aviso que manda
 * procurar ajuda em outro lugar é a mesma coisa sem a saída.
 *
 * Desde 25/08/2026 ele é SEMPRE WhatsApp, e sempre existe. Até então saía de
 * `grafica.telefone`: sumia quando o cadastro não tinha número, e num fixo virava
 * "Ligar para o meu atendimento" — um `tel:` disparado de dentro do navegador
 * embutido do WhatsApp, que é justamente por onde este link é aberto.
 */
/**
 * O WhatsApp do atendimento — um número só, com o recado já escrito.
 *
 * Endereços mandados pelo usuário em 25/08/2026. Os cinco links dele apontam
 * para o MESMO telefone e diferem só no texto: quem separa um atendente do
 * outro é o recado que já vai escrito, e não a linha.
 *
 * O número fica literal aqui, e não sai de `grafica.telefone`, porque são
 * telefones diferentes: o do cadastro da empresa é o fixo (5132403363), que não
 * tem WhatsApp. Trocar este exige uma publicação — é o preço de ele não estar no
 * cadastro, e está anotado para quem precisar mexer.
 */
const WHATSAPP_DO_ATENDIMENTO = '555195343478';

/**
 * Os atendentes que têm recado próprio.
 *
 * São os quatro que o usuário nomeou, e são também os quatro maiores do banco:
 * medidos em 25/08/2026, respondem por 3.700 dos 3.981 pedidos dos últimos 90
 * dias. Os demais nomes que aparecem por lá — Lisiane Colbeich, Everton Dev,
 * Edison Jr, Everton Farias — caem no recado genérico, que é justamente o link
 * "Outros" que ele mandou.
 *
 * A grafia aqui é a do BANCO (`propostas.vendedor`), conferida antes de
 * escrever. O casamento ignora acento e caixa, para um "ANDRE TONIAZZO" digitado
 * de outro jeito continuar achando o dono.
 */
const ATENDENTES_COM_RECADO_PROPRIO = [
    'André Toniazzo',
    'Emily Boeira',
    'Alexandre Almeida',
    'Fábio Almeida'
];

/** Sem acento, sem espaço sobrando e em minúscula — para comparar nome. */
function chaveDoAtendente(nome) {
    return String(nome || '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

/**
 * O endereço do WhatsApp para falar com o atendente deste pedido.
 *
 * Conhecendo o nome, o recado já vai com ele: *"Olá André Toniazzo, preciso de
 * atendimento..."*. É o que faz a mensagem chegar à pessoa certa num número
 * único — quem lê do outro lado sabe para quem encaminhar sem perguntar.
 *
 * Nome desconhecido, vazio ou ausente cai no recado genérico, que diz de onde a
 * pessoa veio: *"Olá, estou vindo do site da Ingresso Ideal..."*. É o link
 * "Outros" do usuário, e é também a rede de segurança para o atendente novo que
 * o ERP cadastrar amanhã — ninguém fica sem botão por não estar na lista.
 */
function linkDoAtendimento(vendedor) {
    const chave = chaveDoAtendente(vendedor);
    const dono = ATENDENTES_COM_RECADO_PROPRIO
        .find(nome => chaveDoAtendente(nome) === chave);

    const recado = dono
        ? 'Olá ' + dono + ', preciso de atendimento...'
        : 'Olá, estou vindo do site da Ingresso Ideal, aguardo atendimento... 😀';

    return 'https://api.whatsapp.com/send?phone=' + WHATSAPP_DO_ATENDIMENTO
         + '&text=' + encodeURIComponent(recado);
}

function botaoDeAjuda(dados) {
    const pedido = (dados && dados.pedido) || {};

    // O botão existe SEMPRE, desde 25/08/2026.
    //
    // Antes ele dependia de `grafica.telefone` e sumia sem número — e num fixo
    // virava "Ligar para o meu atendimento", um `tel:` que no navegador embutido
    // do WhatsApp, que é por onde este link é aberto, é o pior lugar possível
    // para mandar alguém discar. Agora é sempre conversa, e o recado já vai
    // escrito.
    // O ÍCONE: por enquanto o `chat` do nosso traço.
    //
    // O usuário pediu a LOGO do WhatsApp. Marca de terceiro, neste projeto, é
    // arquivo -- é assim que estão SEDEX, VEPPO, São Miguel e Motoboy, todas em
    // `app-imagens` e listadas no `LOGO_DO_FRETE`. Procurei no bucket em
    // 25/08/2026: não há nenhuma imagem do WhatsApp lá.
    //
    // Desenhar a marca à mão aqui seria fazer o que este projeto não faz com
    // marca de ninguém — e o traço monocromático deste conjunto de ícones não
    // reproduz um logo colorido de qualquer modo. Assim que o arquivo estiver no
    // bucket, é trocar esta linha por um `<img>`, como faz o `logoDoFreteHtml`.
    return '<a class="portal-ajuda" href="' + escapeHtml(linkDoAtendimento(pedido.vendedor)) + '" '
         + 'target="_blank" rel="noopener noreferrer">'
         + iconeDaEntrega('chat', 18) + 'Falar com meu Atendimento</a>';
}

/**
 * As linhas do Envio, sem as de prazo quando o painel de chegada já as mostra.
 *
 * `linhasDoEnvio` continua devolvendo tudo -- ela é a função com teste, e é ela
 * que sabe das retiradas, dos prazos sem número e do rastreio. Quem escolhe o
 * que ENTRA na tela é esta camada: com o painel de chegada aberto no alto da
 * aba, repetir "Prazo de entrega: 7 dias úteis" seis linhas abaixo é o mesmo
 * número dito duas vezes, e o cliente para para conferir se são dois prazos
 * diferentes.
 */
function envioSemOsPrazos(dados, temPainelDeChegada) {
    const linhas = linhasDoEnvio(dados);
    if (!temPainelDeChegada) return linhas;
    return linhas.filter(l => String(l.rotulo || '').indexOf('Prazo') !== 0);
}

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
    // Na retirada não há perna de envio: somar um dia de transporte que não vai
    // acontecer daria ao cliente uma data pior do que a real, e ele viria buscar
    // um dia depois do que podia.
    if (ehRetirada(pedido, frete)) {
        const producao = prazoDeProducao(itens);
        linhas.push({
            rotulo: 'Prazo',
            valor: producao ? 'Produção: ' + producao : 'Combinado com seu atendimento',
            forte: !!producao,
            html: producao
                ? '<span style="font-weight: 700;">Produção: ' + escapeHtml(producao) + '</span>'
                  + '<span style="display: block; margin-top: 4px; color: var(--green); font-weight: 700;">'
                  + 'Pronto para retirada a partir de ' + escapeHtml(producao) + '</span>'
                : ''
        });
        if (pedido && pedido.volume) linhas.push({ rotulo: 'Volumes', valor: String(pedido.volume) });
        return linhas;
    }

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

/**
 * As linhas do endereço da gráfica, para os pedidos de retirada.
 *
 * Sem recebedor e sem CPF: quem busca é o próprio cliente, no balcão, e ali ele
 * se identifica em pessoa.
 */
function linhasDaGrafica(g) {
    if (!g) return [];
    const rua = (g.endereco || '').trim();
    const cidade = (g.cidade || '').trim();
    const uf = (g.uf || '').trim();

    return [
        { rotulo: 'Local', valor: (g.nome || 'Nossa gráfica').trim(), forte: true },
        { rotulo: 'Endereço', valor: rua ? rua + ', ' + (g.numero || 'S/N') : '' },
        { rotulo: 'Complemento', valor: (g.complemento || '').trim() },
        { rotulo: 'Bairro', valor: (g.bairro || '').trim() },
        { rotulo: 'Cidade/UF', valor: cidade && uf ? cidade + ' - ' + uf : (cidade || uf) },
        { rotulo: 'CEP', valor: cepEmMascara(g.cep) }
    ].filter(l => l.valor);
}

function desenharSecaoEntrega() {
    const secao = document.getElementById('secao-entrega');
    if (!secao) return;

    const dados = window.portalDados || {};
    const cliente = dados.cliente || null;
    const destino = enderecoDeEntrega(dados);

    // ── Retirada: o endereço é o da gráfica, com o mapa ─────────────────────
    //
    // Regra do usuário, 20/08/2026. Antes a aba mostrava o endereço do CLIENTE
    // num pedido de retirada, que é o contrário do que acontece: é ele que vem
    // até aqui. O mapa abre a rota a partir de onde ele estiver.
    if (destino.naGrafica) {
        const mapa = linkDoMapa(destino.endereco);
        const botao = mapa
            ? '<a class="portal-botao" style="margin-top: 14px;" href="' + escapeHtml(mapa) + '" '
              + 'target="_blank" rel="noopener noreferrer">' + iconeDaEntrega('pin', 17)
              + 'Ver rota no mapa</a>'
            : '';
        const corpo = destino.endereco
            ? '<div class="portal-aviso ok">Este pedido é para <b>retirada na gráfica</b>. '
              + 'Quando ele estiver pronto, é só vir buscar no endereço abaixo.</div>'
            : '<div class="portal-aviso calmo">Este pedido é para <b>retirada na gráfica</b>. '
              + 'Fale com seu atendimento para combinar o horário.</div>';

        const chegadaDaRetirada = cartaoDeChegada(dados);

        secao.innerHTML =
            chegadaDaRetirada
            + cartaoDeLinhas(tituloDoCartao('pin', 'Retirada na gráfica'), linhasDaGrafica(destino.endereco),
                'Fale com seu atendimento para combinar a retirada.', corpo + botao)
            + cartaoDeLinhas(tituloDoCartao('caminhao', 'Envio'),
                envioSemOsPrazos(dados, !!chegadaDaRetirada), '')
            + cartaoDeDecisao('entrega')
            + cartaoDeFinalizacao()
            + botaoDeAjuda(dados);
        return;
    }

    // ── Entrega no endereço do pedido ───────────────────────────────────────
    const endereco = enderecoEmLinhas(destino.endereco, cliente);

    // Nota de pessoa jurídica não empresta recebedor: aí o nome e o CPF de quem
    // recebe passam a ser obrigatórios, e a confirmação fica travada até o
    // cliente informar. A trava vem com a saída escrita ao lado — é a regra
    // desta casa: nada trava sem dizer o que fazer.
    const exige = entregaExigeRecebedor(destino.endereco, cliente, dados.pedido, dados.frete);
    const faltando = endereco.filter(l => l.falta).length;

    // O que falta vira uma LINHA COM O BOTÃO AO LADO, e não um aviso que manda
    // procurar outro botão.
    //
    // Até 25/08/2026 os dois avisos abaixo terminavam em "toque em ALTERAR
    // abaixo" -- e o ALTERAR fica noutro cartão, mais para baixo, depois de sete
    // linhas de endereço. A trava tinha a saída escrita, que é a regra desta
    // casa, mas a saída ficava a uma rolagem de distância do aviso.
    //
    // O botão daqui faz exatamente o que o ALTERAR faz (`decidirDados` com
    // `false`): abre a caixa de texto do cartão de decisão. Mesma porta, na
    // altura de quem leu o problema.
    const faltaComBotao = (titulo, explicacao) =>
        '<div class="portal-falta">'
        + iconeDaEntrega('alerta', 20, '#f97316')
        + '<span class="portal-falta-texto"><b>' + escapeHtml(titulo) + '</b>'
        + explicacao + '</span>'
        + '<button type="button" class="portal-falta-botao" '
        + 'onclick="decidirDados(\'entrega\', false)">Informar</button>'
        + '</div>';

    let aviso = '';
    if (exige) {
        aviso = faltaComBotao('Falta quem vai receber',
            'A nota deste pedido é de empresa (CNPJ), e a transportadora entrega na mão de '
            + 'uma pessoa — ela pede o nome e o CPF de quem recebe.');
    } else if (faltando) {
        aviso = faltaComBotao(faltando > 1 ? 'Faltam o nome e o CPF de quem recebe' : 'Falta um dado de quem recebe',
            'É o que a transportadora pede na hora da entrega.');
    }

    // O endereço que veio do cadastro, e não da escolha do pedido, se anuncia:
    // metade dos pedidos não traz endereço escolhido, e o cliente precisa saber
    // que aquilo é o principal do cadastro dele, e não uma decisão que alguém
    // tomou para este pedido.
    if (destino.endereco && destino.endereco.do_cadastro) {
        aviso = '<div class="portal-aviso calmo">Este é o <b>endereço principal</b> do seu '
              + 'cadastro. Se a entrega for em outro lugar, toque em <b>Alterar</b> abaixo '
              + 'e informe.</div>' + aviso;
    }

    const chegada = cartaoDeChegada(dados);

    secao.innerHTML =
        chegada
        + cartaoDeLinhas(tituloDoCartao('entrega', 'Endereço de entrega'), endereco,
            'O endereço de entrega ainda não foi definido neste pedido. '
            + 'Toque em Alterar abaixo e escreva o endereço, ou fale com seu atendimento.',
            aviso)
        + cartaoDeLinhas(tituloDoCartao('caminhao', 'Envio'),
            envioSemOsPrazos(dados, !!chegada), '')
        + cartaoDeDecisao('entrega', exige
            ? 'Informe o nome e o CPF de quem vai receber antes de confirmar.'
            : null)
        + cartaoDeFinalizacao()
        + botaoDeAjuda(dados);
}

registrarSecao('entrega', desenharSecaoEntrega);

window.desenharSecaoEntrega = desenharSecaoEntrega;
window.cartaoDeChegada = cartaoDeChegada;
window.envioSemOsPrazos = envioSemOsPrazos;
window.botaoDeAjuda = botaoDeAjuda;
window.tituloDoCartao = tituloDoCartao;
window.iconeDaEntrega = iconeDaEntrega;
window.linhasDoEnvio = linhasDoEnvio;
window.linhasDaGrafica = linhasDaGrafica;
window.cartaoDeLinhas = cartaoDeLinhas;
