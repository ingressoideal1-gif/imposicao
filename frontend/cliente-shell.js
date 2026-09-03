// ══════════════════════════════════════════════════════════════════════════
//  O casco do Portal do Pedido — o selo do status e as cinco abas
// ══════════════════════════════════════════════════════════════════════════
//
// Até 20/08/2026 esta página era um funil: só abria em `Enviar Arte` ou
// `Aguard. Aprovação`, e em qualquer outro status mostrava uma frase e acabava.
// Medido no banco naquele dia: 36 dos 50 links estavam num status em que ela não
// mostrava nada. O link que o cliente guardou no WhatsApp deixava de servir no
// dia seguinte à aprovação — justamente quando ele quer saber do prazo, do
// endereço e de como pagar.
//
// Agora ela é o Portal do Pedido: cinco seções sempre abertas, e a aprovação de
// arte é uma delas.
//
// ## Por que a barra fica no rodapé
//
// Quem abre este link é o cliente, no celular, pelo navegador embutido do
// WhatsApp. No rodapé, os cinco destinos ficam ao alcance do polegar; no topo,
// ele precisaria trocar a mão de posição a cada troca de aba. No desktop a mesma
// barra vira uma coluna à esquerda — é a mesma marcação, decidida no CSS.

/** As cinco seções, na ordem em que aparecem na barra. */
const SECOES = ['arte', 'entrega', 'faturamento', 'orcamento', 'pagamento'];

/** Quem desenha cada seção, registrado por ela mesma. */
const desenhistasDeSecao = {};

/** Seções já desenhadas: cada uma monta uma vez só. */
const secoesProntas = {};

/** A seção aberta agora. */
let secaoAtual = null;

/**
 * Texto sem acento e em caixa alta, para comparar status.
 *
 * A coluna `status_arte` é texto livre e foi escrita por três telas ao longo de
 * um ano: no banco convivem `Aguard. Aprovação` e `AGUARDANDO_APROVACAO`,
 * `EM PRODUCAO` e `EM IMPRESSÃO`. Comparar letra a letra deixaria o cliente
 * numa tela em branco por causa de um cedilha.
 */
function semAcento(texto) {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim()
        .toUpperCase();
}

/**
 * O status do pedido traduzido para o selo do cabeçalho.
 *
 * Devolve `{chave, texto, cor}`. A `chave` é o que o resto da página usa para
 * decidir o que mostrar; o `texto` é o que o cliente lê.
 *
 * Status desconhecido cai em `preparando` de propósito: um status novo escrito
 * pelo ERP não pode virar tela vazia na frente do cliente.
 */
function seloDoStatus(statusArte) {
    const s = semAcento(statusArte);

    if (s.indexOf('ENVIAR ARTE') >= 0 || s.indexOf('AGUARD') >= 0) {
        return { chave: 'aprovar', texto: 'Aguardando sua aprovação', cor: '#f59e0b' };
    }
    if (s.indexOf('ALTERAC') >= 0 || s.indexOf('CORRECAO') >= 0 || s.indexOf('REPROVAD') >= 0) {
        return { chave: 'correcao', texto: 'Alteração solicitada', cor: '#f97316' };
    }
    if (s.indexOf('APROVAD') >= 0) {
        return { chave: 'aprovado', texto: 'Artes aprovadas', cor: '#22c55e' };
    }
    if (s.indexOf('PRODUCAO') >= 0 || s.indexOf('IMPRESSAO') >= 0) {
        return { chave: 'producao', texto: 'Pedido em produção', cor: '#38bdf8' };
    }
    return { chave: 'preparando', texto: 'Arte em preparação', cor: '#94a3b8' };
}

/**
 * A ordem dos testes acima importa e não é alfabética:
 *
 * - `ALTERAC`/`REPROVAD` vem antes de `APROVAD` porque `REPROVADO` contém
 *   `PROVAD`, e um teste de `APROVAD` colocado antes engoliria a reprovação —
 *   o cliente que pediu alteração veria "Artes aprovadas".
 * - `AGUARD` vem primeiro porque `Aguard. Aprovação` também contém `APROVA`.
 */

/** Se o nome pode virar seção. O hash da URL é escrito por qualquer um. */
function secaoValida(nome) {
    return typeof nome === 'string' && SECOES.indexOf(nome) >= 0;
}

/**
 * Uma seção diz quem a desenha. Ela é chamada na primeira vez que a aba abre —
 * e não na carga da página: montar cinco seções de uma vez atrasaria a que o
 * cliente veio ver.
 */
function registrarSecao(nome, desenhista) {
    desenhistasDeSecao[nome] = desenhista;
}

/**
 * Abre uma seção. Não recarrega a página nem refaz consulta: os dados das cinco
 * abas vieram de uma chamada só, e estão em `window.portalDados`.
 */
function abrirSecao(nome) {
    if (!secaoValida(nome)) nome = 'arte';
    secaoAtual = nome;

    SECOES.forEach(s => {
        const secao = document.getElementById('secao-' + s);
        if (secao) secao.hidden = (s !== nome);
        const botao = document.querySelector('.portal-aba[data-abre="' + s + '"]');
        if (botao) {
            botao.classList.toggle('ativa', s === nome);
            botao.setAttribute('aria-current', s === nome ? 'true' : 'false');
        }
    });

    if (!secoesProntas[nome] && typeof desenhistasDeSecao[nome] === 'function') {
        secoesProntas[nome] = true;
        try {
            desenhistasDeSecao[nome]();
        } catch (e) {
            // Uma seção que quebra não pode levar as outras quatro junto.
            secoesProntas[nome] = false;
            console.error('[portal] a seção ' + nome + ' não desenhou:', e);
            const secao = document.getElementById('secao-' + nome);
            if (secao) {
                secao.innerHTML = '<div class="portal-cartao portal-vazio">'
                    + 'Não conseguimos mostrar esta parte agora. Recarregue a página; '
                    + 'se continuar, fale com seu atendimento.</div>';
            }
        }
    }

    // `replaceState` e não `location.hash`: trocar o hash direto empilha uma
    // entrada no histórico por aba visitada, e o botão Voltar do celular
    // passaria a percorrer abas em vez de sair da página.
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '#' + nome);
    }

    // A rolagem volta ao topo: a aba nova começa do começo.
    if (window.scrollTo) window.scrollTo(0, 0);

    // A trilha marca em azul a etapa que está aberta, então ela se redesenha a
    // cada troca de aba — depois do desenho da seção, para já ler o que a seção
    // tenha decidido na montagem.
    atualizarPainelDoPedido();
}

/** Marca uma seção para ser desenhada de novo na próxima abertura. */
function redesenharSecao(nome) {
    secoesProntas[nome] = false;
    if (secaoAtual === nome) abrirSecao(nome);
}

/**
 * O selo do status no cabeçalho — preenchido, e com um ponto na cor.
 *
 * Até 25/08/2026 ele era um contorno vazado: borda e texto na cor, fundo
 * transparente. No escuro do fundo da página, e na tela de um celular no sol,
 * âmbar (`aguardando aprovação`) e laranja (`alteração solicitada`) ficavam
 * indistinguíveis um do outro — e são justamente os dois estados em que o
 * cliente precisa fazer alguma coisa.
 *
 * O fundo tingido dá área de cor suficiente para o olho separar os dois, e o
 * ponto repete o estado num segundo canal: mesmo sem enxergar a diferença de
 * matiz, ele vê que há um marcador aceso. O texto continua sendo quem diz o
 * que é — cor nenhuma nesta página carrega informação sozinha.
 */
function pintarSeloDoStatus(statusArte) {
    const el = document.getElementById('portal-selo');
    if (!el) return;
    const selo = seloDoStatus(statusArte);

    // Montado por DOM, e não por `innerHTML`: o texto do selo é nosso, mas esta
    // função é chamada em toda troca de status, e um dia alguém passa por aqui
    // um texto vindo do banco. Assim isso nunca vira injeção.
    el.textContent = '';
    const ponto = document.createElement('span');
    ponto.className = 'portal-selo-ponto';
    ponto.style.background = selo.cor;
    el.appendChild(ponto);
    el.appendChild(document.createTextNode(selo.texto));

    el.style.color = selo.cor;
    el.style.borderColor = selo.cor;
    // `18` é o alfa em hexadecimal: ~9% de cor sobre o fundo escuro. Tingimento
    // suficiente para separar os estados, fraco o bastante para o texto na
    // mesma cor continuar legível por cima.
    el.style.background = selo.cor.length === 7 ? selo.cor + '22' : 'transparent';
    el.dataset.chave = selo.chave;
}

// ══════════════════════════════════════════════════════════════════════════
//  A trilha: as três etapas que fecham o pedido
// ══════════════════════════════════════════════════════════════════════════
//
// O Portal tem cinco abas, mas só TRÊS delas pedem alguma coisa do cliente:
// aprovar a arte, conferir a entrega e conferir os dados da nota. Orçamento e
// Pagamento são consulta.
//
// Até 25/08/2026 essa distinção não existia na tela. As cinco abas eram
// idênticas, e o que faltava só era dito DENTRO de cada uma, no fim da rolagem:
// o cliente que abrisse na aba de Orçamento não tinha como saber que havia duas
// conferências esperando por ele em outro lugar.
//
// A trilha mora fora das seções, acima de todas, e responde a pergunta antes de
// ele ter de procurar: quantas etapas faltam, e quais.

/** As três etapas, com o que já foi feito. */
function etapasDoPedido() {
    const c = window.portalConfirmacoes || {};

    // A arte usa a MESMA pergunta que o cartão de finalização faz — e não uma
    // conta paralela. Duas contas sobre a mesma coisa acabam divergindo, e o
    // cliente veria a trilha dizer "concluída" com o botão de finalizar ainda
    // travado por causa da arte.
    const arteFeita = typeof artesJaAprovadas === 'function' ? artesJaAprovadas() : false;

    // `null` é "ainda não decidiu"; `false` é "pediu alteração", que É uma
    // decisão — o pedido dele já está registrado e vai para o atendimento.
    const decidiu = v => v === true || v === false;

    // `acao` e `pronto` sao o VERBO da etapa, e nao o nome dela.
    //
    // "Entrega" e substantivo: diz de que a etapa trata, nao que ela espera
    // alguem. Medido no banco em 03/09/2026: 17 pedidos foram para a producao
    // com a arte aprovada e a conferencia de entrega e nota NUNCA feita -- e 14
    // deles tinham aberto o link duas vezes ou mais. Nenhum dos 88 links ativos
    // jamais pediu correcao de dados. O cliente chegava a ver a trilha; o que
    // ela nao dizia e que aquilo esperava por ele.
    return [
        { secao: 'arte',        nome: 'Arte',    feito: arteFeita,              acao: 'Aprovar',  pronto: 'Aprovada'  },
        { secao: 'entrega',     nome: 'Entrega', feito: decidiu(c.entrega),     acao: 'Conferir', pronto: 'Conferida' },
        { secao: 'faturamento', nome: 'Nota',    feito: decidiu(c.faturamento), acao: 'Conferir', pronto: 'Conferida' }
    ];
}

/**
 * A proxima etapa que ainda espera o cliente -- ou `null`, se nao falta nada.
 *
 * Uma so fonte para as tres coisas que precisam saber disso: a aba em que o
 * link abre, o cartao ambar no alto da aba da arte e o botao que leva adiante
 * no fim dela. Tres contas paralelas sobre "o que falta" acabariam divergindo.
 */
function proximaEtapaPendente() {
    return etapasDoPedido().find(e => !e.feito) || null;
}

/**
 * Em que aba o link ABRE.
 *
 * Ate 03/09/2026 era sempre a Arte: `montarPortal` so respeitava um `#hash`, e
 * o link que o cliente guardou no WhatsApp nao tem hash. Para quem ja aprovou,
 * isso significava cair numa aba onde nao ha nada a fazer e cujo cartao maior
 * diz "Pedido em producao" -- uma mensagem de tranquilidade ocupando a primeira
 * tela, enquanto o que falta aparecia como dois pontinhos de 9px no rodape.
 *
 * ## Por que isto NAO repete o erro que `seguirSozinhoSeAprovouTudo` evita
 *
 * Aquela funcao documenta que o avanco nunca pode ser decidido pelo ESTADO na
 * carga da pagina, e a razao e real: existem pedidos com todos os modelos em
 * `APROVADA` cujo status continua em `Aguard. Aprovacao`, e decidir por estado
 * levaria o cliente a APROVAR sem ter visto a arte.
 *
 * Trocar de aba nao aprova nada. Por isso a regra aqui e mais estreita do que
 * la: so quando o STATUS do pedido diz que a arte ja foi decidida
 * (`aprovado`/`producao`) -- e nunca a partir da contagem dos modelos, que e
 * justamente o dado que engana. Se a arte ainda espera decisao, abre na Arte.
 *
 * E a pagina AVISA que abriu sozinha, com o caminho de volta ao lado: o que o
 * sistema faz por conta propria precisa se anunciar.
 */
function secaoDeAbertura(statusArte) {
    const chave = seloDoStatus(statusArte).chave;
    if (chave !== 'aprovado' && chave !== 'producao') return 'arte';

    const proxima = proximaEtapaPendente();
    if (!proxima || proxima.secao === 'arte') return 'arte';
    return proxima.secao;
}

/**
 * O recado de que a pagina abriu sozinha numa aba que nao e a da Arte.
 *
 * Vai DENTRO da secao aberta, no topo, e traz o botao de volta a arte. Sem ele
 * o cliente que veio rever o ingresso acha que a arte sumiu -- que e justamente
 * o defeito que o Portal existe para nao ter.
 */
function anunciarAberturaAutomatica(secao) {
    const el = document.getElementById('secao-' + secao);
    if (!el) return;
    const icone = (nome, px, cor) => (typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '');

    el.insertAdjacentHTML('afterbegin',
        '<div class="portal-cartao portal-abertura">'
        + '<div class="portal-abertura-titulo">' + icone('check', 17, '#22c55e')
        + 'Sua arte já está aprovada</div>'
        + '<p class="portal-abertura-texto">Abrimos direto no que ainda falta você conferir. '
        + 'A sua arte continua aqui, na aba <b>Arte</b>.</p>'
        + '<button type="button" class="portal-botao" onclick="abrirSecao(\'arte\')">'
        + icone('arte', 17) + 'Ver minha arte</button>'
        + '</div>');
}

/** Desenha a trilha. Chamada em toda abertura de aba e a cada decisão. */
function desenharTrilha() {
    const caixa = document.getElementById('portal-trilha');
    if (!caixa) return;

    const etapas = etapasDoPedido();
    const feitas = etapas.filter(e => e.feito).length;
    const icone = (nome, px) => (typeof iconeCliente === 'function' ? iconeCliente(nome, px) : '');

    // AMBAR para o que falta, verde para o que foi feito -- e a aba aberta e
    // apenas contornada, em vez de pintada de azul.
    //
    // Ate 03/09/2026 pendente era CINZA aqui e AMBAR na barra de abas: duas
    // linguas para o mesmo estado, na mesma tela. Pior, o azul de "voce esta
    // aqui" vencia o cinza de "falta voce" justamente na etapa aberta, que e a
    // que mais precisa pedir acao. Onde o cliente esta, a barra de abas ja diz.
    const passos = etapas.map(e => {
        const estado = e.feito ? 'feito' : 'pendente';
        const aqui = e.secao === secaoAtual ? ' portal-passo-aqui' : '';
        return '<button type="button" class="portal-passo portal-passo-' + estado + aqui + '" '
             + 'data-abre="' + e.secao + '">'
             + icone(e.feito ? 'check' : 'relogio', 15)
             + '<span class="portal-passo-texto">'
             + '<b>' + e.nome + '</b>'
             + '<i>' + (e.feito ? e.pronto : e.acao) + '</i>'
             + '</span>'
             + '</button>';
    }).join('');

    caixa.innerHTML =
        '<div class="portal-trilha-topo">'
        + '<span class="portal-trilha-rotulo">Para fechar o pedido</span>'
        + '<span class="portal-trilha-conta' + (feitas < etapas.length ? ' falta' : '') + '">'
        + feitas + ' de 3 concluídas</span>'
        + '</div>'
        + '<div class="portal-trilha-barra">'
        + '<div class="portal-trilha-fill" style="width: ' + Math.round((feitas / 3) * 100) + '%;"></div>'
        + '</div>'
        + '<div class="portal-trilha-passos">' + passos + '</div>';

    // Cada etapa leva à aba dela: a trilha diz o que falta E é o caminho até
    // lá. Trilha que só informa obrigaria o cliente a traduzir "Nota" na aba
    // certa lá embaixo.
    caixa.querySelectorAll('.portal-passo').forEach(botao => {
        botao.addEventListener('click', () => abrirSecao(botao.dataset.abre));
    });

    caixa.hidden = false;
}

/**
 * O sinal de pendência em cima de cada aba.
 *
 * Três estados, e o terceiro é a ausência dos outros dois: ponto âmbar quando a
 * aba espera uma ação, visto verde quando já foi resolvida, e nada quando a aba
 * é só informação. Sem isso, as cinco abas são iguais e o cliente descobre o
 * que falta abrindo uma por uma.
 *
 * Pagamento só acende quando há de fato o que ele possa fazer AQUI: cobrança em
 * aberto com link que abre. Pedido faturado, ou cobrança sem link liberado, não
 * ganha ponto — um sinal de pendência que não tem botão do outro lado é só
 * cobrança em cima de quem não pode resolver.
 */
function atualizarSinaisDasAbas() {
    const etapas = etapasDoPedido();
    const sinais = {};
    etapas.forEach(e => { sinais[e.secao] = e.feito ? 'ok' : 'pendente'; });

    const dados = window.portalDados || {};
    const cobrancas = dados.pagamentos || [];
    if (typeof statusDoPagamento === 'function' && typeof podePagar === 'function') {
        const chave = statusDoPagamento(cobrancas).chave;
        if ((chave === 'aberto' || chave === 'parcial') && cobrancas.some(podePagar)) {
            sinais.pagamento = 'pendente';
        } else if (chave === 'pago') {
            sinais.pagamento = 'ok';
        }
    }

    SECOES.forEach(secao => {
        const botao = document.querySelector('.portal-aba[data-abre="' + secao + '"]');
        if (!botao) return;

        let marca = botao.querySelector('.portal-aba-sinal');
        const estado = sinais[secao];

        if (!estado) {
            if (marca) marca.remove();
            botao.removeAttribute('data-sinal');
            return;
        }

        if (!marca) {
            marca = document.createElement('span');
            marca.className = 'portal-aba-sinal';
            botao.insertBefore(marca, botao.firstChild);
        }
        botao.dataset.sinal = estado;
        marca.innerHTML = estado === 'ok' && typeof iconeClienteForte === 'function'
            ? iconeClienteForte('check', 11, '#22c55e')
            : '';
        // O rótulo do estado vai para quem não vê a cor: o leitor de tela lê
        // "Entrega, falta você" em vez de só "Entrega".
        marca.setAttribute('aria-label', estado === 'ok' ? 'já resolvida' : 'falta você');
        marca.setAttribute('role', 'img');
    });
}

/** A trilha e os sinais, juntos — o que muda a cada decisão do cliente. */
function atualizarPainelDoPedido() {
    desenharTrilha();
    atualizarSinaisDasAbas();
}

/**
 * Liga a barra de abas e abre a seção certa.
 *
 * O hash existe para o cliente poder recarregar sem voltar ao começo — e para o
 * atendente poder mandar o link já na aba que interessa.
 */
function montarPortal(statusArte) {
    pintarSeloDoStatus(statusArte);

    // Os ícones das abas e do lightbox: o HTML guarda só o NOME de cada um, e o
    // desenho vem do `icones-cliente.js`. Se aquele arquivo não carregar, as
    // abas ficam sem ícone e COM o rótulo escrito — que é o que o cliente
    // precisa para achar o destino.
    if (typeof pintarIconesDaPagina === 'function') pintarIconesDaPagina();

    document.querySelectorAll('.portal-aba').forEach(botao => {
        botao.addEventListener('click', () => abrirSecao(botao.dataset.abre));
    });

    // O hash manda quando existe: e por ele que o cliente recarrega sem voltar
    // ao comeco, e que o atendente manda o link ja na aba que interessa. Sem
    // hash -- o caso do link colado no WhatsApp --, quem decide e
    // `secaoDeAbertura`.
    const doHash = (window.location.hash || '').replace('#', '');
    const abertura = secaoValida(doHash) ? doHash : secaoDeAbertura(statusArte);
    abrirSecao(abertura);
    if (!secaoValida(doHash) && abertura !== 'arte') anunciarAberturaAutomatica(abertura);

    const barra = document.getElementById('portal-abas');
    if (barra) barra.hidden = false;
}

window.SECOES = SECOES;
window.seloDoStatus = seloDoStatus;
window.secaoValida = secaoValida;
window.registrarSecao = registrarSecao;
window.abrirSecao = abrirSecao;
window.redesenharSecao = redesenharSecao;
window.montarPortal = montarPortal;
window.etapasDoPedido = etapasDoPedido;
window.proximaEtapaPendente = proximaEtapaPendente;
window.secaoDeAbertura = secaoDeAbertura;
window.desenharTrilha = desenharTrilha;
window.atualizarSinaisDasAbas = atualizarSinaisDasAbas;
window.atualizarPainelDoPedido = atualizarPainelDoPedido;
