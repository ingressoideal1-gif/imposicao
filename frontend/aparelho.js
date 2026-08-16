/**
 * O momento em que este celular vira um portão.
 *
 * É um arquivo pequeno e sozinho porque o que ele faz tem uma ORDEM que não
 * pode sair errada, e ordem errada aqui não dá erro na tela — dá um aparelho
 * inútil no meio de um evento.
 *
 * ## Por que a sessão é encerrada
 *
 * Até 16/08/2026, pôr um portão no ar era: o dono criava o aparelho na tela
 * dele, o servidor sorteava um código de seis caracteres, e alguém digitava
 * esse código no celular do portão. O código existia por UMA razão — a senha do
 * dono nunca chegava ao celular que fica com o porteiro.
 *
 * Agora o dono digita a senha aqui, no próprio aparelho. Trocar o código pela
 * senha e DEIXAR a sessão aberta entregaria ao porteiro a conta inteira do
 * cliente: os eventos, a configuração, tudo. Encerrando a sessão, o aparelho
 * volta a ser o que era — um terminal com um token que só serve para ler
 * ingresso daquele evento, naqueles setores.
 *
 * ## A ordem
 *
 *   1. guardar o token
 *   2. gravar este portão no chaveiro
 *   3. encerrar a sessão
 *   4. ir para o portão
 *
 * O token vem primeiro porque ele é o que não dá para recuperar — sai do
 * servidor uma vez só. Invertidos os dois primeiros, uma falha no meio deixaria
 * o aparelho sem conta para tentar de novo e sem token para trabalhar; a conta,
 * o dono reabre digitando a senha outra vez.
 *
 * O chaveiro vem antes de a sessão sair porque, depois de encerrada, este
 * aparelho não tem mais como saber o nome do evento — e a barra dele apareceria
 * sem nome na tela inicial. Pior: gravado depois de uma falha ao encerrar, o
 * celular ficaria com token e sem entrada na lista, e o evento sumiria da tela
 * inicial do próprio portão que o está lendo.
 *
 * (O nome da função que encerra a sessão não aparece nesta abertura de
 * propósito: há teste que confere a ordem pela POSIÇÃO das duas no arquivo, e
 * citá-la aqui em cima faria esse teste medir o comentário em vez do código.)
 */
(function () {
    'use strict';

    var CHAVE_TOKEN = 'ideal_portaria_token';
    // O recado para a portaria: "a carga que está aí é de outro aparelho".
    var CHAVE_RECONFIG = 'ideal_portaria_reconfigurado';

    /**
     * @param token  o token do aparelho, que o servidor devolveu UMA vez
     * @param nome   o nome do portão, só para a mensagem
     * @param dados  a entrada do chaveiro deste aparelho:
     *               `{evento_id, nome_evento, aparelho_id, nome_portao, token}`
     * @returns Promise que não resolve em caso de sucesso — a página navega.
     */
    function assumir(token, nome, dados) {
        if (!token) {
            return Promise.reject(new Error('o servidor não devolveu o token deste aparelho'));
        }

        // 1. O token, primeiro. Falhar aqui é falhar antes de qualquer estrago:
        //    a conta continua aberta e o dono tenta de novo.
        try {
            localStorage.setItem(CHAVE_TOKEN, token);
            // Este celular pode já ter sido um portão — o mesmo, com outros
            // setores, ou até de outro evento. A carga guardada no IndexedDB é
            // do aparelho ANTERIOR: ela traz o nome do portão e a lista de
            // setores que ele valida. Sem esta marca, a portaria abriria com o
            // nome velho no topo e recusaria ingresso bom como "OUTRA PORTA",
            // sem nada na tela que explicasse por quê. Quem a lê é o arranque
            // do `portaria.js`, que baixa a carga de novo antes da primeira
            // leitura.
            localStorage.setItem(CHAVE_RECONFIG, '1');
        } catch (e) {
            // Aba anônima, armazenamento cheio. Sem `localStorage` não há
            // portaria possível -- ela guarda a carga do evento e a fila de
            // leituras. Melhor falhar aqui, com o dono na frente do aparelho,
            // do que no portão.
            return Promise.reject(new Error(
                'Este navegador não deixa guardar dados neste aparelho, e a '
                + 'portaria precisa disso para funcionar sem rede. Saia da aba '
                + 'anônima ou use outro navegador.'));
        }

        // 2. O chaveiro, antes de a conta sair. Encerrada a sessão, este
        //    aparelho não tem mais como saber o nome do evento -- e a barra
        //    dele apareceria sem nome na tela inicial do próprio portão que o
        //    está lendo. O `chaveiro.guardar` não lança: ele já engole a aba
        //    anônima por dentro.
        if (window.chaveiro && dados) {
            window.chaveiro.guardar(dados);
        }

        // 3. A sessão da conta sai do aparelho. `.catch` que segue adiante:
        //    o token já está guardado, e prender o dono numa tela de erro
        //    porque o `signOut` não respondeu seria pior -- a sessão expira
        //    sozinha, e a próxima abertura já vai direto para o portão.
        var saindo = Promise.resolve();
        try {
            if (typeof supabaseClient !== 'undefined' && supabaseClient) {
                saindo = supabaseClient.auth.signOut();
            }
        } catch (e) { /* sem cliente: não há sessão a encerrar */ }

        return saindo.catch(function () { }).then(function () {
            // 4. `replace`, e não `href`: o portão não entra no histórico. Sem
            //    isso, o botão "voltar" do celular devolveria o porteiro à tela
            //    de configuração do dono.
            window.location.replace('portaria.html');
        });
    }

    window.aparelhoAqui = { assumir: assumir, CHAVE_TOKEN: CHAVE_TOKEN };
})();
