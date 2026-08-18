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
 *
 * ## O "Sim" NAO e um atalho para `virarPortao.criar`
 *
 * Ligar este aparelho a um evento tem duas travas que moram no
 * `virar-portao.js`, e as duas valem aqui: um aparelho que ja le OUTRO evento
 * com leitura pendente nao pode trocar de token -- as leituras do evento
 * anterior subiriam contadas no evento novo, e a contagem que o cliente pagou
 * para ter sai errada sem ninguem descobrir --, e um aparelho que ja le o
 * evento de DESTINO nao pode criar um segundo portao, que apareceria na lista
 * do dono como um "Aparelho 2" indistinguivel e deixaria o token antigo orfao.
 *
 * Por isso o que este arquivo pergunta depende do que ele encontra no
 * chaveiro. Ver `depoisDeCarregar`.
 *
 * ## Sem guarda de `window.<modulo>`
 *
 * Este arquivo chama `conta`, `meusPedidos`, `caixaConfirmar`, `virarPortao`,
 * `chaveiro`, `portariaDeposito`, `Controle` e `AcessoConta` direto, sem
 * `if (window.X)`. A pagina que o carrega e uma so -- o `controle.html` --, e
 * quem garante que os donos desses globais estao nela e um teste, o
 * `test_a_pagina_carrega_todo_modulo_que_os_scripts_dela_usam`. Meia guarda
 * seria pior que nenhuma: ela transforma "faltou um `<script>`" num caminho
 * silencioso -- a caixa abrindo por cima da casa, ou o bilhete de 15 minutos
 * indo para o lixo -- em vez de um erro que aparece.
 */
(function () {
    'use strict';
    var $ = function (id) { return document.getElementById(id); };

    /** O erro que ainda cabe NA CAIXA, porque ela continua na tela. */
    function erro(texto) {
        var e = $('erro-carregar');
        e.textContent = texto;              // frase do servidor ou nossa: TEXTO
        e.classList.remove('sumindo');
        window.botaoEspera.terminar($('btn-carregar-confirmar'));
    }

    /**
     * A frase de uma falha do POST.
     *
     * O `acesso-conta.js` inventa um "Erro N" quando o servidor nao manda frase
     * nenhuma, e esse e o unico texto que nao pode chegar ao cliente: ele nao
     * informa nem oferece saida. A comparacao e EXATA com o texto inventado --
     * adivinhar "isto parece uma frase?" jogaria fora mensagem legitima e curta
     * do servidor, como "senha nao confere". Mesma escolha do `meus-pedidos.js`.
     */
    function fraseDoErro(e) {
        if (!e || !e.status) {
            return 'Não consegui carregar o pedido agora. Confira a internet e tente de novo.';
        }
        if (e.message && e.message !== 'Erro ' + e.status) { return e.message; }
        return 'Não consegui carregar o pedido agora (código ' + e.status + ').';
    }

    /**
     * "Entrar libera 15 minutos": a caixa sem o campo da senha.
     *
     * Esconder o `<input>` sozinho nao serve. O olho de mostrar/ocultar envolve
     * cada campo de senha num `<span class="campo-senha">` criado EM TEMPO DE
     * EXECUCAO (`mostrar-senha.js`), e o botao "Mostrar" e irmao do input
     * dentro dele: escondendo so o input, o olho ficaria boiando sozinho na
     * caixa, ligado a um campo que ninguem ve. Por isso o alvo e o envoltorio
     * quando ele existe -- e o proprio campo quando nao existe, que e o caso de
     * uma pagina onde aquele arquivo nao rodou.
     *
     * O rotulo sai junto pelo mesmo motivo, e no lugar dos dois entra a frase
     * que explica a ausencia. Um campo que some sem explicacao faz a pessoa
     * procurar o que ela deveria digitar.
     */
    function envoltorioDaSenha() {
        var campo = $('carregar-senha');
        var pai = campo.parentNode;
        return (pai && pai.classList && pai.classList.contains('campo-senha'))
            ? pai : campo;
    }

    function mostrarCampoSenha(mostrar) {
        envoltorioDaSenha().classList.toggle('sumindo', !mostrar);
        var rotulo = document.querySelector('label[for="carregar-senha"]');
        if (rotulo) { rotulo.classList.toggle('sumindo', !mostrar); }
        $('carregar-sem-senha').classList.toggle('sumindo', !!mostrar);
    }

    /**
     * O campo esta fora da tela AGORA?
     *
     * Perguntado ao DOM, e nao deduzido de haver bilhete, porque as duas coisas
     * podem discordar -- ver o tratamento do 401 no fim deste arquivo.
     */
    function campoDaSenhaEscondido() {
        return envoltorioDaSenha().classList.contains('sumindo');
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
        $('carregar-data').value = dados.data_evento
            ? window.Controle.deISOParaCampo(dados.data_evento) : '';
        $('carregar-local').value = dados.local_evento || '';
        $('carregar-email').textContent = (sessao.user && sessao.user.email) || emailLembrado();
        $('carregar-senha').value = '';
        // Lido A CADA abertura, e nao guardado: o bilhete vence sozinho, e uma
        // caixa reaberta vinte minutos depois tem de voltar a pedir a senha.
        var liberado = !!window.AcessoConta.elevacaoConta();
        mostrarCampoSenha(!liberado);
        $('erro-carregar').classList.add('sumindo');
        // `terminar`, e nao so `disabled = false`: reabrir a caixa para um
        // pedido novo enquanto o toque ANTERIOR ainda espera resposta (ex.:
        // "Cancelar" no meio de uma rede lenta, seguido de outro pedido) nao
        // pode deixar o botao preso em "Carregando…" para sempre.
        window.botaoEspera.terminar($('btn-carregar-confirmar'));
        // Reposto a cada abertura: quem escolheu "Juntar ao evento", cancelou e
        // abriu a caixa de novo encontraria a ficha escondida, sem gesto nenhum
        // que a trouxesse de volta.
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
        // A senha e o ultimo campo, e o Enter dela e o gesto natural de
        // terminar. Sem isto o teclado do celular oferece "Ir" e nada acontece.
        // Mesma ligacao que a caixa de senha da configuracao ja tem.
        $('carregar-senha').onkeydown = function (ev) {
            if (ev.key === 'Enter') { $('btn-carregar-confirmar').click(); }
        };
        return preencherDestino(sessao).then(function () {
            // Sem campo na tela nao ha onde por o foco -- e roubar o foco de um
            // campo escondido tiraria o teclado de quem ainda pode querer
            // corrigir o nome do evento.
            if (!liberado) { $('carregar-senha').focus(); }
        });
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
        return window.meusPedidos.abrir();
    }

    /**
     * O pedido virou evento: o lugar de voltar e a CASA, com o evento novo na
     * lista -- e nao a lista de pedidos, de onde ele acabou de sair (e de onde
     * o servidor ja o tirou).
     */
    function voltarParaACasa() {
        return window.meusPedidos.fechar();
    }

    /**
     * O unico aviso que sobrevive fora dos blocos de estado.
     *
     * Da confirmacao em diante a caixa JA saiu da tela, e escrever no
     * `#erro-carregar` seria escrever numa caixa invisivel -- o mesmo defeito
     * que o `#aviso-gravacao` da engrenagem ja teve.
     */
    function avisarNaCasa(texto) {
        var aviso = $('erro-arranque');
        if (!aviso) { return; }
        aviso.textContent = texto;
        aviso.classList.remove('sumindo');
    }

    /** "Evento criado." ou "Pedido juntado ao evento X." -- sempre com ponto. */
    function fraseDoResultado(r) {
        if (r.novo) { return 'Evento criado. '; }
        return r.nome_evento
            ? 'Pedido juntado ao evento ' + r.nome_evento + '. '
            : 'Pedido juntado ao evento. ';
    }

    /**
     * Quantas leituras do OUTRO evento ainda nao subiram.
     *
     * Zero quando este aparelho nao le nada, e zero tambem quando ele ja le o
     * evento de destino -- nesse caso a fila e DELE, e travar ali pararia o
     * portao por causa de um 4G ruim, que e exatamente quando a fila cresce. A
     * mesma leitura que o `decidirTroca` faz.
     *
     * `-1` quando NAO DA para conferir. Sem o deposito na pagina, a resposta
     * certa nao e "fila zero": seria a leitura mais simples e a errada, e
     * deixaria trocar de evento com leitura pendente -- que e a perda de
     * contagem que esta trava existe para impedir.
     */
    function filaDeOutroEvento(evento_id) {
        var carregado = window.chaveiro.carregado();
        if (!carregado || carregado === evento_id) { return Promise.resolve(0); }
        if (!window.portariaDeposito) { return Promise.resolve(-1); }
        return window.portariaDeposito.contarFila().catch(function () {
            return 0;                  // IndexedDB fora do ar: nao ha fila a proteger
        });
    }

    function fraseDaFilaPresa(naFila) {
        if (naFila < 0) {
            return 'Não consegui conferir se este aparelho tem leituras pendentes, '
                 + 'e sem essa conferência não dá para ligá-lo a este evento com '
                 + 'segurança. Recarregue a tela; se continuar, avise a gráfica.';
        }
        return 'Este aparelho ainda tem ' + naFila
             + (naFila === 1 ? ' leitura' : ' leituras')
             + ' para enviar do evento que ele lê hoje. Depois que elas subirem, '
             + 'ligue-o a este evento pela barra dele em Meus Eventos.';
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
     *
     * @param nomeEscolhido  o nome que a pessoa digitou ou aceitou na caixa
     *                       (Task 6: "nome do aparelho na hora")
     * @param painel         o painel ja buscado para sugerir esse nome --
     *                       repassado para o `criar` nao pedir de novo
     */
    function ligarEsteAparelho(evento_id, sessao, elevacao, nomeEscolhido, painel) {
        if (elevacao) {
            return window.virarPortao.criar(evento_id, sessao, elevacao, nomeEscolhido, painel);
        }
        return window.Controle.comSenha(evento_id, function (s, e) {
            return window.virarPortao.criar(evento_id, s, e, nomeEscolhido, painel);
        });
    }

    /** GET /eventos/{id}, so para saber quantos aparelhos ja existem e
     * sugerir "Aparelho N" certo antes de perguntar. O `virarPortao.criar`
     * pediria o mesmo painel de novo -- por isso ele segue adiante em
     * `ligarEsteAparelho`, em vez de ser buscado duas vezes. */
    function contarAparelhos(evento_id, sessao) {
        return window.AcessoConta.pedir('/eventos/' + evento_id, {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        });
    }

    /** O nome deste celular, que vale em todos os eventos (usuario,
     * 18/08/2026); so quem nunca foi portao de nada estreia com "Aparelho N",
     * N = quantos o evento ja tem + 1. Mesma regra do `virar-portao.js`. */
    function sugestaoDeNome(painel) {
        var meu = window.chaveiro.nomeDoAparelho();
        if (meu) { return meu; }
        return 'Aparelho ' + (((painel && painel.aparelhos) || []).length + 1);
    }

    /**
     * O que oferecer depois de o pedido virar evento -- e sao TRES caminhos,
     * nao um.
     *
     * (a) Este aparelho JA le o evento de destino. Acontece exatamente no caso
     *     que o "juntar ao evento" existe para atender: o dono ja leu ontem, e
     *     agora carrega o pedido complementar. Criar outro portao aqui deixaria
     *     dois "Aparelho N" iguais na lista dele e um token orfao. O que falta
     *     e so ir ler.
     *
     * (b) Este aparelho le OUTRO evento e tem leitura pendente. Aqui nao ha
     *     pergunta a fazer: trocar o token agora faria as leituras do evento de
     *     ontem subirem contadas no evento de hoje, e ninguem descobriria. A
     *     tela diz quantas sao e por onde ligar depois -- uma trava sem saida
     *     escrita seria uma parede.
     *
     * (c) O caso comum: aparelho livre. Pergunta e liga.
     */
    function depoisDeCarregar(r, sessao) {
        var prefixo = fraseDoResultado(r);

        if (window.chaveiro.procurar(r.evento_id)) {
            return window.caixaConfirmar.perguntar(
                prefixo + 'Este aparelho já lê este evento. Quer ir para a leitura agora?',
                { rotulo: 'Ir para a leitura' }
            ).then(function (sim) {
                if (!sim) { return voltarParaACasa(); }
                // `abrir`, e nao `criar`: e ele que sabe distinguir "ja e este
                // evento" de "trocar" e de "fila cheia", e ja tem a saida
                // escrita para cada um.
                return window.virarPortao.abrir(r.evento_id, r.nome_evento);
            });
        }

        return filaDeOutroEvento(r.evento_id).then(function (naFila) {
            if (naFila !== 0) {
                return Promise.resolve(voltarParaACasa()).then(function () {
                    avisarNaCasa(fraseDaFilaPresa(naFila));
                });
            }
            // O painel busca ANTES de perguntar, so para a sugestao "Aparelho
            // N" saber o numero certo. Se o GET falhar, a pergunta segue com
            // "Aparelho 1" e sem `painel` nenhum -- o `criar` busca o dele de
            // verdade, porque um painel incompleto aqui viraria um portao com
            // os setores errados.
            return contarAparelhos(r.evento_id, sessao).catch(function () { return null; })
                .then(function (painel) {
                    return window.caixaConfirmar.perguntar(
                        prefixo + 'Quer usar este aparelho para ler os ingressos dele?',
                        {
                            rotulo: 'Sim, usar este aparelho',
                            campo: {
                                id: 'campo-nome-aparelho',
                                rotulo: 'Nome deste aparelho (vale para todos os eventos)',
                                valor: sugestaoDeNome(painel),
                                maxlength: 60
                            }
                        }
                    ).then(function (nomeEscolhido) {
                        if (!nomeEscolhido) { return voltarParaACasa(); }
                        return ligarEsteAparelho(r.evento_id, sessao, r.elevacao, nomeEscolhido, painel);
                    });
                });
        });
    }

    /** A unica saida quando o bilhete de 15 minutos nao serve mais: a senha. */
    var LIBERACAO_VENCEU = 'Sua liberação venceu. Digite a senha para continuar.';

    /** Traz o campo da senha de volta e pede a senha, com o motivo escrito. */
    function voltarAPedirASenha(texto) {
        window.AcessoConta.esquecerElevacaoConta();
        mostrarCampoSenha(true);
        // O que estava no campo escondido nao serve: ou nao havia nada, ou era
        // o que o gerenciador de senhas do navegador colou e o servidor acabou
        // de recusar. Deixa-lo ali faria a primeira tecla do dono ser digitada
        // NO FIM de uma senha errada.
        $('carregar-senha').value = '';
        $('carregar-senha').focus();
        return erro(texto);
    }

    function confirmar(pedido, sessao) {
        var senha = $('carregar-senha').value || '';
        var destino = $('carregar-destino').value || null;
        var nome = ($('carregar-nome').value || '').trim();
        // Relido AGORA, e nao o que valia quando a caixa abriu: ela pode ter
        // ficado aberta mais tempo do que o bilhete dura. A senha digitada tem
        // precedencia -- o servidor confere a que veio, e uma senha errada nao
        // pode passar calada por causa de uma liberacao aberta.
        var bilhete = senha ? null : window.AcessoConta.elevacaoConta();
        if (!senha && !bilhete) {
            // Com o campo escondido, "digite a senha" seria uma parede: a
            // liberacao venceu com a caixa aberta, e o campo precisa voltar
            // junto com o motivo. Ver a regra do projeto: toda trava diz na
            // propria tela como sair dela.
            var venceuAgora = campoDaSenhaEscondido();
            return voltarAPedirASenha(venceuAgora
                ? LIBERACAO_VENCEU
                : 'Digite a sua senha para carregar o pedido.');
        }
        if (!destino && !nome) { return erro('Dê um nome ao evento.'); }
        $('erro-carregar').classList.add('sumindo');
        window.botaoEspera.comecar($('btn-carregar-confirmar'), 'Carregando…');
        var corpo = {
            nome_evento: nome,
            // O `datetime-local` nao tem fuso nenhum: mandar o que ele entrega
            // faria o Postgres ler a hora do relogio do dono como UTC. Ver
            // `doCampoParaISO`.
            data_evento: window.Controle.doCampoParaISO($('carregar-data').value),
            local_evento: ($('carregar-local').value || '').trim() || null,
            evento_id: destino,
            navegador: window.AcessoConta.navegadorId()
        };
        var cabecalhos = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessao.access_token
        };
        if (bilhete) {
            // Sem `senha` NENHUMA no corpo: o campo vazio e o que faz o
            // servidor olhar para o bilhete. Mandar `senha: ''` junto seria
            // mandar uma senha errada.
            cabecalhos['X-Elevacao'] = bilhete.token;
            cabecalhos['X-Navegador'] = window.AcessoConta.navegadorId();
        } else {
            corpo.senha = senha;
        }
        // Os DOIS ramos do `then`, e nao um `.catch` no fim: sao dois mundos
        // diferentes. Enquanto o POST nao respondeu, a caixa esta na tela e o
        // motivo tem de aparecer NELA; depois que ele deu certo, a caixa sai, e
        // dali para a frente um aviso so e visto na casa.
        return window.AcessoConta.pedir('/pedidos/' + pedido + '/carregar', {
            method: 'POST',
            headers: cabecalhos,
            body: JSON.stringify(corpo)
        }).then(function (r) {
            window.botaoEspera.terminar($('btn-carregar-confirmar'));
            $('carregar-senha').value = '';
            $('caixa-carregar').classList.add('sumindo');
            // O bilhete de 15 minutos vai para o `controle.js`: a engrenagem
            // aberta em seguida nao pode pedir a senha de novo dentro dos
            // minutos que a pessoa acabou de comprar. Pode nao vir -- e ai nao
            // ha bilhete nenhum a entregar.
            if (r.elevacao) { window.Controle.receberElevacao(r.evento_id, r.elevacao); }
            return depoisDeCarregar(r, sessao).catch(function (e) {
                // O EVENTO ESTA CRIADO. Seja qual for a falha daqui -- rede,
                // senha recusada, ou o dono cancelando a caixa de senha --, a
                // casa e o lugar certo de parar: o evento novo esta la, e a
                // barra dele liga o aparelho de novo quando ele quiser.
                var voltou = voltarParaACasa();
                if (e && e.message === 'cancelado') { return voltou; }
                return Promise.resolve(voltou).then(function () {
                    avisarNaCasa('O pedido foi carregado, mas não consegui ligar este '
                        + 'aparelho: ' + ((e && e.message) || 'falha inesperada.')
                        + ' O evento está em Meus Eventos — toque na barra dele para '
                        + 'tentar de novo.');
                });
            });
        }, function (e) {
            // 401 COM O CAMPO ESCONDIDO e sempre um beco sem saida: a tela
            // recusa e nao oferece onde digitar. A pergunta e feita ao DOM, e
            // nao a variavel `bilhete`, porque as duas discordam num caso real:
            // `autocomplete="off"` e ignorado em campo de senha por quase todo
            // navegador, entao o gerenciador de senhas pode ter preenchido o
            // `#carregar-senha` escondido com uma senha VELHA. Ai `confirmar`
            // toma o ramo da senha (`bilhete` nulo), o servidor recusa, e sem
            // esta conferencia o motivo apareceria com o campo invisivel --
            // uma trava sem saida na propria tela, que e o que a regra do
            // projeto proibe.
            if (e && e.status === 401 && campoDaSenhaEscondido()) {
                return voltarAPedirASenha(LIBERACAO_VENCEU);
            }
            erro(fraseDoErro(e));
        });
    }

    window.carregarPedido = { abrir: abrir, fechar: fechar };
})();
