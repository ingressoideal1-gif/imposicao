/**
 * O toque na barra do evento.
 *
 * Tres caminhos, e a decisao entre eles e pura -- `decidirTroca` -- porque o
 * unico que perde dinheiro do cliente se errar e o da troca de evento com fila
 * pendente. Leitura enfileirada sob o token do evento A, enviada depois de o
 * aparelho virar portao do evento B, sobe contada no B: a contagem que o
 * cliente pagou para ter sai errada e ninguem descobre.
 *
 * Por que o portao nasce validando TODOS os setores: um portao sem setor
 * recusa tudo na porta, com o laranja de "outra porta", e o porteiro nao tem
 * como saber por que. O dono acabou de dizer que quer ler -- restringir e
 * escolha da engrenagem, feita depois e com calma.
 */
(function () {
    'use strict';

    /**
     * @param caso.pedido     o evento em que o dono tocou
     * @param caso.carregado  o evento cuja carga esta neste aparelho ('' se nenhum)
     * @param caso.naFila     quantas leituras ainda nao subiram
     * @returns 'ler' | 'trocar' | 'fila-cheia' | 'criar'
     */
    function decidirTroca(caso) {
        caso = caso || {};
        // Mesmo evento: a fila e DELE. Travar aqui pararia o portao por causa
        // de um 4G ruim -- que e exatamente quando a fila cresce.
        if (caso.pedido && caso.pedido === caso.carregado) { return 'ler'; }
        if (caso.naFila > 0) { return 'fila-cheia'; }
        return window.chaveiro.procurar(caso.pedido) ? 'trocar' : 'criar';
    }

    /**
     * O unico aviso desta tela, e ele fica FORA de todo bloco de estado: e o
     * que sobra visivel quando algo falha antes de a tela decidir o que
     * mostrar. Mesmo elemento que o `controle.js` usa para falhar no arranque.
     */
    function avisar(texto) {
        var aviso = document.getElementById('erro-arranque');
        if (!aviso) { return; }
        aviso.textContent = texto;
        aviso.classList.remove('sumindo');
    }

    /** Um botão dentro do aviso, na linha de ações. */
    function acao(rotulo, id, aoTocar) {
        var b = document.createElement('button');
        b.type = 'button';
        b.id = id;
        b.textContent = rotulo;
        b.addEventListener('click', aoTocar);
        return b;
    }

    /**
     * A fila travou o toque — e agora a tela oferece o que fazer a respeito.
     *
     * Ate 17/08/2026 esta funcao escrevia a frase e parava por ali, e a frase
     * mandava "espere a fila zerar". So que a fila SO sobe pela tela de leitura,
     * que esta trava impede de abrir: o dono ficou preso num circulo, com uma
     * leitura pendente e nada para tocar. Ver o cabecalho do `fila-presa.js`.
     *
     * @param n         quantas leituras estao presas
     * @param evento_id o evento que o dono quer abrir — e de quem se cobra a
     *                  senha para descartar
     * @param motivo    por que o envio automatico falhou ('' se nem tentou)
     */
    function avisarFilaCheia(n, evento_id, motivo) {
        var aviso = document.getElementById('erro-arranque');
        if (!aviso) { return; }
        aviso.textContent = window.filaPresa.frase(motivo, n);
        aviso.classList.remove('sumindo');

        var acoes = document.createElement('div');
        acoes.className = 'acoes-aviso';

        // Sem volta (aparelho revogado, ou sem token): "Tentar de novo" seria
        // mandar o dono repetir um gesto que nao tem como dar certo.
        if (!window.filaPresa.semVolta(motivo)) {
            acoes.appendChild(acao('Enviar agora', 'btn-enviar-fila', function () {
                aviso.textContent = 'Enviando…';
                aviso.classList.remove('sumindo');
                window.filaPresa.enviar().then(function () {
                    aviso.classList.add('sumindo');
                    return abrir(evento_id);      // a fila zerou: segue o toque
                }).catch(function (e) {
                    avisarFilaCheia(n, evento_id, (e && e.message) || 'servidor');
                });
            }));
        }

        acoes.appendChild(acao(
            n === 1 ? 'Descartar 1 leitura' : 'Descartar ' + n + ' leituras',
            'btn-descartar-fila',
            function () { descartarComSenha(n, evento_id); }
        ));

        aviso.appendChild(acoes);
    }

    /**
     * Descartar PERDE leitura, para sempre. Por isso custa a senha do dono.
     *
     * O porteiro esta com este celular na mao; sem a senha, um toque errado
     * apagaria a contagem que o cliente pagou para ter. A confirmacao diz o
     * numero exato, e nao "algumas": e o numero que some.
     */
    function descartarComSenha(n, evento_id) {
        var quantas = n === 1 ? '1 leitura' : n + ' leituras';
        if (!window.confirm('Descartar ' + quantas + ' que não subiram? '
                + 'Elas somem para sempre, e quem entrou por elas não será '
                + 'contado. Esta ação não tem volta.')) {
            return;
        }
        return window.Controle.comSenha(evento_id, function () {
            return window.filaPresa.descartar();
        }).then(function () {
            var aviso = document.getElementById('erro-arranque');
            if (aviso) { aviso.classList.add('sumindo'); }
            return abrir(evento_id);
        }).catch(function (e) {
            if (e && e.message === 'cancelado') { return; }
            avisar('Não consegui descartar a fila agora. Tente de novo em '
                 + 'instantes.');
        });
    }

    /** Todos os setores do evento, para o portao nascer lendo. */
    function todosOsSetores(painel) {
        return (painel.setores || []).map(function (s) { return s.id; });
    }

    /**
     * Cria o portao deste aparelho e assume.
     *
     * `aparelhoAqui.assumir` e quem encerra a sessao, na ordem que ja esta
     * resolvida la: token, signOut, navegar. Inverte-la nao da erro na tela --
     * da um aparelho sem conta e sem token no meio de um evento.
     */
    function criar(evento_id, sessao, elevacao) {
        var cabecalhos = {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + sessao.access_token,
            'X-Elevacao': elevacao.token,
            'X-Navegador': window.AcessoConta.navegadorId()
        };
        return window.AcessoConta.pedir('/eventos/' + evento_id, {
            headers: { Authorization: 'Bearer ' + sessao.access_token }
        }).then(function (painel) {
            // O numero conta os portoes que ja existem NO EVENTO, e nao neste
            // aparelho: o dono ve a lista inteira na engrenagem, e dois
            // "Portão 1" ali seriam indistinguiveis.
            var nome = 'Portão ' + ((painel.aparelhos || []).length + 1);
            return window.AcessoConta.pedir(
                '/eventos/' + evento_id + '/aparelhos/aqui',
                {
                    method: 'POST', headers: cabecalhos,
                    body: JSON.stringify({
                        nome: nome, setores: todosOsSetores(painel)
                    })
                }
            ).then(function (r) {
                // O chaveiro NAO e gravado aqui: quem grava e o
                // `aparelhoAqui.assumir`, onde a ordem esta protegida --
                // chaveiro e token primeiro, `signOut` depois, navegar por
                // ultimo. Gravar aqui e assumir ali seriam dois lugares
                // decidindo a mesma ordem, e um deles acabaria errado.
                return window.aparelhoAqui.assumir(r.token, r.nome, {
                    evento_id: evento_id,
                    nome_evento: painel.evento.nome_evento,
                    aparelho_id: r.id,
                    nome_portao: r.nome,
                    token: r.token
                });
            });
        });
    }

    function irLer() { window.location.href = 'portaria.html'; }

    /**
     * O toque na barra. `criar` exige senha; os outros dois nao — o aparelho
     * ja provou que e portao daquele evento quando o token foi guardado.
     */
    function abrir(evento_id, nome, jaTentouEsvaziar) {
        // O deposito TEM de estar carregado. Antes esta linha era
        // `window.portariaDeposito.contarFila()` direto, e a pagina que
        // esquecesse o `<script>` dele lancava aqui -- o toque na barra do
        // evento nao fazia nada, sem erro na tela e sem uma palavra. Aconteceu.
        //
        // E note o que NAO se faz aqui: tratar a ausencia como "fila zero".
        // Seria a leitura mais simples, e e a errada -- deixaria trocar de
        // evento com leitura pendente, que e exatamente a perda de contagem
        // que a trava abaixo existe para impedir. Sem o deposito, a resposta
        // certa e recusar e dizer por que.
        if (!window.portariaDeposito) {
            avisar('Não consegui conferir se há leituras pendentes neste '
                 + 'aparelho, e sem essa conferência não dá para abrir o '
                 + 'portão com segurança. Recarregue a tela; se continuar, '
                 + 'avise a gráfica.');
            return Promise.resolve();
        }

        return window.portariaDeposito.contarFila().catch(function () {
            return 0;                 // IndexedDB fora do ar: nao ha fila a proteger
        }).then(function (naFila) {
            var caminho = decidirTroca({
                pedido: evento_id,
                carregado: window.chaveiro.carregado(),
                naFila: naFila
            });

            if (caminho === 'ler') { return irLer(); }
            if (caminho === 'fila-cheia') {
                // TENTA ESVAZIAR PRIMEIRO, sem o dono pedir. Na maioria das
                // vezes a fila esta parada so porque nada a cutucou: quem envia
                // e o `sincronizar()` da tela de leitura, e o dono nem chegou
                // la. Um POST resolve, e o evento abre na sequencia.
                //
                // `jaTentouEsvaziar` fecha o ciclo: se por algum motivo o envio
                // disser que deu certo e a fila continuar cheia, a tela mostra o
                // aviso em vez de tentar para sempre.
                if (jaTentouEsvaziar) {
                    return avisarFilaCheia(naFila, evento_id, 'servidor');
                }
                var impede = window.filaPresa.impedimento();
                if (impede) {
                    return avisarFilaCheia(naFila, evento_id, impede);
                }
                return window.filaPresa.enviar().then(function () {
                    return abrir(evento_id, nome, true);
                }).catch(function (e) {
                    avisarFilaCheia(naFila, evento_id, (e && e.message) || 'servidor');
                });
            }
            if (caminho === 'trocar') {
                window.chaveiro.carregar(evento_id);
                // A carga do evento anterior sai junto: ela e do OUTRO evento,
                // e a portaria abriria com o nome velho no topo recusando
                // ingresso bom como "OUTRA PORTA". A mesma marca que o
                // `aparelho.js` ja usa.
                try { localStorage.setItem('ideal_portaria_reconfigurado', '1'); }
                catch (e) { /* aba anonima */ }
                return window.portariaDeposito.esquecerFila().then(irLer, irLer);
            }
            return window.Controle.comSenha(evento_id, function (sessao, elevacao) {
                return criar(evento_id, sessao, elevacao);
            }).catch(function (e) {
                // SEM este `catch`, uma senha que nao confere virava uma
                // promessa rejeitada e nada mais: o dono tocava no evento,
                // digitava, e o aparelho simplesmente nao reagia. Foi metade
                // do defeito que ele relatou em 16/08/2026.
                //
                // "cancelado" nao e falha: ele tocou em Cancelar e a lista ja
                // esta de volta na tela. Avisar ali seria acusar o proprio
                // usuario de um erro que ele nao cometeu.
                if (e && e.message === 'cancelado') { return; }
                avisar('Não consegui abrir o portão deste evento. '
                     + ((e && e.message) || 'Tente de novo em instantes.'));
            });
        });
    }

    window.virarPortao = { decidirTroca: decidirTroca, abrir: abrir, criar: criar };
})();
