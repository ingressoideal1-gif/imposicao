// ══════════════════════════════════════════════════════════════════════════
//  As duas confirmações do cliente — entrega e faturamento
// ══════════════════════════════════════════════════════════════════════════
//
// Até 20/08/2026 os dois eram um cartão só, com um par de botões e um campo de
// texto, numa tela que aparecia DEPOIS de aprovar as artes. No Portal do Pedido
// eles viraram duas abas, e cada uma passou a ter a sua decisão: o atendente
// agora vê qual dos dois o cliente pediu para corrigir, em vez de um texto onde
// os dois assuntos se misturam.
//
// Isso não custou coluna nova. `pedidos_artes.observacoes` é jsonb, e as chaves
// `correcao_entrega` e `correcao_faturamento` entram ao lado da antiga
// `correcao_entrega_faturamento`, que continua sendo lida porque é ela que
// existe nos pedidos já gravados.
//
// O selo continua sendo um só, `entrega_dados`, que é o que o painel lê:
// as duas confirmadas → `APROVADO`; qualquer uma com correção → `CORRIGIR`.
// (`ALTERADO` não vem daqui: nasce do atendente girando o selo na Lista de
// Arte.)
// Desde 10/09/2026 cada clique salva a decisão em `confirmacoes_portal` nas
// observações. O segundo Confirmar aprova o selo conjunto sem Finalizar pedido.
//
// ## O cuidado que não pode ser perdido
//
// A linha do pedido em `pedidos_artes` precisa existir ANTES de o link ir ao
// cliente: esta página roda como `anon`, e a RLS recusa INSERT ali (42501).
// Quem cria é o painel, em `garantirLinhaDePedidoArte`. Por isso toda gravação
// daqui OLHA O RESULTADO: um UPDATE que não acha linha nenhuma responde 200 com
// `[]`, e o supabase-js não lança — foi assim que, por meses, o cliente viu
// "tudo certo" e o texto dele nunca existiu.

/** O que o cliente já decidiu, nesta visita. */
window.portalConfirmacoes = {
    entrega: null,          // true = confirmou, false = pediu alteração, null = ainda não decidiu
    faturamento: null,
    textoEntrega: '',
    textoFaturamento: ''
};
window.portalGravandoConfirmacao = false;
window.portalErroConfirmacao = {};

/**
 * O que o cliente já decidiu em VISITAS ANTERIORES, lido do banco.
 *
 * Até 25/08/2026 isto não existia: `portalConfirmacoes` nascia zerado a cada
 * abertura, e `clienteState.entregaStatus` -- que recebe `entrega_dados` na
 * carga -- não era lido em lugar nenhum do projeto. O dado estava na mão da
 * página e era jogado fora.
 *
 * O efeito para quem abre o link: o cliente confirma entrega e nota, finaliza,
 * fecha o WhatsApp; volta pelo mesmo link no dia seguinte para ver o prazo, e
 * lê "Para finalizar, falta: conferir os dados na aba Entrega; conferir os
 * dados na aba Nota". Ele refaz -- e o atendimento recebe uma SEGUNDA mensagem
 * no chat do pedido, idêntica à primeira.
 *
 * ## Os três selos, e por que só dois voltam
 *
 * `entrega_dados` guarda o resultado da conferência:
 *
 *   APROVADO   o cliente confirmou os dois. Volta como confirmado, e o pedido
 *              volta finalizado -- não há o que refazer.
 *   CORRIGIR   ele pediu alteração. Volta como alteração pedida, com o texto
 *              que ele escreveu, para ele reler o que mandou em vez de
 *              escrever de novo pelo WhatsApp.
 *   ALTERADO   NÃO volta. Este selo não vem do cliente: nasce do atendente
 *              girando o selo na Lista de Arte, justamente para pedir que ele
 *              confira de novo. Reidratar aqui apagaria o pedido do atendente.
 *
 * Qual dos dois cartões pediu correção sai das chaves de `observacoes`. A
 * chave antiga, `correcao_entrega_faturamento`, não distinguia os dois -- nos
 * pedidos gravados antes de 20/08/2026 ela marca os DOIS, que é o mais fiel
 * que dá para ser com um texto onde os dois assuntos se misturam.
 */
function reidratarConfirmacoes(portal) {
    const entrega = (portal && portal.entrega) || null;
    const selo = entrega && entrega.entrega_dados
        ? String(entrega.entrega_dados).trim().toUpperCase() : '';
    const c = window.portalConfirmacoes;
    let obs = (entrega && entrega.observacoes) || {};
    if (typeof obs === 'string') {
        try { obs = JSON.parse(obs); } catch (e) { obs = {}; }
    }
    if (typeof obs !== 'object' || !obs) obs = {};

    // ALTERADO pede uma nova conferência, mesmo havendo decisões antigas.
    if (selo === 'ALTERADO') return;
    const salvas = obs.confirmacoes_portal;
    if (salvas && typeof salvas === 'object' && salvas.selo === selo) {
        ['entrega', 'faturamento'].forEach(qual => {
            c[qual] = typeof salvas[qual] === 'boolean' ? salvas[qual] : null;
        });
        c.textoEntrega = String(obs.correcao_entrega || '');
        c.textoFaturamento = String(obs.correcao_faturamento || '');
        clienteState.pedidoFinalizado = salvas.finalizado === true;
        return;
    }
    if (selo !== 'APROVADO' && selo !== 'CORRIGIR') return;
    if (selo === 'APROVADO') {
        c.entrega = true;
        c.faturamento = true;
        clienteState.pedidoFinalizado = true;
        return;
    }

    const antiga = String(obs.correcao_entrega_faturamento || '').trim();
    const daEntrega = String(obs.correcao_entrega || '').trim() || antiga;
    const doFaturamento = String(obs.correcao_faturamento || '').trim() || antiga;

    // Sem texto nenhum, o selo CORRIGIR não diz de qual dos dois ele falava.
    // Marcar os dois seria inventar; deixar como está devolve as perguntas, que
    // é o comportamento seguro.
    if (!daEntrega && !doFaturamento) return;

    if (daEntrega) { c.entrega = false; c.textoEntrega = daEntrega; }
    if (doFaturamento) { c.faturamento = false; c.textoFaturamento = doFaturamento; }
    clienteState.pedidoFinalizado = true;
}

const ROTULO_DA_ABA = {
    entrega: { nome: 'entrega', titulo: 'Estes dados de entrega estão corretos?' },
    faturamento: { nome: 'faturamento', titulo: 'Estes dados para a nota fiscal estão corretos?' }
};

/** Se as artes deste pedido já foram aprovadas — pelo cliente, agora ou antes. */
function artesJaAprovadas() {
    const chave = seloDoStatus(clienteState.statusArte).chave;
    if (chave === 'aprovado' || chave === 'producao') return true;

    const itens = (state.osItens && state.osItens[clienteState.osId]) || [];
    return itens.length > 0 && itens.every(i => i.amostra_status === 'APROVADA');
}

/**
 * O cartão de decisão de uma aba: os dois botões, a caixa de texto e o estado.
 *
 * Confirmar permanece verde e passa a Confirmado depois da gravação.
 *
 * `bloqueio` é o texto do motivo pelo qual o CONFIRMAR não pode ser usado.
 */
function cartaoDeDecisao(qual, bloqueio) {
    const decidido = window.portalConfirmacoes[qual];
    const gravando = window.portalGravandoConfirmacao;
    const texto = window.portalConfirmacoes[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'];

    // Os ícones vêm desenhados do `icones-cliente.js`, e não como emoji: emoji é
    // fonte do aparelho de quem abre, muda de forma entre Android e iPhone e não
    // acompanha a cor do aviso ao redor. Sem o módulo, a frase sozinha continua
    // dizendo o que aconteceu.
    const icone = (nome, px, cor) => (typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '');

    let estado = '';
    if (decidido === true) {
        estado = '<div class="portal-aviso ok">' + icone('check', 16, '#22c55e') + ' Você confirmou estes dados. '
               + '<a href="#" onclick="desfazerDecisao(\'' + qual + '\'); return false;" '
               + 'style="color: var(--blue); margin-left: 6px;">Desfazer</a></div>';
    } else if (decidido === false) {
        estado = '<div class="portal-aviso atencao">' + icone('alerta', 16, '#f97316') + ' Você pediu alteração nestes dados. '
               + '<a href="#" onclick="desfazerDecisao(\'' + qual + '\'); return false;" '
               + 'style="color: var(--blue); margin-left: 6px;">Desfazer</a></div>';
    }

    const caixa = decidido === false
        ? '<div>'
            + '<textarea id="portal-correcao-' + qual + '" class="portal-caixa-de-texto" rows="4" '
            + 'placeholder="' + escapeHtml(bloqueio
                ? 'Escreva o nome completo e o CPF de quem vai receber o pedido...'
                : 'Escreva aqui o que precisa ser corrigido...') + '">' + escapeHtml(texto) + '</textarea>'
            + '<button type="button" class="portal-botao atencao" onclick="salvarCorrecaoDeDados(\'' + qual + '\')">'
            + icone('salvar', 17) + 'Salvar correção</button>'
            + '<div id="portal-recibo-' + qual + '" class="portal-vazio" style="margin-top: 8px;"></div>'
          + '</div>'
        : '';

    // `bloqueio` desliga o CONFIRMAR e diz por quê. Quem usa hoje é a aba de
    // Entrega, quando a nota é de empresa e ninguém informou quem recebe: sem
    // isso o cliente confirmaria um endereço que a transportadora não consegue
    // entregar, e o pacote voltaria — com frete.
    //
    // O ALTERAR continua vivo, porque é por ele que se sai da trava.
    const confirmar = bloqueio
        ? '<button type="button" class="portal-botao" disabled>' + icone('check', 17) + 'Confirmar</button>'
        : '<button type="button" class="portal-botao principal" aria-pressed="' + (decidido === true) + '" '
            + (gravando ? 'disabled ' : '') + 'onclick="decidirDados(\'' + qual + '\', true)">'
            + icone('check', 17) + (decidido === true ? 'Confirmado' : gravando === qual ? 'Salvando...' : 'Confirmar') + '</button>';
    const motivo = bloqueio
        ? '<div class="portal-vazio" style="margin-top: 10px;">' + escapeHtml(bloqueio) + '</div>'
        : '';

    return '<div class="portal-cartao">'
        + '<h2>' + escapeHtml(ROTULO_DA_ABA[qual].titulo) + '</h2>'
        + estado
        + (window.portalErroConfirmacao[qual]
            ? '<div class="portal-aviso atencao" role="alert">Não conseguimos salvar. Tente novamente.</div>' : '')
        + '<div class="portal-par-de-botoes">'
        + confirmar
        + '<button type="button" class="portal-botao" ' + (gravando ? 'disabled ' : '')
            + 'onclick="decidirDados(\'' + qual + '\', false)">' + icone('lapis', 17) + 'Alterar</button>'
        + '</div>'
        + motivo
        + caixa
        + '</div>';
}

/**
 * O cartão do fim: diz o que falta, e só libera o botão quando não falta nada.
 *
 * Ele aparece nas duas abas, com o mesmo texto, porque o cliente pode terminar
 * por qualquer uma das duas — e um botão que existe só na outra aba é um botão
 * que ele não acha.
 */
function cartaoDeFinalizacao() {
    const icone = (nome, px, cor) => (typeof iconeCliente === 'function' ? iconeCliente(nome, px, cor) : '');

    if (clienteState.pedidoFinalizado) {
        return '<div class="portal-cartao"><div class="portal-aviso ok">'
             + icone('check', 16, '#22c55e')
             + ' Tudo certo! Recebemos sua aprovação e a conferência dos seus dados. '
             + 'Qualquer dúvida, fale com seu atendimento.</div></div>';
    }

    const c = window.portalConfirmacoes;
    const dados = window.portalDados || {};
    const faltam = [];
    if (window.portalGravandoConfirmacao) faltam.push('aguardar a gravação dos dados');
    if (!artesJaAprovadas()) faltam.push('aprovar suas artes na aba <b>Arte</b>');
    // A exigência do recebedor só prende enquanto o cliente não usou o ALTERAR.
    //
    // Ela existe para ele não CONFIRMAR um endereço incompleto — e não para
    // trancá-lo na página. Quem escolheu ALTERAR já está mandando o nome e o CPF
    // pela caixa de texto, e o pedido vai para o atendimento com essa
    // solicitação: é a saída da trava, e toda trava desta casa tem uma.
    if (entregaExigeRecebedor(dados.endereco, dados.cliente, dados.pedido, dados.frete)
        && c.entrega !== false) {
        faltam.push('informar quem vai receber, na aba <b>Entrega</b>');
    } else if (c.entrega === null) {
        faltam.push('conferir os dados na aba <b>Entrega</b>');
    }
    if (c.faturamento === null) faltam.push('conferir os dados na aba <b>Nota</b>');

    if (faltam.length) {
        // `pendente`, e não `calmo`: o cliente pedia esta lista em cinza apagado
        // e não a via — o usuário mandou destacá-la em amarelo em 05/09/2026.
        // É a única coisa da página que ainda depende dele; cinza é para o que
        // não pede ação.
        return '<div class="portal-cartao">'
            + '<div class="portal-aviso pendente">Para finalizar, falta: ' + faltam.join('; ') + '.</div>'
            + '<button type="button" class="portal-botao" disabled>' + icone('check', 17)
            + 'Finalizar pedido</button>'
            + '</div>';
    }

    return '<div class="portal-cartao">'
        + '<button type="button" class="portal-botao principal" onclick="finalizarNoPortal()" '
        + 'id="portal-btn-finalizar">' + icone('check', 18) + 'Finalizar pedido</button>'
        + '</div>';
}

/** Uma decisão do cliente. Redesenha as duas abas: o cartão do fim é o mesmo. */
window.decidirDados = async function (qual, confirmou) {
    if (!Object.prototype.hasOwnProperty.call(ROTULO_DA_ABA, qual)
        || window.portalGravandoConfirmacao) return;
    const c = window.portalConfirmacoes;
    if (c[qual] === confirmou) {
        if (confirmou === true) abrirSecao(SECOES[SECOES.indexOf(qual) + 1]);
        return;
    }
    const dados = window.portalDados || {};
    if (qual === 'entrega' && confirmou === true
        && entregaExigeRecebedor(dados.endereco, dados.cliente, dados.pedido, dados.frete)) return;

    const proxima = Object.assign({}, c, { [qual]: confirmou });
    if (confirmou !== false) proxima[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'] = '';
    const selo = proxima.entrega === false || proxima.faturamento === false ? 'CORRIGIR'
        : proxima.entrega === true && proxima.faturamento === true ? 'APROVADO' : '';
    window.portalGravandoConfirmacao = qual;
    window.portalErroConfirmacao[qual] = false;
    redesenharSecao('entrega');
    redesenharSecao('faturamento');
    try {
        const gravacao = await gravarCorrecaoDoCliente(parseInt(clienteState.numero), {
            entrega: proxima.entrega === false ? (proxima.textoEntrega || '(sem detalhes)') : '',
            faturamento: proxima.faturamento === false ? (proxima.textoFaturamento || '(sem detalhes)') : ''
        }, selo, proxima);
        if (!gravacao.ok) throw new Error(gravacao.erro || 'Falha ao salvar');
        Object.assign(c, proxima);
        clienteState.entregaStatus = selo;
        clienteState.pedidoFinalizado = false;
    } catch (e) {
        window.portalErroConfirmacao[qual] = true;
    } finally {
        window.portalGravandoConfirmacao = false;
        redesenharSecao('entrega');
        redesenharSecao('faturamento');
        atualizarPainelDoPedido();
    }
    if (confirmou === true && !window.portalErroConfirmacao[qual]) {
        abrirSecao(SECOES[SECOES.indexOf(qual) + 1]);
    }
};

window.desfazerDecisao = function (qual) {
    return window.decidirDados(qual, null);
};

/**
 * O botão 💾 Salvar correção grava na hora, e diz a verdade sobre ter gravado.
 *
 * Falhas aparecem no recibo. A trava durante a gravação impede que outra
 * decisão sobrescreva as observações enquanto a correção está sendo salva.
 */
window.salvarCorrecaoDeDados = async function (qual) {
    if (window.portalGravandoConfirmacao) return;
    const campo = document.getElementById('portal-correcao-' + qual);
    const recibo = document.getElementById('portal-recibo-' + qual);
    const texto = campo ? campo.value.trim() : '';

    if (!texto) {
        if (recibo) recibo.textContent = 'Escreva o que precisa ser corrigido antes de salvar.';
        return;
    }

    window.portalConfirmacoes[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'] = texto;
    if (recibo) recibo.textContent = 'Salvando...';

    window.portalGravandoConfirmacao = qual;
    let gravacao;
    try {
        gravacao = await gravarCorrecaoDoCliente(
            parseInt(clienteState.numero),
            {
                entrega: window.portalConfirmacoes.textoEntrega,
                faturamento: window.portalConfirmacoes.textoFaturamento
            },
            null   // a decisão da aba já foi gravada no clique em Alterar
        );
    } catch (e) {
        gravacao = { ok: false };
    } finally {
        window.portalGravandoConfirmacao = false;
    }

    if (recibo) {
        recibo.innerHTML = gravacao.ok
            ? '✅ Correção salva.'
            : '⚠️ Não conseguimos salvar agora. Você ainda pode finalizar; '
              + 'depois avise seu atendimento sobre o pedido nº '
              + escapeHtml(String(clienteState.numero || '')) + '.';
    }
};

/**
 * O fim do caminho: grava o selo, escreve no chat do parceiro e mostra o
 * resultado.
 *
 * O `insert` no chat manda `autor_nome`, e não `remetente_nome`: a segunda não
 * existe naquela tabela, e o PostgREST recusa a linha inteira. Foi assim que
 * todas as nossas mensagens sumiram por meses, caladas — o supabase-js não
 * lança, então só olhando o `.error` se descobre.
 */
window.finalizarNoPortal = async function () {
    if (window.portalGravandoConfirmacao) return;
    window.portalGravandoConfirmacao = 'finalizar';
    const botao = document.getElementById('portal-btn-finalizar');
    if (botao) { botao.disabled = true; botao.textContent = '⏳ Finalizando...'; }

    const c = window.portalConfirmacoes;
    const precisaAtencao = (c.entrega === false || c.faturamento === false);

    let mensagem = '✅ O CLIENTE CONFIRMOU os dados de entrega e faturamento.';
    if (precisaAtencao) {
        mensagem = '⚠️ O CLIENTE REPORTOU DADOS INCORRETOS:';
        if (c.entrega === false) mensagem += '\n\n[ENTREGA] ' + (c.textoEntrega || '(sem detalhes)');
        if (c.faturamento === false) mensagem += '\n\n[FATURAMENTO] ' + (c.textoFaturamento || '(sem detalhes)');
    }

    let gravacao;
    try {
        gravacao = await gravarCorrecaoDoCliente(
            parseInt(clienteState.numero),
            { entrega: c.entrega === false ? (c.textoEntrega || '(sem detalhes)') : '',
              faturamento: c.faturamento === false ? (c.textoFaturamento || '(sem detalhes)') : '' },
            precisaAtencao ? 'CORRIGIR' : 'APROVADO',
            Object.assign({}, c, { finalizado: true })
        );
    } catch (e) {
        gravacao = { ok: false, erro: e.message || String(e) };
    }

    try {
        const { error: erroChat } = await supabaseClient.from('propostas_chat').insert({
            id_int: parseInt(clienteState.numero),
            tipo: 'PRODUCAO',
            setor: 'Cliente',
            visivel_externo: true,
            mensagem: mensagem,
            autor_nome: 'Cliente (aprovação online)'
        });
        if (erroChat) console.warn('[portal] o chat do parceiro recusou a mensagem:', erroChat.message || erroChat);
    } catch (e) { console.warn('[portal] falha ao registrar no chat do parceiro:', e); }

    try {
        const osId = clienteState.osId;
        if (osId && osId.startsWith('vibe_')) {
            await gravarStatusDoLink('APROVADO');
        } else if (osId) {
            await supabaseClient.from('producao_ordens_servico').update({ status: 'APROVADO' }).eq('id', osId);
        }
    } catch (e) {
        console.warn('[portal] não foi possível gravar o status do pedido:', e);
    }

    window.portalGravandoConfirmacao = false;
    clienteState.pedidoFinalizado = true;
    clienteState.statusArte = 'APROVADO';
    pintarSeloDoStatus('APROVADO');

    // ORDEM IMPORTA: redesenhar PRIMEIRO, avisar depois.
    //
    // `redesenharSecao` reescreve o `innerHTML` da seção aberta. Feito depois do
    // aviso, ele apagava o aviso no mesmo instante — e o que sumia era
    // justamente a mensagem que mais precisa ser lida: a de que a conferência
    // NÃO foi gravada, com o número do pedido para o cliente informar ao
    // atendimento.
    redesenharSecao('entrega');
    redesenharSecao('faturamento');
    atualizarPainelDoPedido();

    // Dizer "aprovado" quando a solicitação não entrou no banco é o pior dos
    // mundos: o cliente vai embora tranquilo e ninguém nunca leu o que ele
    // escreveu. Aqui ele fica sabendo, e fica sabendo o que fazer.
    if (!gravacao.ok) {
        console.error('[portal] a solicitação NÃO foi gravada:', gravacao.erro);
        avisoDeFinalizacao('alerta', '#f59e0b', 'Não conseguimos registrar sua conferência',
            'Sua aprovação de arte foi salva, mas <b>a conferência dos dados de entrega e '
            + 'faturamento não pôde ser gravada agora</b>.<br><br>Por favor, <b>entre em contato '
            + 'com o seu atendente</b> e informe o pedido nº '
            + escapeHtml(String(clienteState.numero || '')) + '.');
    } else if (precisaAtencao) {
        avisoDeFinalizacao('check', '#22c55e', 'Pedido finalizado',
            'Recebemos sua aprovação e sua solicitação de correção. '
            + '<b style="color: #f97316;">Como você pediu alteração nos dados, aguarde o contato '
            + 'do seu atendente.</b>');
    } else {
        avisoDeFinalizacao('check', '#22c55e', 'Pedido finalizado',
            'Recebemos sua aprovação e a conferência dos seus dados. '
            + 'Em breve seu pedido entra em produção.');
    }
};

/** O resultado do fim, escrito na aba aberta — e não numa tela que come a página. */
function avisoDeFinalizacao(nomeDoIcone, cor, titulo, texto) {
    const svg = typeof iconeCliente === 'function' ? iconeCliente(nomeDoIcone, 30, cor) : '';
    const html = '<div class="portal-cartao" style="text-align: center;">'
        + '<div style="width: 58px; height: 58px; margin: 0 auto; border-radius: 50%; '
        + 'display: flex; align-items: center; justify-content: center; '
        + 'background: ' + cor + '1f; border: 1px solid ' + cor + '59;">' + svg + '</div>'
        + '<h2 style="justify-content: center; border: 0; padding: 0; margin: 12px 0 6px;">'
        + escapeHtml(titulo) + '</h2>'
        + '<p class="portal-vazio" style="margin: 0;">' + texto + '</p>'
        + '</div>';
    ['entrega', 'faturamento'].forEach(qual => {
        const secao = document.getElementById('secao-' + qual);
        if (secao) secao.insertAdjacentHTML('afterbegin', html);
    });
}

window.reidratarConfirmacoes = reidratarConfirmacoes;
window.artesJaAprovadas = artesJaAprovadas;
window.cartaoDeDecisao = cartaoDeDecisao;
window.cartaoDeFinalizacao = cartaoDeFinalizacao;
