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
 *   2. encerrar a sessão
 *   3. ir para o portão
 *
 * Invertidos os dois primeiros, uma falha no meio deixa o aparelho sem os dois:
 * sem conta para tentar de novo e sem token para trabalhar. O token vem primeiro
 * porque ele é o que não dá para recuperar — a conta o dono reabre digitando a
 * senha outra vez.
 */
(function () {
    'use strict';

    var CHAVE_TOKEN = 'ideal_portaria_token';

    /**
     * @param token  o token do aparelho, que o servidor devolveu UMA vez
     * @param nome   o nome do portão, só para a mensagem
     * @returns Promise que não resolve em caso de sucesso — a página navega.
     */
    function assumir(token, nome) {
        if (!token) {
            return Promise.reject(new Error('o servidor não devolveu o token deste aparelho'));
        }

        // 1. O token, primeiro. Falhar aqui é falhar antes de qualquer estrago:
        //    a conta continua aberta e o dono tenta de novo.
        try {
            localStorage.setItem(CHAVE_TOKEN, token);
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

        // 2. A sessão da conta sai do aparelho. `.catch` que segue adiante:
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
            // 3. `replace`, e não `href`: o portão não entra no histórico. Sem
            //    isso, o botão "voltar" do celular devolveria o porteiro à tela
            //    de configuração do dono.
            window.location.replace('portaria.html');
        });
    }

    window.aparelhoAqui = { assumir: assumir, CHAVE_TOKEN: CHAVE_TOKEN };
})();
