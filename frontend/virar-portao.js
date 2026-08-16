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

    function avisarFilaCheia(n) {
        var aviso = document.getElementById('erro-arranque');
        aviso.textContent = (n === 1
            ? 'Há 1 leitura que ainda não subiu'
            : 'Há ' + n + ' leituras que ainda não subiram')
            + ' para o servidor. Conecte este aparelho à internet e espere a '
            + 'fila zerar antes de trocar de evento: o que ficou para trás '
            + 'seria contado no evento errado.';
        aviso.classList.remove('sumindo');
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
    function abrir(evento_id, nome) {
        return window.portariaDeposito.contarFila().catch(function () {
            return 0;                 // IndexedDB fora do ar: nao ha fila a proteger
        }).then(function (naFila) {
            var caminho = decidirTroca({
                pedido: evento_id,
                carregado: window.chaveiro.carregado(),
                naFila: naFila
            });

            if (caminho === 'ler') { return irLer(); }
            if (caminho === 'fila-cheia') { return avisarFilaCheia(naFila); }
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
            });
        });
    }

    window.virarPortao = { decidirTroca: decidirTroca, abrir: abrir, criar: criar };
})();
