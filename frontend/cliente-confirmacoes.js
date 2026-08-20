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
 * Os dois botões têm o mesmo peso visual de propósito. Pintar CONFIRMAR de
 * verde e ALTERAR de cinza empurra o cliente a confirmar sem ler — e é
 * exatamente aqui que ele deveria ler.
 *
 * `bloqueio` é o texto do motivo pelo qual o CONFIRMAR não pode ser usado.
 */
function cartaoDeDecisao(qual, bloqueio) {
    const decidido = window.portalConfirmacoes[qual];
    const texto = window.portalConfirmacoes[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'];

    let estado = '';
    if (decidido === true) {
        estado = '<div class="portal-aviso ok">✅ Você confirmou estes dados. '
               + '<a href="#" onclick="desfazerDecisao(\'' + qual + '\'); return false;" '
               + 'style="color: var(--blue); margin-left: 6px;">Desfazer</a></div>';
    } else if (decidido === false) {
        estado = '<div class="portal-aviso atencao">⚠️ Você pediu alteração nestes dados. '
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
            + '💾 Salvar correção</button>'
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
        ? '<button type="button" class="portal-botao" disabled>CONFIRMAR</button>'
        : '<button type="button" class="portal-botao" onclick="decidirDados(\'' + qual + '\', true)">CONFIRMAR</button>';
    const motivo = bloqueio
        ? '<div class="portal-vazio" style="margin-top: 10px;">' + escapeHtml(bloqueio) + '</div>'
        : '';

    return '<div class="portal-cartao">'
        + '<h2>' + escapeHtml(ROTULO_DA_ABA[qual].titulo) + '</h2>'
        + estado
        + '<div class="portal-par-de-botoes">'
        + confirmar
        + '<button type="button" class="portal-botao" onclick="decidirDados(\'' + qual + '\', false)">ALTERAR</button>'
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
    if (clienteState.pedidoFinalizado) {
        return '<div class="portal-cartao"><div class="portal-aviso ok">'
             + '✅ Tudo certo! Recebemos sua aprovação e a conferência dos seus dados. '
             + 'Qualquer dúvida, fale com seu atendimento.</div></div>';
    }

    const c = window.portalConfirmacoes;
    const dados = window.portalDados || {};
    const faltam = [];
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
        return '<div class="portal-cartao">'
            + '<div class="portal-aviso calmo">Para finalizar, falta: ' + faltam.join('; ') + '.</div>'
            + '<button type="button" class="portal-botao" disabled>FINALIZAR PEDIDO</button>'
            + '</div>';
    }

    return '<div class="portal-cartao">'
        + '<button type="button" class="portal-botao principal" onclick="finalizarNoPortal()" '
        + 'id="portal-btn-finalizar">✅ FINALIZAR PEDIDO</button>'
        + '</div>';
}

/** Uma decisão do cliente. Redesenha as duas abas: o cartão do fim é o mesmo. */
window.decidirDados = function (qual, confirmou) {
    window.portalConfirmacoes[qual] = confirmou;
    if (confirmou) {
        window.portalConfirmacoes[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'] = '';
    }
    redesenharSecao('entrega');
    redesenharSecao('faturamento');
};

window.desfazerDecisao = function (qual) {
    window.portalConfirmacoes[qual] = null;
    redesenharSecao('entrega');
    redesenharSecao('faturamento');
};

/**
 * O botão 💾 Salvar correção grava na hora, e diz a verdade sobre ter gravado.
 *
 * Falhar aqui NÃO prende o cliente: a decisão dele continua registrada na tela
 * e o botão de finalizar continua vivo. Ele fica sabendo pelo recibo abaixo da
 * caixa, com o que fazer — e é o botão final que avisa em letra grande se a
 * gravação não passou.
 */
window.salvarCorrecaoDeDados = async function (qual) {
    const campo = document.getElementById('portal-correcao-' + qual);
    const recibo = document.getElementById('portal-recibo-' + qual);
    const texto = campo ? campo.value.trim() : '';

    if (!texto) {
        if (recibo) recibo.textContent = 'Escreva o que precisa ser corrigido antes de salvar.';
        return;
    }

    window.portalConfirmacoes[qual === 'entrega' ? 'textoEntrega' : 'textoFaturamento'] = texto;
    if (recibo) recibo.textContent = 'Salvando...';

    const gravacao = await gravarCorrecaoDoCliente(
        parseInt(clienteState.numero),
        {
            entrega: window.portalConfirmacoes.textoEntrega,
            faturamento: window.portalConfirmacoes.textoFaturamento
        },
        null   // quem decide o selo é o botão final
    );

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

    const gravacao = await gravarCorrecaoDoCliente(
        parseInt(clienteState.numero),
        { entrega: c.entrega === false ? (c.textoEntrega || '(sem detalhes)') : '',
          faturamento: c.faturamento === false ? (c.textoFaturamento || '(sem detalhes)') : '' },
        precisaAtencao ? 'CORRIGIR' : 'APROVADO'
    );

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

    // Dizer "aprovado" quando a solicitação não entrou no banco é o pior dos
    // mundos: o cliente vai embora tranquilo e ninguém nunca leu o que ele
    // escreveu. Aqui ele fica sabendo, e fica sabendo o que fazer.
    if (!gravacao.ok) {
        console.error('[portal] a solicitação NÃO foi gravada:', gravacao.erro);
        avisoDeFinalizacao('⚠️', 'Não conseguimos registrar sua conferência',
            'Sua aprovação de arte foi salva, mas <b>a conferência dos dados de entrega e '
            + 'faturamento não pôde ser gravada agora</b>.<br><br>Por favor, <b>entre em contato '
            + 'com o seu atendente</b> e informe o pedido nº '
            + escapeHtml(String(clienteState.numero || '')) + '.');
    } else if (precisaAtencao) {
        avisoDeFinalizacao('✅', 'Pedido finalizado',
            'Recebemos sua aprovação e sua solicitação de correção. '
            + '<b style="color: #f97316;">Como você pediu alteração nos dados, aguarde o contato '
            + 'do seu atendente.</b>');
    } else {
        avisoDeFinalizacao('✅', 'Pedido finalizado',
            'Recebemos sua aprovação e a conferência dos seus dados. '
            + 'Em breve seu pedido entra em produção.');
    }
};

/** O resultado do fim, escrito na aba aberta — e não numa tela que come a página. */
function avisoDeFinalizacao(icone, titulo, texto) {
    const html = '<div class="portal-cartao" style="text-align: center;">'
        + '<div style="font-size: 2.6rem;">' + icone + '</div>'
        + '<h2 style="justify-content: center; border: 0; padding: 0; margin: 10px 0 6px;">'
        + escapeHtml(titulo) + '</h2>'
        + '<p class="portal-vazio" style="margin: 0;">' + texto + '</p>'
        + '</div>';
    ['entrega', 'faturamento'].forEach(qual => {
        const secao = document.getElementById('secao-' + qual);
        if (secao) secao.insertAdjacentHTML('afterbegin', html);
    });
}

window.artesJaAprovadas = artesJaAprovadas;
window.cartaoDeDecisao = cartaoDeDecisao;
window.cartaoDeFinalizacao = cartaoDeFinalizacao;
