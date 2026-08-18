/**
 * Carregar um pedido: a caixa, o POST e a pergunta do aparelho.
 *
 * O servidor devolve, junto com o evento, a elevacao de 15 minutos -- por isso
 * o "Sim, usar este aparelho" liga o aparelho SEM pedir a senha de novo. A
 * pessoa acabou de digitar a senha nesta mesma caixa, e cobrá-la duas vezes no
 * mesmo gesto seria pedir que ela a digitasse de pé, no portão, sem ganho
 * nenhum de segurança.
 *
 * ## Esta caixa NAO e um estado de topo
 *
 * Ela e um cartao DENTRO de "Meus Pedidos": abre escondendo `#meus-pedidos`, e
 * o "Cancelar" devolve a lista de pedidos -- nao a casa. Quem esconde tudo o
 * mais continua sendo a dona unica, `conta.esconderTelaInicial()`; este arquivo
 * NAO guarda uma copia da lista de blocos, que e o defeito que esta pagina ja
 * teve duas vezes -- dois donos sem contrato entre si, cada um sabendo de
 * metade dos blocos, e telas empilhadas como resultado.
 *
 * `caixa-carregar` esta no `DOS_OUTROS` do `conta.js` pelos dois papeis de
 * sempre: ser escondida quando uma tela de conta abre, e contar como "esta na
 * frente" quando ela fecha.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };

    function erro(texto) {
        var e = $('erro-carregar');
        e.textContent = texto;              // frase do servidor ou nossa: TEXTO
        e.classList.remove('sumindo');
        $('btn-carregar-confirmar').disabled = false;
    }

    function opcao(select, valor, rotulo) {
        var o = document.createElement('option');
        o.value = valor;
        o.textContent = rotulo;             // nome de evento e escrito por gente
        select.appendChild(o);
    }

    function emailLembrado() {
        try { return localStorage.getItem('ideal_control_email') || ''; }
        catch (e) { return ''; }
    }

    /**
     * "Criar um evento novo" ou juntar a um que ja existe.
     *
     * O padrao e o evento novo, e ele fica em primeiro na lista: e o caso
     * comum. Juntar existe para o pedido COMPLEMENTAR -- o cliente mandou
     * imprimir mais 500 pistas depois -- nao virar um segundo evento com a
     * mesma festa dentro.
     *
     * Evento FINALIZADO nao entra: ele ja aconteceu, e juntar um pedido a ele
     * criaria setor num evento que ninguem mais vai ler.
     *
     * Sem a lista, sobra "Criar um evento novo" -- que e o padrao. Uma falha
     * aqui nao pode impedir o carregamento: o dono ainda consegue fazer a coisa
     * mais provavel.
     */
    function preencherDestino(sessao) {
        var select = $('carregar-destino');
        select.innerHTML = '';
        opcao(select, '', 'Criar um evento novo');
        return window.AcessoConta.pedir('/meus-eventos', {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (r) {
            (r.eventos || []).forEach(function (ev) {
                if (ev.status === 'finalizado') { return; }
                opcao(select, ev.id, 'Juntar ao evento ' + ev.nome_evento);
            });
        }).catch(function () { /* sem a lista, so "evento novo" -- que e o padrao */ });
    }

    /**
     * @param pedido  o numero do pedido no ERP
     * @param sessao  a sessao da conta do cliente
     * @param dados   o cartao inteiro do pedido: `nome_evento`, `data_evento`,
     *                `local_evento` vindos da ficha da arte, ja editaveis
     */
    function abrir(pedido, sessao, dados) {
        dados = dados || {};
        // A DONA das telas primeiro, o nosso cartao depois. Ela esconde tambem
        // o `#caixa-carregar` (ele esta no `DOS_OUTROS`), entao a ordem inversa
        // o apagaria no mesmo gesto que o abriu -- foi assim que o
        // `meus-pedidos.js` errou antes.
        window.conta.esconderTelaInicial(true);
        $('carregar-titulo').textContent = 'Carregar o pedido ' + pedido;
        $('carregar-nome').value = dados.nome_evento || ('Pedido ' + pedido);
        $('carregar-data').value = dados.data_evento && window.Controle && window.Controle.deISOParaCampo
            ? window.Controle.deISOParaCampo(dados.data_evento) : '';
        $('carregar-local').value = dados.local_evento || '';
        $('carregar-email').textContent = (sessao.user && sessao.user.email) || emailLembrado();
        $('carregar-senha').value = '';
        $('erro-carregar').classList.add('sumindo');
        $('btn-carregar-confirmar').disabled = false;
        $('carregar-campos-novo').classList.remove('sumindo');
        $('caixa-carregar').classList.remove('sumindo');
        // `onclick`, e nao `addEventListener`: abrir a caixa para um segundo
        // pedido na mesma sessao da pagina empilharia ouvintes, e o toque
        // carregaria o pedido ANTERIOR junto.
        $('carregar-destino').onchange = function () {
            // Juntando a um evento que ja existe, o nome, a data e o local sao
            // os DELE. Deixar os campos a vista prometeria uma edicao que o
            // servidor ignora.
            $('carregar-campos-novo').classList.toggle('sumindo', !!$('carregar-destino').value);
        };
        $('btn-carregar-cancelar').onclick = function () { fechar(); };
        $('btn-carregar-confirmar').onclick = function () { confirmar(pedido, sessao); };
        return preencherDestino(sessao).then(function () { $('carregar-senha').focus(); });
    }

    /**
     * Cancelar volta para a LISTA DE PEDIDOS, e nao para a casa: e de la que a
     * pessoa veio, e o pedido continua la para ser carregado depois.
     *
     * `sumindo` em si mesmo ANTES de chamar quem quer que seja -- e o contrato
     * do `conta.js` para quem sai de cena.
     */
    function fechar() {
        $('caixa-carregar').classList.add('sumindo');
        $('carregar-senha').value = '';     // a senha nao fica na memoria do DOM
        if (window.meusPedidos) { return window.meusPedidos.abrir(); }
        window.conta.esconderTelaInicial(false);
    }

    /**
     * O pedido virou evento: o lugar de voltar e a CASA, com o evento novo na
     * lista -- e nao a lista de pedidos, de onde ele acabou de sair (e de onde
     * o servidor ja o tirou).
     */
    function voltarParaACasa() {
        if (window.meusPedidos) { return window.meusPedidos.fechar(); }
        window.conta.esconderTelaInicial(false);
    }

    /** O unico aviso que sobrevive fora dos blocos de estado. */
    function avisarNaCasa(texto) {
        var aviso = $('erro-arranque');
        if (!aviso) { return; }
        aviso.textContent = texto;
        aviso.classList.remove('sumindo');
    }

    /**
     * "Sim, usar este aparelho", nos dois mundos possiveis.
     *
     * Com a elevacao na resposta, liga direto -- a senha ja foi digitada. Sem
     * ela, `Controle.comSenha` pede a senha e eleva: o `elevacao` pode vir
     * `null` quando o servidor gravou o evento e falhou SO em emitir o bilhete
     * de 15 minutos. E uma resposta legitima, e nao um erro -- perder o
     * `evento_id` seria grave, perder a elevacao e recuperavel. Chamar o
     * `virarPortao.criar` com `null` ali mandaria `X-Elevacao: undefined`, o
     * servidor recusaria, e o dono veria o aparelho nao ligar sem nada para
     * fazer a respeito.
     */
    function ligarEsteAparelho(evento_id, sessao, elevacao) {
        if (elevacao) {
            return window.virarPortao.criar(evento_id, sessao, elevacao);
        }
        return window.Controle.comSenha(evento_id, function (s, e) {
            return window.virarPortao.criar(evento_id, s, e);
        });
    }

    function confirmar(pedido, sessao) {
        var senha = $('carregar-senha').value || '';
        var destino = $('carregar-destino').value || null;
        var nome = ($('carregar-nome').value || '').trim();
        if (!senha) { return erro('Digite a sua senha para carregar o pedido.'); }
        if (!destino && !nome) { return erro('Dê um nome ao evento.'); }
        $('erro-carregar').classList.add('sumindo');
        $('btn-carregar-confirmar').disabled = true;
        var corpo = {
            nome_evento: nome,
            // O `datetime-local` nao tem fuso nenhum: mandar o que ele entrega
            // faria o Postgres ler a hora do relogio do dono como UTC. Ver
            // `doCampoParaISO`.
            data_evento: window.Controle && window.Controle.doCampoParaISO
                ? window.Controle.doCampoParaISO($('carregar-data').value) : null,
            local_evento: ($('carregar-local').value || '').trim() || null,
            evento_id: destino,
            senha: senha,
            navegador: window.AcessoConta.navegadorId()
        };
        return window.AcessoConta.pedir('/pedidos/' + pedido + '/carregar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + sessao.access_token },
            body: JSON.stringify(corpo)
        }).then(function (r) {
            $('carregar-senha').value = '';
            $('caixa-carregar').classList.add('sumindo');
            // O bilhete de 15 minutos vai para o `controle.js`: a engrenagem
            // aberta em seguida nao pode pedir a senha de novo dentro dos
            // minutos que a pessoa acabou de comprar. Pode nao vir -- e ai nao
            // ha bilhete nenhum a entregar.
            if (r.elevacao && window.Controle && window.Controle.receberElevacao) {
                window.Controle.receberElevacao(r.evento_id, r.elevacao);
            }
            var frase = (r.novo ? 'Evento criado. ' : 'Pedido juntado ao evento ' + (r.nome_evento || '') + '. ')
                + 'Quer usar este aparelho para ler os ingressos dele?';
            return window.caixaConfirmar.perguntar(frase, { rotulo: 'Sim, usar este aparelho' })
                .then(function (sim) {
                    if (!sim) { return voltarParaACasa(); }
                    return ligarEsteAparelho(r.evento_id, sessao, r.elevacao)
                        .catch(function (e) {
                            // O EVENTO ESTA CRIADO. Seja qual for a falha daqui
                            // -- rede, senha recusada, ou o dono cancelando a
                            // caixa de senha --, a casa e o lugar certo de
                            // parar: o evento novo esta la, e a barra dele liga
                            // o aparelho de novo quando ele quiser.
                            var voltou = voltarParaACasa();
                            if (e && e.message === 'cancelado') { return voltou; }
                            return Promise.resolve(voltou).then(function () {
                                avisarNaCasa('O evento foi criado, mas não consegui ligar este aparelho: '
                                    + ((e && e.message) || 'tente pela barra do evento.'));
                            });
                        });
                });
        }).catch(function (e) {
            erro((e && e.message) || 'Não consegui carregar o pedido agora. Confira a internet e tente de novo.');
        });
    }

    window.carregarPedido = { abrir: abrir, fechar: fechar };
})();
